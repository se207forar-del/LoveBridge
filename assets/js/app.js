(function () {
  const state = {
    user: null,
    roomCode: "",
    pollingId: null,
    currentView: "home"
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
    drawRemain: $("#draw-remain"),
    drawResult: $("#draw-result"),
    telepathyMsg: $("#telepathy-msg"),
    clickMsg: $("#click-msg"),
    clickStatus: $("#click-status"),
    timerList: $("#timer-list"),
    petCard: $("#pet-card"),
    petMsg: $("#pet-msg"),
    decorCard: $("#room-decor-card"),
    decorMsg: $("#decor-msg"),
    inventoryList: $("#inventory-list"),
    roomPanel: $("#room-panel"),
    hubGrid: $("#hub-grid"),
    navButtons: Array.from(document.querySelectorAll(".nav-btn")),
    viewPanels: Array.from(document.querySelectorAll(".view-panel")),
    statusRoom: $("#status-room"),
    statusSync: $("#status-sync"),
    mobileStatus: $("#mobile-status"),
    mobileTime: $("#mobile-time"),
    drawModal: $("#draw-modal"),
    drawStage: $("#draw-stage"),
    drawCard: $("#draw-card")
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
    ui.mobileStatus?.classList.toggle("hidden", !loggedIn);

    if (!loggedIn) return;
    setActiveView("home", true);
    ui.roomCode.textContent = state.roomCode || state.user.roomCode || "尚未加入";
    if (ui.statusRoom) ui.statusRoom.textContent = `房號：${state.roomCode || state.user.roomCode || "--"}`;
    if (ui.roomPanel) ui.roomPanel.classList.remove("hidden");
    renderPlayerCards(state.user.player || null, state.user.partner || null);
  }

  function setSyncBadge(type, text) {
    if (!ui.statusSync) return;
    ui.statusSync.classList.remove("syncing", "ok", "error");
    ui.statusSync.classList.add(type);
    ui.statusSync.textContent = text;
  }

  function setActiveView(view, immediate = false) {
    const order = { home: 0, daily: 1, pet: 2, games: 3 };
    const prev = state.currentView || "home";
    const left = (order[view] ?? 0) < (order[prev] ?? 0);
    state.currentView = view;

    ui.navButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    ui.viewPanels.forEach((panel) => {
      panel.classList.remove("slide-left");
      const active = panel.dataset.view === view;
      panel.classList.toggle("active", active);
      if (active && !immediate && left) {
        panel.classList.add("slide-left");
      }
    });
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
        <div class="avatar pet-emoji" id="pet-emoji">${escapeHtml(pet.petType || "🐱")}</div>
        <div>
          <strong>${escapeHtml(pet.petName || "小可愛")}</strong><br>
          <small>Lv.${num(pet.level)} | EXP ${num(pet.exp)}</small>
        </div>
      </div>
      <div class="tiny">飽食度：${num(pet.hunger)} / 100</div>
      <div class="meter"><span style="width:${clampPct(pet.hunger)}%"></span></div>
      <div class="tiny">心情：${num(pet.mood)} / 100</div>
      <div class="meter"><span style="width:${clampPct(pet.mood)}%"></span></div>
      <div class="tiny">${escapeHtml(pet.reaction || "喵～")}</div>
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
    try {
      return await api.post(resource, authPayload(extra));
    } catch (err) {
      handleAuthFailure(err);
      throw err;
    }
  }

  async function authedGet(resource, extra = {}) {
    try {
      return await api.get(resource, authPayload(extra));
    } catch (err) {
      handleAuthFailure(err);
      throw err;
    }
  }

  function handleAuthFailure(err) {
    const msg = String(err?.message || "");
    if (msg.includes("登入逾期") || msg.includes("登入狀態失效")) {
      clearSession();
      render();
      setMsg(ui.authMsg, "登入已失效，請重新登入。");
    } else {
      setSyncBadge("error", "連線異常");
    }
  }

  async function login(formData) {
    const data = await api.post("auth/login", Object.fromEntries(formData.entries()));
    state.user = data.data;
    state.roomCode = state.user.roomCode || "";
    saveSession();
    render();
    if (state.roomCode) {
      await fetchRoomState();
      await loadInventory();
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
    await loadInventory();
    startPolling();
  }

  async function fetchRoomState() {
    requireLogin();
    if (!state.roomCode) return;
    setSyncBadge("syncing", "同步中");
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
    if (ui.drawRemain) {
      ui.drawRemain.textContent = `今日剩餘抽卡次數：${num(payload.daily?.drawRemaining)}`;
    }
    if (ui.roomPanel) {
      ui.roomPanel.classList.toggle("hidden", !!payload.roomMeta?.paired);
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    setSyncBadge("ok", `已同步 ${hh}:${mm}:${ss}`);
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
    const rarity = String(data.data.rarity || "N").toLowerCase();
    await playDrawAnimation(data.data);
    ui.drawResult?.classList.remove("hidden", "n", "r", "sr", "ssr");
    ui.drawResult?.classList.add(rarity);
    if (ui.drawResult) {
      ui.drawResult.innerHTML = `\n        <strong>【${escapeHtml(data.data.rarity)}】${escapeHtml(data.data.cardName)}</strong><br>\n        <small>${escapeHtml(data.data.effectText)}</small>\n      `;
    }
    setMsg(ui.giftMsg, `已加入物品庫，可送給伴侶或用在寵物。`, true);
    if (ui.drawRemain) ui.drawRemain.textContent = `今日剩餘抽卡次數：${num(data.data.drawRemaining)}`;
    await loadInventory();
    await fetchRoomState();
  }

  async function playDrawAnimation(item) {
    if (!ui.drawModal || !ui.drawCard || !ui.drawStage) return;
    const rarity = String(item.rarity || "N").toLowerCase();
    ui.drawModal.classList.remove("hidden");
    ui.drawModal.setAttribute("aria-hidden", "false");
    ui.drawStage.textContent = "連線命運中...";
    ui.drawCard.className = "draw-card spinning";
    ui.drawCard.textContent = "💝";
    await delay(900);

    ui.drawStage.textContent = "翻牌中...";
    await delay(700);

    ui.drawCard.className = `draw-card reveal ${rarity}`;
    ui.drawCard.textContent = item.cardName || "神秘禮物";
    ui.drawStage.textContent = `你抽到【${item.rarity}】`;
  }

  function closeDrawModal() {
    if (!ui.drawModal) return;
    ui.drawModal.classList.add("hidden");
    ui.drawModal.setAttribute("aria-hidden", "true");
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    flashPetReaction();
    await fetchRoomState();
  }

  async function decorateRoom(item) {
    const data = await authedPost("pet/decorate", { roomCode: state.roomCode, item });
    setMsg(ui.decorMsg, data.data?.message || data.message, true);
    flashPetReaction();
    await fetchRoomState();
  }

  async function renamePet(formData) {
    const data = await authedPost("pet/rename", {
      roomCode: state.roomCode,
      ...Object.fromEntries(formData.entries())
    });
    setMsg(ui.petMsg, `寵物改名成功：${data.data.petName}`, true);
    flashPetReaction();
    await fetchRoomState();
  }

  async function loadInventory() {
    const data = await authedPost("inventory/list", { roomCode: state.roomCode });
    renderInventory(data.data.items || []);
  }

  function renderInventory(items) {
    if (!ui.inventoryList) return;
    if (!items.length) {
      ui.inventoryList.innerHTML = "<li>物品庫目前是空的，去抽卡吧！</li>";
      return;
    }
    ui.inventoryList.innerHTML = items.map((it) => {
      return `<li>
        【${escapeHtml(it.rarity)}】${escapeHtml(it.itemName)} x${num(it.qty)}
        <button class=\"ghost use-item-btn\" data-id=\"${escapeHtml(it.inventoryId)}\" data-target=\"${escapeHtml(it.target || "")}\">使用</button>
      </li>`;
    }).join("");
  }

  async function useInventoryItem(inventoryId, target) {
    const targetMode = target === "partner" ? "partner" : "pet";
    const data = await authedPost("inventory/use", {
      roomCode: state.roomCode,
      inventoryId,
      targetMode
    });
    setMsg(ui.giftMsg, data.data?.message || data.message, true);
    flashPetReaction();
    await loadInventory();
    await fetchRoomState();
  }

  function flashPetReaction() {
    const petEmoji = $("#pet-emoji");
    if (!petEmoji) return;
    petEmoji.classList.remove("react");
    void petEmoji.offsetWidth;
    petEmoji.classList.add("react");
  }

  function bindEvents() {
    ui.navButtons.forEach((btn) => {
      btn.addEventListener("click", () => setActiveView(btn.dataset.view, false));
    });
    ui.hubGrid?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-go-view]");
      if (!btn) return;
      setActiveView(btn.dataset.goView, false);
    });

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

    $("#open-inventory-btn")?.addEventListener("click", async () => {
      setActiveView("daily");
      try {
        await loadInventory();
      } catch (err) {
        setMsg(ui.giftMsg, err.message);
      }
    });
    $("#draw-close-btn")?.addEventListener("click", closeDrawModal);
    ui.drawModal?.addEventListener("click", (e) => {
      if (e.target === ui.drawModal) closeDrawModal();
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

    $("#pet-name-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await renamePet(new FormData(e.currentTarget));
        e.currentTarget.reset();
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

    $("#inventory-list")?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".use-item-btn");
      if (!btn) return;
      try {
        await useInventoryItem(btn.dataset.id, btn.dataset.target);
      } catch (err) {
        setMsg(ui.giftMsg, err.message);
      }
    });

    $("#logout-btn").addEventListener("click", () => {
      clearSession();
      render();
    });
  }

  async function boot() {
    bindEvents();
    startClock();
    loadSession();
    render();

    if (state.user?.userId && state.user?.token) {
      state.roomCode = state.user.roomCode || "";
      if (state.roomCode) {
        try {
          await fetchRoomState();
          await loadInventory();
          startPolling();
        } catch (e) {
          console.warn(e);
          clearSession();
          render();
        }
      }
    }
  }

  function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
  }

  function updateClock() {
    if (!ui.mobileTime) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    ui.mobileTime.textContent = `${hh}:${mm}`;
  }

  boot();
})();
