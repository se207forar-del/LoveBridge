const TZ = 'Asia/Taipei';
const SESSION_TTL_DAYS = 7;

const SHEETS = {
  users: {
    name: 'Users',
    headers: ['userId', 'username', 'passwordSalt', 'passwordHash', 'nickname', 'avatar', 'level', 'hp', 'mp', 'exp', 'affection', 'roomCode', 'createdAt', 'updatedAt']
  },
  sessions: {
    name: 'Sessions',
    headers: ['sessionId', 'userId', 'token', 'expiresAt', 'expiresAtTs', 'createdAt', 'lastSeenAt']
  },
  rooms: {
    name: 'Rooms',
    headers: ['roomCode', 'userA', 'userB', 'sharedAffection', 'sharedExp', 'telepathyRound', 'clickRound', 'lastSyncAt', 'createdAt', 'updatedAt']
  },
  checkins: {
    name: 'DailyCheckins',
    headers: ['checkinId', 'userId', 'date', 'rewardExp', 'rewardAffection', 'createdAt']
  },
  gifts: {
    name: 'GiftsLog',
    headers: ['logId', 'roomCode', 'userId', 'cardName', 'rarity', 'itemType', 'effectType', 'effectValue', 'target', 'drawDate', 'createdAt']
  },
  inventory: {
    name: 'Inventory',
    headers: ['inventoryId', 'userId', 'roomCode', 'itemCode', 'itemName', 'itemType', 'rarity', 'color', 'target', 'effectType', 'effectValue', 'qty', 'acquiredAt', 'updatedAt']
  },
  timers: {
    name: 'Timers',
    headers: ['timerId', 'roomCode', 'title', 'targetDate', 'createdBy', 'createdAt']
  },
  telepathy: {
    name: 'TelepathyRounds',
    headers: ['roundId', 'roomCode', 'choiceA', 'choiceB', 'matched', 'winnerBonus', 'status', 'updatedAt', 'createdAt']
  },
  click: {
    name: 'ClickRounds',
    headers: ['roundId', 'roomCode', 'tapA', 'tapB', 'tsA', 'tsB', 'deltaMs', 'matched', 'status', 'updatedAt', 'createdAt']
  },
  sharedPet: {
    name: 'SharedPet',
    headers: ['roomCode', 'petType', 'petName', 'level', 'exp', 'hunger', 'mood', 'reaction', 'roomTheme', 'decorScore', 'lastDecorItem', 'lastFedAt', 'updatedAt', 'createdAt']
  },
  petLogs: {
    name: 'PetLogs',
    headers: ['logId', 'roomCode', 'userId', 'action', 'item', 'effectValue', 'createdAt']
  }
};

function doGet(e) {
  try {
    const resource = getParam(e, 'resource');
    if (!resource) return jsonError('缺少 resource 參數', 400);

    if (resource === 'health') {
      return jsonOk({ service: 'lovebridge-gas', time: nowIso() }, 'API 正常運作');
    }

    if (resource === 'room/state') {
      const userId = required(getParam(e, 'userId'), 'userId');
      const token = required(getParam(e, 'token'), 'token');
      const authUserId = verifySession(userId, token);
      const roomCode = getParam(e, 'roomCode');
      return jsonOk(handleRoomState(authUserId, roomCode), '同步成功');
    }

    return jsonError('找不到 GET 路由: ' + resource, 404);
  } catch (err) {
    return jsonError(err.message || String(err), 500);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const body = parseJsonBody(e);
    const resource = body.resource;
    if (!resource) return jsonError('缺少 resource', 400);

    let authUserId = '';
    if (resource !== 'auth/register' && resource !== 'auth/login') {
      authUserId = verifySession(required(body.userId, 'userId'), required(body.token, 'token'));
    }

    switch (resource) {
      case 'auth/register':
        return jsonOk(handleRegister(body), '註冊成功');
      case 'auth/login':
        return jsonOk(handleLogin(body), '登入成功');
      case 'room/join':
        return jsonOk(handleJoinRoom(authUserId, body), '房間已加入');
      case 'checkin/claim':
        return jsonOk(handleCheckin(authUserId), '簽到成功');
      case 'timers/create':
        return jsonOk(handleCreateTimer(authUserId, body), '倒數已新增');
      case 'gifts/draw':
        return jsonOk(handleDrawGift(authUserId, body), '抽卡完成');
      case 'game/telepathy/choose':
        return jsonOk(handleTelepathyChoice(authUserId, body), '心電感應已送出');
      case 'game/click/tap':
        return jsonOk(handleClickTap(authUserId, body), '點擊已記錄');
      case 'pet/feed':
        return jsonOk(handlePetFeed(authUserId, body), '餵食成功');
      case 'pet/decorate':
        return jsonOk(handlePetDecorate(authUserId, body), '裝飾成功');
      case 'pet/rename':
        return jsonOk(handlePetRename(authUserId, body), '寵物名稱已更新');
      case 'inventory/list':
        return jsonOk(handleInventoryList(authUserId, body), '物品庫讀取成功');
      case 'inventory/use':
        return jsonOk(handleInventoryUse(authUserId, body), '道具已使用');
      default:
        return jsonError('找不到 POST 路由: ' + resource, 404);
    }
  } catch (err) {
    return jsonError(err.message || String(err), 500);
  } finally {
    lock.releaseLock();
  }
}

function handleRegister(body) {
  const username = required(body.username, 'username').trim();
  const password = required(body.password, 'password').trim();
  const nickname = required(body.nickname, 'nickname').trim();

  const usersSheet = useSheet(SHEETS.users);
  const users = readSheet(usersSheet);

  if (users.some((u) => String(u.username).toLowerCase() === username.toLowerCase())) {
    throw new Error('帳號已存在');
  }

  const salt = randomToken(10);
  const user = {
    userId: id6('U'),
    username: username,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    nickname: nickname,
    avatar: randomAvatar(),
    level: 1,
    hp: 100,
    mp: 50,
    exp: 0,
    affection: 0,
    roomCode: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  appendRow(usersSheet, SHEETS.users.headers, user);
  return {
    userId: user.userId,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar
  };
}

function handleLogin(body) {
  const username = required(body.username, 'username').trim();
  const password = required(body.password, 'password').trim();
  const usersSheet = useSheet(SHEETS.users);
  const users = readSheet(usersSheet);
  const user = users.find((u) => String(u.username).toLowerCase() === username.toLowerCase());
  if (!user) throw new Error('帳號不存在');

  const isLegacy = !String(user.passwordSalt || '').trim();
  const valid = isLegacy
    ? user.passwordHash === sha256(password)
    : user.passwordHash === hashPassword(password, String(user.passwordSalt));

  if (!valid) throw new Error('密碼錯誤');

  if (isLegacy) {
    const newSalt = randomToken(10);
    updateUserFields(user.userId, {
      passwordSalt: newSalt,
      passwordHash: hashPassword(password, newSalt),
      updatedAt: nowIso()
    }, usersSheet);
  }

  const session = issueAuthToken(user.userId);
  const room = user.roomCode ? findRoomByCode(user.roomCode) : null;
  const partner = room ? findPartnerInRoom(room, user.userId) : null;

  return {
    userId: user.userId,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    roomCode: user.roomCode || '',
    token: session.token,
    tokenExpiresAt: session.expiresAt,
    player: toPlayerDto(findUserById(user.userId)),
    partner: partner ? toPlayerDto(partner) : null
  };
}

function handleJoinRoom(authUserId, body) {
  const input = String(body.roomCode || '').trim();
  const roomCode = input ? normalizeRoomCode(input) : genRoomCode();
  const usersSheet = useSheet(SHEETS.users);
  const roomsSheet = useSheet(SHEETS.rooms);

  const user = findUserById(authUserId);
  if (!user) throw new Error('使用者不存在');

  let room = findRoomByCode(roomCode);
  const now = nowIso();

  if (!room) {
    appendRow(roomsSheet, SHEETS.rooms.headers, {
      roomCode: roomCode,
      userA: authUserId,
      userB: '',
      sharedAffection: 0,
      sharedExp: 0,
      telepathyRound: '',
      clickRound: '',
      lastSyncAt: now,
      createdAt: now,
      updatedAt: now
    });
  } else {
    if (room.userA && room.userA !== authUserId && room.userB && room.userB !== authUserId) {
      throw new Error('房間已滿（最多 2 人）');
    }

    if (!room.userA) {
      updateRoomFields(roomCode, { userA: authUserId, updatedAt: now, lastSyncAt: now });
    } else if (!room.userB && room.userA !== authUserId) {
      updateRoomFields(roomCode, { userB: authUserId, updatedAt: now, lastSyncAt: now });
    }
  }

  updateUserFields(authUserId, { roomCode: roomCode, updatedAt: now }, usersSheet);
  ensureSharedPet(roomCode);
  return { roomCode: roomCode };
}

function handleCheckin(authUserId) {
  const date = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const checkinsSheet = useSheet(SHEETS.checkins);
  const checkins = readSheet(checkinsSheet);
  const exists = checkins.some((r) => r.userId === authUserId && r.date === date);
  if (exists) throw new Error('今天已簽到');

  const rewardExp = 20;
  const rewardAffection = 5;
  appendRow(checkinsSheet, SHEETS.checkins.headers, {
    checkinId: id6('C'),
    userId: authUserId,
    date: date,
    rewardExp: rewardExp,
    rewardAffection: rewardAffection,
    createdAt: nowIso()
  });

  addPlayerRewards(authUserId, rewardExp, rewardAffection);
  return { rewardExp: rewardExp, rewardAffection: rewardAffection };
}

function handleCreateTimer(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  mustMembership(authUserId, roomCode);

  appendRow(useSheet(SHEETS.timers), SHEETS.timers.headers, {
    timerId: id6('T'),
    roomCode: roomCode,
    title: required(body.title, 'title').trim(),
    targetDate: required(body.targetDate, 'targetDate').trim(),
    createdBy: authUserId,
    createdAt: nowIso()
  });

  return { timerId: 'ok' };
}

function handleDrawGift(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  mustMembership(authUserId, roomCode);
  const today = getTodayYmd();
  const drawCount = getUserDrawCountToday(authUserId, today);
  if (drawCount >= 2) {
    throw new Error('今日抽卡次數已用完（每日 2 次）');
  }

  const card = drawCardFromPool();
  appendRow(useSheet(SHEETS.gifts), SHEETS.gifts.headers, {
    logId: id6('G'),
    roomCode: roomCode,
    userId: authUserId,
    cardName: card.cardName,
    rarity: card.rarity,
    itemType: card.itemType,
    effectType: card.effectType,
    effectValue: card.effectValue,
    target: card.target,
    drawDate: today,
    createdAt: nowIso()
  });

  addInventoryItem(authUserId, roomCode, card);
  return Object.assign({}, card, { drawRemaining: Math.max(0, 1 - drawCount) });
}

function drawCardFromPool() {
  const pool = [
    { rarity: 'SSR', weight: 2, cardName: '虹彩禮服', itemType: 'outfit', color: '彩虹', target: 'partner', effectType: 'exp', effectValue: 36 },
    { rarity: 'SR', weight: 10, cardName: '玫瑰洋裝', itemType: 'outfit', color: '紅', target: 'partner', effectType: 'exp', effectValue: 24 },
    { rarity: 'SR', weight: 12, cardName: '星夜披風', itemType: 'outfit', color: '藍', target: 'partner', effectType: 'affection', effectValue: 18 },
    { rarity: 'R', weight: 26, cardName: '草莓罐頭', itemType: 'pet_food', color: '粉', target: 'pet', effectType: 'pet_hunger', effectValue: 16 },
    { rarity: 'R', weight: 24, cardName: '奶油餅乾', itemType: 'pet_food', color: '米', target: 'pet', effectType: 'pet_mood', effectValue: 12 },
    { rarity: 'N', weight: 26, cardName: '蝴蝶結貼紙', itemType: 'pet_decor', color: '粉', target: 'pet', effectType: 'pet_decor', effectValue: 8 }
  ];

  const sum = pool.reduce(function (acc, c) { return acc + c.weight; }, 0);
  let roll = Math.random() * sum;
  let pick = pool[0];

  for (var i = 0; i < pool.length; i++) {
    roll -= pool[i].weight;
    if (roll <= 0) {
      pick = pool[i];
      break;
    }
  }

  const effectText = giftEffectText(pick.effectType, pick.effectValue);
  return {
    itemCode: id6('IT'),
    rarity: pick.rarity,
    cardName: pick.cardName,
    itemType: pick.itemType,
    color: pick.color,
    target: pick.target,
    effectType: pick.effectType,
    effectValue: pick.effectValue,
    effectText: effectText
  };
}

function giftEffectText(type, value) {
  if (type === 'hp') return 'HP +' + value;
  if (type === 'mp') return 'MP +' + value;
  if (type === 'exp') return 'EXP +' + value;
  if (type === 'pet_hunger') return '寵物飽食 +' + value;
  if (type === 'pet_mood') return '寵物心情 +' + value;
  if (type === 'pet_decor') return '房間裝飾 +' + value;
  return '好感 +' + value;
}

function handleTelepathyChoice(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  const room = mustMembership(authUserId, roomCode);
  const choice = required(body.choice, 'choice').trim();

  let round = findOpenTelepathyRound(roomCode);
  if (!round) {
    const roundId = id6('TP');
    appendRow(useSheet(SHEETS.telepathy), SHEETS.telepathy.headers, {
      roundId: roundId,
      roomCode: roomCode,
      choiceA: '',
      choiceB: '',
      matched: '',
      winnerBonus: '',
      status: 'open',
      updatedAt: nowIso(),
      createdAt: nowIso()
    });
    updateRoomFields(roomCode, { telepathyRound: roundId, updatedAt: nowIso() });
    round = findTelepathyRound(roundId);
  }

  const slot = whoAmI(room, authUserId);
  if (!slot) throw new Error('你不在此房間');

  if (slot === 'A') {
    updateTelepathyRound(round.roundId, { choiceA: choice, updatedAt: nowIso() });
  } else {
    updateTelepathyRound(round.roundId, { choiceB: choice, updatedAt: nowIso() });
  }

  const updated = findTelepathyRound(round.roundId);
  if (updated.choiceA && updated.choiceB && updated.status === 'open') {
    const matched = updated.choiceA === updated.choiceB;
    updateTelepathyRound(updated.roundId, {
      matched: matched ? 'TRUE' : 'FALSE',
      status: 'done',
      winnerBonus: matched ? '雙方好感+8' : '無',
      updatedAt: nowIso()
    });

    if (matched) {
      if (room.userA) addPlayerRewards(room.userA, 8, 8);
      if (room.userB) addPlayerRewards(room.userB, 8, 8);
      bumpRoomShared(roomCode, 8, 0);
    }

    return {
      matched: matched,
      resultText: matched ? '心電感應成功，雙方加好感！' : '這回合沒有同步，下次再挑戰！'
    };
  }

  return {
    matched: false,
    resultText: '已送出選擇，等待對方作答...'
  };
}

function handleClickTap(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  const room = mustMembership(authUserId, roomCode);
  const clientTs = Number(body.clientTs || Date.now());

  let round = findOpenClickRound(roomCode);
  if (!round) {
    const roundId = id6('CK');
    appendRow(useSheet(SHEETS.click), SHEETS.click.headers, {
      roundId: roundId,
      roomCode: roomCode,
      tapA: '',
      tapB: '',
      tsA: '',
      tsB: '',
      deltaMs: '',
      matched: '',
      status: 'open',
      updatedAt: nowIso(),
      createdAt: nowIso()
    });
    updateRoomFields(roomCode, { clickRound: roundId, updatedAt: nowIso() });
    round = findClickRound(roundId);
  }

  const slot = whoAmI(room, authUserId);
  if (!slot) throw new Error('你不在此房間');

  if (slot === 'A') {
    updateClickRound(round.roundId, { tapA: '1', tsA: String(clientTs), updatedAt: nowIso() });
  } else {
    updateClickRound(round.roundId, { tapB: '1', tsB: String(clientTs), updatedAt: nowIso() });
  }

  const updated = findClickRound(round.roundId);
  if (updated.tapA && updated.tapB && updated.status === 'open') {
    const delta = Math.abs(Number(updated.tsA) - Number(updated.tsB));
    const matched = delta <= 1000;

    updateClickRound(updated.roundId, {
      deltaMs: String(delta),
      matched: matched ? 'TRUE' : 'FALSE',
      status: 'done',
      updatedAt: nowIso()
    });

    if (matched) {
      if (room.userA) addPlayerRewards(room.userA, 10, 5);
      if (room.userB) addPlayerRewards(room.userB, 10, 5);
      bumpRoomShared(roomCode, 5, 10);
    }

    return {
      matched: matched,
      resultText: matched ? ('同步成功！時間差 ' + delta + 'ms') : ('差一點！時間差 ' + delta + 'ms')
    };
  }

  return {
    matched: false,
    resultText: '已記錄點擊，等待對方...'
  };
}

function handlePetFeed(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  mustMembership(authUserId, roomCode);

  const food = String(body.food || '魚肉罐頭');
  const effects = food === '小餅乾'
    ? { hunger: 10, mood: 8, exp: 6 }
    : { hunger: 18, mood: 6, exp: 8 };

  const pet = ensureSharedPet(roomCode);
  const next = evolvePet(Object.assign({}, pet), effects.exp);
  const updatedPet = {
    hunger: clamp100(Number(pet.hunger || 0) + effects.hunger),
    mood: clamp100(Number(pet.mood || 0) + effects.mood),
    exp: next.exp,
    level: next.level,
    reaction: '好吃！喵～',
    lastFedAt: nowIso(),
    updatedAt: nowIso()
  };

  updatePetFields(roomCode, updatedPet);
  appendRow(useSheet(SHEETS.petLogs), SHEETS.petLogs.headers, {
    logId: id6('P'),
    roomCode: roomCode,
    userId: authUserId,
    action: 'feed',
    item: food,
    effectValue: effects.hunger,
    createdAt: nowIso()
  });

  return { message: '你們一起餵了 ' + food + '，寵物看起來很開心！' };
}

function handlePetDecorate(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  mustMembership(authUserId, roomCode);

  const item = required(body.item, 'item').trim();
  const decorMap = {
    '粉色壁紙': { score: 12, mood: 6, theme: '莓果童話' },
    '草莓地毯': { score: 9, mood: 5, theme: '甜點小屋' },
    '星星夜燈': { score: 15, mood: 8, theme: '星夜夢境' }
  };
  const effect = decorMap[item] || { score: 6, mood: 4, theme: '溫馨粉色' };

  const pet = ensureSharedPet(roomCode);
  const next = evolvePet(Object.assign({}, pet), 6);
  updatePetFields(roomCode, {
    roomTheme: effect.theme,
    decorScore: Number(pet.decorScore || 0) + effect.score,
    lastDecorItem: item,
    mood: clamp100(Number(pet.mood || 0) + effect.mood),
    exp: next.exp,
    level: next.level,
    reaction: '喵嗚！房間變漂亮了！',
    updatedAt: nowIso()
  });

  appendRow(useSheet(SHEETS.petLogs), SHEETS.petLogs.headers, {
    logId: id6('P'),
    roomCode: roomCode,
    userId: authUserId,
    action: 'decorate',
    item: item,
    effectValue: effect.score,
    createdAt: nowIso()
  });

  return { message: '你們一起擺上「' + item + '」，小房間變得更可愛了！' };
}

function handlePetRename(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  mustMembership(authUserId, roomCode);
  const petName = required(body.petName, 'petName').trim().slice(0, 16);
  if (!petName) throw new Error('寵物名稱不可為空');
  updatePetFields(roomCode, { petName: petName, reaction: '喵？新名字好喜歡！', updatedAt: nowIso() });
  return { petName: petName };
}

function handleInventoryList(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  mustMembership(authUserId, roomCode);
  const rows = readSheet(useSheet(SHEETS.inventory))
    .filter((r) => r.userId === authUserId && r.roomCode === roomCode && Number(r.qty || 0) > 0)
    .sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });

  return {
    items: rows.map(function (r) {
      return {
        inventoryId: r.inventoryId,
        itemName: r.itemName,
        itemType: r.itemType,
        rarity: r.rarity,
        color: r.color,
        target: r.target,
        effectType: r.effectType,
        effectValue: Number(r.effectValue || 0),
        qty: Number(r.qty || 0)
      };
    })
  };
}

function handleInventoryUse(authUserId, body) {
  const roomCode = normalizeRoomCode(required(body.roomCode, 'roomCode'));
  mustMembership(authUserId, roomCode);
  const inventoryId = required(body.inventoryId, 'inventoryId');
  const targetMode = String(body.targetMode || 'partner');
  const invSheet = useSheet(SHEETS.inventory);
  const rows = readSheet(invSheet);
  const item = rows.find((r) => r.inventoryId === inventoryId && r.userId === authUserId && r.roomCode === roomCode);
  if (!item) throw new Error('找不到該物品');
  if (Number(item.qty || 0) <= 0) throw new Error('物品數量不足');

  applyInventoryEffect(roomCode, authUserId, item, targetMode);
  updateRowByKey(invSheet, SHEETS.inventory.headers, 'inventoryId', inventoryId, {
    qty: Number(item.qty || 0) - 1,
    updatedAt: nowIso()
  });
  return { message: '已使用 ' + item.itemName, itemName: item.itemName };
}

function handleRoomState(authUserId, roomCodeRaw) {
  const roomCode = normalizeRoomCode(required(roomCodeRaw, 'roomCode'));
  const room = mustMembership(authUserId, roomCode);
  const me = findUserById(authUserId);

  const partner = findPartnerInRoom(room, authUserId);
  const timers = listRoomTimers(roomCode);
  const games = {
    telepathy: lastTelepathyResult(roomCode),
    click: lastClickResult(roomCode)
  };

  const pet = ensureSharedPet(roomCode);
  const today = getTodayYmd();
  const drawCountToday = getUserDrawCountToday(authUserId, today);
  updateRoomFields(roomCode, { lastSyncAt: nowIso(), updatedAt: nowIso() });
  touchSession(authUserId);

  return {
    roomCode: roomCode,
    player: toPlayerDto(me),
    partner: partner ? toPlayerDto(partner) : null,
    timers: timers,
    games: games,
    pet: {
      petType: pet.petType,
      petName: pet.petName,
      level: Number(pet.level || 1),
      exp: Number(pet.exp || 0),
      hunger: Number(pet.hunger || 0),
      mood: Number(pet.mood || 0),
      reaction: pet.reaction || ''
    },
    sharedRoom: {
      theme: pet.roomTheme || '溫馨粉色',
      decorScore: Number(pet.decorScore || 0),
      lastDecorItem: pet.lastDecorItem || ''
    },
    roomMeta: {
      sharedAffection: Number(room.sharedAffection || 0),
      sharedExp: Number(room.sharedExp || 0),
      paired: !!(room.userA && room.userB)
    },
    daily: {
      drawRemaining: Math.max(0, 2 - drawCountToday)
    }
  };
}

function listRoomTimers(roomCode) {
  const rows = readSheet(useSheet(SHEETS.timers)).filter((r) => r.roomCode === roomCode);
  const todayYmd = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const todayDays = ymdToUtcDays(todayYmd);

  return rows
    .map((r) => {
      const targetYmd = String(r.targetDate).slice(0, 10);
      const targetDays = ymdToUtcDays(targetYmd);
      const daysLeft = targetDays - todayDays;
      return {
        timerId: r.timerId,
        title: r.title,
        targetDate: targetYmd,
        daysLeft: daysLeft
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function ymdToUtcDays(ymd) {
  const parts = String(ymd || '').split('-');
  if (parts.length !== 3) return 0;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return 0;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function lastTelepathyResult(roomCode) {
  const rows = readSheet(useSheet(SHEETS.telepathy)).filter((r) => r.roomCode === roomCode);
  if (!rows.length) return {};
  const latest = rows[rows.length - 1];
  if (latest.status === 'open') return { resultText: '心電感應進行中，等待雙方選擇...' };
  const matched = String(latest.matched).toUpperCase() === 'TRUE';
  return {
    matched: matched,
    resultText: matched ? '上一回合心電感應成功' : '上一回合心電感應未成功'
  };
}

function lastClickResult(roomCode) {
  const rows = readSheet(useSheet(SHEETS.click)).filter((r) => r.roomCode === roomCode);
  if (!rows.length) return {};
  const latest = rows[rows.length - 1];
  if (latest.status === 'open') {
    const statusText = '本回合進行中：' + (latest.tapA ? '玩家A已點擊 ' : '') + (latest.tapB ? '玩家B已點擊' : '');
    return { statusText: statusText.trim() || '等待雙方點擊' };
  }
  const matched = String(latest.matched).toUpperCase() === 'TRUE';
  return {
    matched: matched,
    resultText: matched ? ('上一回合同步成功（' + latest.deltaMs + 'ms）') : ('上一回合失敗（' + latest.deltaMs + 'ms）')
  };
}

function addPlayerRewards(userId, addExp, addAffection) {
  const user = findUserById(userId);
  if (!user) return;

  const result = computePlayerGrowth(user, addExp, addAffection);
  updateUserFields(userId, {
    exp: result.exp,
    affection: result.affection,
    level: result.level,
    hp: result.hp,
    mp: result.mp,
    updatedAt: nowIso()
  });
}

function computePlayerGrowth(user, addExp, addAffection) {
  let exp = Number(user.exp || 0) + Number(addExp || 0);
  let affection = Number(user.affection || 0) + Number(addAffection || 0);
  let level = Number(user.level || 1);
  let hp = Number(user.hp || 100);
  let mp = Number(user.mp || 50);

  while (exp >= level * 100) {
    exp -= level * 100;
    level += 1;
    hp += 10;
    mp += 6;
  }

  return { exp: exp, affection: affection, level: level, hp: hp, mp: mp };
}

function getTodayYmd() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function getUserDrawCountToday(userId, ymd) {
  return readSheet(useSheet(SHEETS.gifts))
    .filter(function (r) { return r.userId === userId && String(r.drawDate || '') === ymd; })
    .length;
}

function addInventoryItem(userId, roomCode, card) {
  const invSheet = useSheet(SHEETS.inventory);
  const all = readSheet(invSheet);
  const existing = all.find(function (r) {
    return r.userId === userId && r.roomCode === roomCode && r.itemName === card.cardName && r.rarity === card.rarity;
  });

  if (existing) {
    updateRowByKey(invSheet, SHEETS.inventory.headers, 'inventoryId', existing.inventoryId, {
      qty: Number(existing.qty || 0) + 1,
      updatedAt: nowIso()
    });
    return;
  }

  appendRow(invSheet, SHEETS.inventory.headers, {
    inventoryId: id6('IV'),
    userId: userId,
    roomCode: roomCode,
    itemCode: card.itemCode,
    itemName: card.cardName,
    itemType: card.itemType,
    rarity: card.rarity,
    color: card.color || '',
    target: card.target || '',
    effectType: card.effectType,
    effectValue: card.effectValue,
    qty: 1,
    acquiredAt: nowIso(),
    updatedAt: nowIso()
  });
}

function applyInventoryEffect(roomCode, userId, item, targetMode) {
  const room = mustRoom(roomCode);
  const partnerId = room.userA === userId ? room.userB : room.userA;
  const targetUser = targetMode === 'self' ? userId : partnerId || userId;

  if (item.itemType === 'outfit') {
    if (item.effectType === 'exp') addPlayerRewards(targetUser, Number(item.effectValue || 0), 0);
    if (item.effectType === 'affection') addPlayerRewards(targetUser, 0, Number(item.effectValue || 0));
    return;
  }

  const pet = ensureSharedPet(roomCode);
  const patch = { updatedAt: nowIso(), reaction: '喵！謝謝你們的禮物！' };
  if (item.effectType === 'pet_hunger') patch.hunger = clamp100(Number(pet.hunger || 0) + Number(item.effectValue || 0));
  if (item.effectType === 'pet_mood') patch.mood = clamp100(Number(pet.mood || 0) + Number(item.effectValue || 0));
  if (item.effectType === 'pet_decor') {
    patch.decorScore = Number(pet.decorScore || 0) + Number(item.effectValue || 0);
    patch.lastDecorItem = item.itemName;
  }
  updatePetFields(roomCode, patch);
}

function applyGiftEffect(userId, roomCode, card) {
  if (card.effectType === 'exp') {
    addPlayerRewards(userId, card.effectValue, 0);
    return;
  }
  if (card.effectType === 'affection') {
    addPlayerRewards(userId, 0, card.effectValue);
    bumpRoomShared(roomCode, card.effectValue, 0);
    return;
  }

  const user = findUserById(userId);
  if (!user) return;
  const patch = { updatedAt: nowIso() };
  if (card.effectType === 'hp') patch.hp = Number(user.hp || 0) + Number(card.effectValue || 0);
  if (card.effectType === 'mp') patch.mp = Number(user.mp || 0) + Number(card.effectValue || 0);
  updateUserFields(userId, patch);
}

function ensureSharedPet(roomCode) {
  let pet = findPetByRoom(roomCode);
  if (pet) return pet;

  appendRow(useSheet(SHEETS.sharedPet), SHEETS.sharedPet.headers, {
    roomCode: roomCode,
    petType: '🐱',
    petName: '糖糖',
    level: 1,
    exp: 0,
    hunger: 55,
    mood: 55,
    reaction: '喵～今天也要一起玩！',
    roomTheme: '溫馨粉色',
    decorScore: 0,
    lastDecorItem: '',
    lastFedAt: '',
    updatedAt: nowIso(),
    createdAt: nowIso()
  });
  pet = findPetByRoom(roomCode);
  return pet;
}

function evolvePet(pet, addExp) {
  let exp = Number(pet.exp || 0) + Number(addExp || 0);
  let level = Number(pet.level || 1);

  while (exp >= level * 60) {
    exp -= level * 60;
    level += 1;
  }
  return { exp: exp, level: level };
}

function findPetByRoom(roomCode) {
  return readSheet(useSheet(SHEETS.sharedPet)).find((r) => r.roomCode === roomCode) || null;
}

function updatePetFields(roomCode, patch) {
  updateRowByKey(useSheet(SHEETS.sharedPet), SHEETS.sharedPet.headers, 'roomCode', roomCode, patch);
}

function bumpRoomShared(roomCode, affectionAdd, expAdd) {
  const room = findRoomByCode(roomCode);
  if (!room) return;
  updateRoomFields(roomCode, {
    sharedAffection: Number(room.sharedAffection || 0) + Number(affectionAdd || 0),
    sharedExp: Number(room.sharedExp || 0) + Number(expAdd || 0),
    updatedAt: nowIso()
  });
}

function createSession(userId, tokenOpt, expMsOpt) {
  const now = new Date();
  const expMs = Number(expMsOpt || (now.getTime() + SESSION_TTL_DAYS * 86400000));
  const expires = new Date(expMs);
  const token = tokenOpt || randomToken(24);
  const expiresAt = Utilities.formatDate(expires, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  const expiresAtTs = expMs;

  appendRow(useSheet(SHEETS.sessions), SHEETS.sessions.headers, {
    sessionId: id6('S'),
    userId: userId,
    token: token,
    expiresAt: expiresAt,
    expiresAtTs: expiresAtTs,
    createdAt: nowIso(),
    lastSeenAt: nowIso()
  });

  return {
    token: token,
    expiresAt: expiresAt
  };
}

function verifySession(userId, token) {
  const signed = verifySignedToken(userId, token);
  if (signed.ok) return userId;

  const sessions = readSheet(useSheet(SHEETS.sessions));
  const found = sessions.find((s) => s.userId === userId && s.token === token);
  if (!found) throw new Error('登入狀態失效，請重新登入');

  const expiresTs = parseExpiresTs(found);
  if (!expiresTs || expiresTs < Date.now()) {
    throw new Error('登入逾期，請重新登入');
  }

  return userId;
}

function issueAuthToken(userId) {
  const expMs = Date.now() + SESSION_TTL_DAYS * 86400000;
  const payloadObj = { u: userId, e: expMs, n: id6('N') };
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify(payloadObj));
  const sig = sha256(payload + '.' + getTokenSecret());
  const token = 'LB1.' + payload + '.' + sig;

  // 保留舊 sessions 記錄做相容與追蹤，不作為唯一驗證依據
  try {
    createSession(userId, token, expMs);
  } catch (e) {}

  return {
    token: token,
    expiresAt: Utilities.formatDate(new Date(expMs), TZ, "yyyy-MM-dd'T'HH:mm:ss")
  };
}

function verifySignedToken(userId, token) {
  try {
    const raw = String(token || '');
    if (!raw.startsWith('LB1.')) return { ok: false };
    const parts = raw.split('.');
    if (parts.length !== 3) return { ok: false };

    const payload = parts[1];
    const sig = parts[2];
    const expected = sha256(payload + '.' + getTokenSecret());
    if (sig !== expected) return { ok: false };

    const json = Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString();
    const obj = JSON.parse(json);
    if (String(obj.u) !== String(userId)) return { ok: false };
    if (!Number(obj.e) || Number(obj.e) < Date.now()) return { ok: false };
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
}

function getTokenSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('LB_TOKEN_SECRET');
  if (!secret) {
    secret = randomToken(20);
    props.setProperty('LB_TOKEN_SECRET', secret);
  }
  return secret;
}

function parseExpiresTs(sessionRow) {
  const numericTs = Number(sessionRow.expiresAtTs || 0);
  if (Number.isFinite(numericTs) && numericTs > 0) return numericTs;

  const raw = sessionRow.expiresAt;
  if (raw instanceof Date) return raw.getTime();

  const str = String(raw || '').trim();
  if (!str) return 0;

  const parsedIso = new Date(str.replace(' ', 'T')).getTime();
  if (Number.isFinite(parsedIso) && parsedIso > 0) return parsedIso;

  const normalized = str.replace(/\//g, '-');
  const parsedLocal = new Date(normalized).getTime();
  if (Number.isFinite(parsedLocal) && parsedLocal > 0) return parsedLocal;

  return 0;
}

function touchSession(userId) {
  const sheet = useSheet(SHEETS.sessions);
  const rows = readSheet(sheet).filter((r) => r.userId === userId);
  if (!rows.length) return;
  const latest = rows[rows.length - 1];
  updateRowByKey(sheet, SHEETS.sessions.headers, 'sessionId', latest.sessionId, { lastSeenAt: nowIso() });
}

function toPlayerDto(u) {
  return {
    userId: u.userId,
    username: u.username,
    nickname: u.nickname,
    avatar: u.avatar,
    level: Number(u.level || 1),
    hp: Number(u.hp || 100),
    mp: Number(u.mp || 50),
    exp: Number(u.exp || 0),
    affection: Number(u.affection || 0),
    roomCode: u.roomCode || ''
  };
}

function mustMembership(userId, roomCode) {
  const room = mustRoom(roomCode);
  const slot = whoAmI(room, userId);
  if (!slot) throw new Error('你不在此房間');
  return room;
}

function findPartnerInRoom(room, userId) {
  if (!room) return null;
  const partnerId = room.userA === userId ? room.userB : room.userA;
  return partnerId ? findUserById(partnerId) : null;
}

function whoAmI(room, userId) {
  if (room.userA === userId) return 'A';
  if (room.userB === userId) return 'B';
  return '';
}

function mustRoom(roomCode) {
  const room = findRoomByCode(roomCode);
  if (!room) throw new Error('房間不存在');
  return room;
}

function findUserById(userId) {
  return readSheet(useSheet(SHEETS.users)).find((u) => u.userId === userId) || null;
}

function findRoomByCode(roomCode) {
  return readSheet(useSheet(SHEETS.rooms)).find((r) => r.roomCode === roomCode) || null;
}

function findOpenTelepathyRound(roomCode) {
  const rows = readSheet(useSheet(SHEETS.telepathy));
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i].roomCode === roomCode && rows[i].status === 'open') return rows[i];
  }
  return null;
}

function findTelepathyRound(roundId) {
  return readSheet(useSheet(SHEETS.telepathy)).find((r) => r.roundId === roundId) || null;
}

function findOpenClickRound(roomCode) {
  const rows = readSheet(useSheet(SHEETS.click));
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i].roomCode === roomCode && rows[i].status === 'open') return rows[i];
  }
  return null;
}

function findClickRound(roundId) {
  return readSheet(useSheet(SHEETS.click)).find((r) => r.roundId === roundId) || null;
}

function updateUserFields(userId, patch, sheetOpt) {
  const sheet = sheetOpt || useSheet(SHEETS.users);
  updateRowByKey(sheet, SHEETS.users.headers, 'userId', userId, patch);
}

function updateRoomFields(roomCode, patch) {
  updateRowByKey(useSheet(SHEETS.rooms), SHEETS.rooms.headers, 'roomCode', roomCode, patch);
}

function updateTelepathyRound(roundId, patch) {
  updateRowByKey(useSheet(SHEETS.telepathy), SHEETS.telepathy.headers, 'roundId', roundId, patch);
}

function updateClickRound(roundId, patch) {
  updateRowByKey(useSheet(SHEETS.click), SHEETS.click.headers, 'roundId', roundId, patch);
}

function updateRowByKey(sheet, headers, keyName, keyValue, patch) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('資料不存在：' + keyName + '=' + keyValue);

  const h = values[0];
  const keyCol = h.indexOf(keyName);
  if (keyCol < 0) throw new Error('找不到欄位：' + keyName);

  for (var r = 1; r < values.length; r++) {
    if (String(values[r][keyCol]) === String(keyValue)) {
      Object.keys(patch).forEach(function (k) {
        const c = h.indexOf(k);
        if (c >= 0) sheet.getRange(r + 1, c + 1).setValue(patch[k]);
      });
      return;
    }
  }
  throw new Error('更新失敗，找不到資料：' + keyName + '=' + keyValue);
}

function useSheet(def) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(def.name);
  if (!sheet) sheet = ss.insertSheet(def.name);

  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    return sheet;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  let changed = false;
  def.headers.forEach(function (h) {
    if (currentHeaders.indexOf(h) < 0) {
      currentHeaders.push(h);
      changed = true;
    }
  });

  if (changed) {
    sheet.getRange(1, 1, 1, currentHeaders.length).setValues([currentHeaders]);
  }

  return sheet;
}

function readSheet(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);

  return values.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, idx) {
      obj[h] = row[idx];
    });
    return obj;
  });
}

function appendRow(sheet, headers, obj) {
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const merged = actualHeaders.length > headers.length ? actualHeaders : headers;
  const row = merged.map(function (h) {
    return obj[h] !== undefined ? obj[h] : '';
  });
  sheet.appendRow(row);
}

function parseJsonBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function normalizeRoomCode(input) {
  const cleaned = String(input || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(cleaned)) throw new Error('房號必須是 6 碼英數字');
  return cleaned;
}

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (var i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function getParam(e, key) {
  return (e && e.parameter && e.parameter[key]) || '';
}

function required(v, name) {
  if (v === undefined || v === null || String(v).trim() === '') throw new Error(name + ' 為必填');
  return v;
}

function hashPassword(password, salt) {
  return sha256(String(salt) + '|' + String(password));
}

function sha256(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function randomToken(size) {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, Number(size || 8));
}

function randomAvatar() {
  const picks = ['🩷', '🐰', '🐱', '🍓', '⭐', '🧸'];
  return picks[Math.floor(Math.random() * picks.length)];
}

function clamp100(v) {
  const n = Number(v || 0);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function id6(prefix) {
  const seed = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return prefix + seed;
}

function nowIso() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function jsonOk(data, message) {
  return jsonOut({ ok: true, message: message || 'ok', data: data || {} });
}

function jsonError(message, status) {
  return jsonOut({ ok: false, message: message, status: status || 500, data: null });
}

function jsonOut(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
