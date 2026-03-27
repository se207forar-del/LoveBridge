(function () {
  const state = {
    user: null,
    roomCode: "",
    pollingId: null
  };

  const $ = (s) => document.querySelector(s);

  const ui = {
    authSection: $("#auth-section"),
    gameSection: $("#game-section"),
    authMsg: $("#auth-msg"),
    roomCode: $("#room-code"),
    myCard: $("#my-card"),
    partnerCard: $("#partner-card"),
    checkinMsg: $("#checkin-msg"),
    giftMsg: $("#gift-msg"),
    telepathyMsg: $("#telepathy-msg"),
    clickMsg: $("#click-msg"),
    clickStatus: $("#click-status"),
    timerList: $("#timer-list"),
    petCard: $("#pet-card"),
    petMsg: $("#pet-msg"),
    decorCard: $("#room-decor-card"),
    decorMsg: $("#decor-msg")
  };

  function saveSession() {
    localStorage.setItem("lb_user", JSON.stringify(state.user));
  }

  function loadSession() {
    const raw = localStorage.getItem("lb_user");
    if (!raw) return;
    try {
      state.user = JSON.parse(raw);
    } catch (e) {
      localStorage.removeItem("lb_user");
    }
  }

  function clearSession() {
    state.user = null;
    state.roomCode = "";
    localStorage.removeItem("lb_user");
    stopPolling();
  }

  function setMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("ok", !!ok);
  }

  function switchAuthTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".auth-form").forEach((form) => {
      form.classList.toggle("active", form.id === `${tab}-form`);
    });
  }

  function render() {
    const loggedIn = !!state.user;
    ui.authSection.classList.toggle("hidden", loggedIn);
    ui.gameSection.classList.toggle("hidden", !loggedIn);

    if (!loggedIn) return;
    ui.roomCode.textContent = state.roomCode || state.user.roomCode || "尚未加入";
    renderPlayerCards(state.user.player || null, state.user.partner || null);
  }

  function renderPlayerCards(myData, partnerData) {
    ui.myCard.innerHTML = cardTemplate(myData, true);
    ui.partnerCard.innerHTML = cardTemplate(partnerData, false);
  }

  function cardTemplate(p, isMe) {
    if (!p) {
      return `<p>${isMe ? "你" : "對方"}尚未載入資料</p>`;
    }
    return `
      <div class="row">
        <div class="avatar">${escapeHtml(p.avatar || "🩷")}</div>
        <div>
          <strong>${isMe ? "你" : "伴侶"}：${escapeHtml(p.nickname || "未知")}</strong><br>
          <small>Lv.${num(p.level)} | EXP ${num(p.exp)}</small>
        </div>
      </div>
      <div class="stats">
        <div>HP：${num(p.hp)}</div>
        <div>MP：${num(p.mp)}</div>
        <div>好感：${num(p.affection)}</div>
        <div>帳號：${escapeHtml(p.username || "-")}</div>
      </div>
    `;
  }

  function renderPet(pet) {
    if (!ui.petCard) return;
    if (!pet) {
      ui.petCard.innerHTML = "<p>加入房間後會出現共養寵物。</p>";
      return;
    }

    ui.petCard.innerHTML = `
      <div class="row">
        <div class="avatar">${escapeHtml(pet.petType || "🐱")}</div>
        <div>
          <strong>${escapeHtml(pet.petName || "小可愛")}</strong><br>
          <small>Lv.${num(pet.level)} | EXP ${num(pet.exp)}</small>
        </div>
      </div>
      <div class="tiny">飽食度：${num(pet.hunger)} / 100</div>
      <div class="meter"><span style="width:${clampPct(pet.hunger)}%"></span></div>
      <div class="tiny">心情：${num(pet.mood)} / 100</div>
      <div class="meter"><span style="width:${clampPct(pet.mood)}%"></span></div>
    `;
  }

  function renderDecor(decor) {
    if (!ui.decorCard) return;
    if (!decor) {
      ui.decorCard.innerHTML = "<p>加入房間後會顯示小房間狀態。</p>";
      return;
    }
    ui.decorCard.innerHTML = `
      <p>主題：<strong>${escapeHtml(decor.theme || "溫馨粉色")}</strong></p>
      <p>裝飾分數：<strong>${num(decor.decorScore)}</strong></p>
      <p>最近裝飾：${escapeHtml(decor.lastDecorItem || "尚無")}</p>
    `;
  }

  function clampPct(v) {
    const n = num(v);
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function num(v) {
    return Number.isFinite(+v) ? +v : 0;
  }

  function requireLogin() {
    if (!state.user?.userId || !state.user?.token) throw new Error("請先登入");
  }

  function authPayload(extra = {}) {
    requireLogin();
    return {
      userId: state.user.userId,
      token: state.user.token,
      ...extra
    };
  }

  async function authedPost(resource, extra = {}) {
    return api.post(resource, authPayload(extra));
  }

  async function authedGet(resource, extra = {}) {
    return api.get(resource, authPayload(extra));
  }

  async function login(formData) {
    const data = await api.post("auth/login", Object.fromEntries(formData.entries()));
    state.user = data.data;
    state.roomCode = state.user.roomCode || "";
    saveSession();
    render();
    if (state.roomCode) {
      await fetchRoomState();
      startPolling();
    }
  }

  async function register(formData) {
    const data = await api.post("auth/register", Object.fromEntries(formData.entries()));
    setMsg(ui.authMsg, `註冊成功，請登入。你的初始頭像：${data.data.avatar}`, true);
    switchAuthTab("login");
  }

  async function joinRoom(roomCode) {
    const data = await authedPost("room/join", { roomCode });
    state.user.roomCode = data.data.roomCode;
    state.roomCode = data.data.roomCode;
    saveSession();
    render();
    await fetchRoomState();
    startPolling();
  }

  async function fetchRoomState() {
    requireLogin();
    if (!state.roomCode) return;
    const data = await authedGet("room/state", { roomCode: state.roomCode });

    const payload = data.data;
    state.user.player = payload.player;
    state.user.partner = payload.partner;
    state.user.roomCode = state.roomCode;
    saveSession();

    renderPlayerCards(payload.player, payload.partner);
    renderTimers(payload.timers || []);
    renderGameStatus(payload.games || {});
    renderPet(payload.pet || null);
    renderDecor(payload.sharedRoom || null);
  }

  function renderTimers(timers) {
    if (!timers.length) {
      ui.timerList.innerHTML = "<li>尚無倒數事件</li>";
      return;
    }
    ui.timerList.innerHTML = timers
      .map((t) => `<li>${escapeHtml(t.title)}：剩餘 <strong>${num(t.daysLeft)}</strong> 天（${escapeHtml(t.targetDate)}）</li>`)
      .join("");
  }

  function renderGameStatus(games) {
    if (games.telepathy?.resultText) {
      setMsg(ui.telepathyMsg, games.telepathy.resultText, games.telepathy.matched);
    }
    if (games.click?.resultText) {
      setMsg(ui.clickMsg, games.click.resultText, games.click.matched);
    }
    if (games.click?.statusText) {
      ui.clickStatus.textContent = games.click.statusText;
    }
  }

  function startPolling() {
    stopPolling();
    state.pollingId = setInterval(fetchRoomState, 3000);
  }

  function stopPolling() {
    if (state.pollingId) {
      clearInterval(state.pollingId);
      state.pollingId = null;
    }
  }

  async function checkin() {
    const data = await authedPost("checkin/claim");
    setMsg(ui.checkinMsg, `${data.message}（EXP +${data.data.rewardExp}）`, true);
    await fetchRoomState();
  }

  async function drawGift() {
    const data = await authedPost("gifts/draw", { roomCode: state.roomCode });
    setMsg(ui.giftMsg, `抽到【${data.data.rarity}】${data.data.cardName}，${data.data.effectText}`, true);
    await fetchRoomState();
  }

  async function addTimer(formData) {
    await authedPost("timers/create", {
      roomCode: state.roomCode,
      ...Object.fromEntries(formData.entries())
    });
    await fetchRoomState();
  }

  async function chooseTelepathy(choice) {
    const data = await authedPost("game/telepathy/choose", {
      roomCode: state.roomCode,
      choice
    });
    setMsg(ui.telepathyMsg, data.message, !!data.data?.matched);
    await fetchRoomState();
  }

  async function clickSync() {
    const data = await authedPost("game/click/tap", {
      roomCode: state.roomCode,
      clientTs: Date.now()
    });
    setMsg(ui.clickMsg, data.message, !!data.data?.matched);
    await fetchRoomState();
  }

  async function feedPet(food) {
    const data = await authedPost("pet/feed", { roomCode: state.roomCode, food });
    setMsg(ui.petMsg, data.data?.message || data.message, true);
    await fetchRoomState();
  }

  async function decorateRoom(item) {
    const data = await authedPost("pet/decorate", { roomCode: state.roomCode, item });
    setMsg(ui.decorMsg, data.data?.message || data.message, true);
    await fetchRoomState();
  }

  function bindEvents() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchAuthTab(btn.dataset.tab));
    });

    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await login(new FormData(e.currentTarget));
        setMsg(ui.authMsg, "登入成功", true);
      } catch (err) {
        setMsg(ui.authMsg, err.message);
      }
    });

    $("#register-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await register(new FormData(e.currentTarget));
      } catch (err) {
        setMsg(ui.authMsg, err.message);
      }
    });

    $("#room-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = $("#room-code-input").value.trim();
      try {
        await joinRoom(code);
      } catch (err) {
        alert(err.message);
      }
    });

    $("#checkin-btn").addEventListener("click", async () => {
      try {
        await checkin();
      } catch (err) {
        setMsg(ui.checkinMsg, err.message);
      }
    });

    $("#draw-btn").addEventListener("click", async () => {
      try {
        await drawGift();
      } catch (err) {
        setMsg(ui.giftMsg, err.message);
      }
    });

    $("#timer-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await addTimer(new FormData(e.currentTarget));
        e.currentTarget.reset();
      } catch (err) {
        alert(err.message);
      }
    });

    $("#telepathy-choices").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-choice]");
      if (!btn) return;
      try {
        await chooseTelepathy(btn.dataset.choice);
      } catch (err) {
        setMsg(ui.telepathyMsg, err.message);
      }
    });

    $("#click-btn").addEventListener("click", async () => {
      try {
        await clickSync();
      } catch (err) {
        setMsg(ui.clickMsg, err.message);
      }
    });

    $("#feed-btn")?.addEventListener("click", async (e) => {
      try {
        await feedPet(e.currentTarget.dataset.food || "魚肉罐頭");
      } catch (err) {
        setMsg(ui.petMsg, err.message);
      }
    });

    $("#feed-snack-btn")?.addEventListener("click", async (e) => {
      try {
        await feedPet(e.currentTarget.dataset.food || "小餅乾");
      } catch (err) {
        setMsg(ui.petMsg, err.message);
      }
    });

    $("#decor-choices")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-item]");
      if (!btn) return;
      try {
        await decorateRoom(btn.dataset.item);
      } catch (err) {
        setMsg(ui.decorMsg, err.message);
      }
    });

    $("#logout-btn").addEventListener("click", () => {
      clearSession();
      render();
    });
  }

  async function boot() {
    bindEvents();
    loadSession();
    render();

    if (state.user?.userId && state.user?.token) {
      state.roomCode = state.user.roomCode || "";
      if (state.roomCode) {
        try {
          await fetchRoomState();
          startPolling();
        } catch (e) {
          console.warn(e);
          clearSession();
          render();
        }
      }
    }
  }

  boot();
})();
