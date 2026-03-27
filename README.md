# LoveBridge 遠距離戀愛網頁遊戲

手機優先、繁體中文、雙人同步（polling 每 3 秒）的戀愛養成 MVP。

## 專案結構

```text
LoveBridge/
├─ index.html
├─ README.md
├─ assets/
│  ├─ css/style.css
│  └─ js/
│     ├─ config.js
│     ├─ api.js
│     └─ app.js
└─ gas/
   ├─ Code.gs
   └─ appsscript.json
```

## 功能（目前版本）

- 註冊 / 登入（`salt + SHA-256`）
- Token Session 驗證（7 天）
- 情侶配對（6 碼房號）
- 玩家資料（Lv、HP、MP、EXP、好感）
- 每日簽到
- 倒數計時（紀念日 / 見面）
- 抽卡系統（`N / R / SR / SSR`）
- 小遊戲：心電感應、同步點擊
- 共養寵物（共用一隻）
- 共用小房間（裝飾主題 / 分數）
- 房間共享資料 + 前端 polling（3 秒）

## REST API

Base URL：GAS Web App URL

### GET

- `GET ?resource=health`
- `GET ?resource=room/state&userId=Uxxxxxx&token=...&roomCode=ABC123`

### POST

- `auth/register`
- `auth/login`
- `room/join`
- `checkin/claim`
- `timers/create`
- `gifts/draw`
- `game/telepathy/choose`
- `game/click/tap`
- `pet/feed`
- `pet/decorate`

除 `auth/register` / `auth/login` 外，其餘都要帶：`userId`、`token`。

## Google Sheets 欄位設計

### `Users`

`userId, username, passwordSalt, passwordHash, nickname, avatar, level, hp, mp, exp, affection, roomCode, createdAt, updatedAt`

### `Sessions`

`sessionId, userId, token, expiresAt, createdAt, lastSeenAt`

### `Rooms`

`roomCode, userA, userB, sharedAffection, sharedExp, telepathyRound, clickRound, lastSyncAt, createdAt, updatedAt`

### `DailyCheckins`

`checkinId, userId, date, rewardExp, rewardAffection, createdAt`

### `GiftsLog`

`logId, roomCode, userId, cardName, rarity, effectType, effectValue, createdAt`

### `Timers`

`timerId, roomCode, title, targetDate, createdBy, createdAt`

### `TelepathyRounds`

`roundId, roomCode, choiceA, choiceB, matched, winnerBonus, status, updatedAt, createdAt`

### `ClickRounds`

`roundId, roomCode, tapA, tapB, tsA, tsB, deltaMs, matched, status, updatedAt, createdAt`

### `SharedPet`

`roomCode, petType, petName, level, exp, hunger, mood, roomTheme, decorScore, lastDecorItem, lastFedAt, updatedAt, createdAt`

### `PetLogs`

`logId, roomCode, userId, action, item, effectValue, createdAt`

## 部署

## 1. 部署 GAS API

1. 建立 Google 試算表。
2. 試算表內開啟：`擴充功能 -> Apps Script`。
3. 貼上 [Code.gs](./gas/Code.gs) 與 [appsscript.json](./gas/appsscript.json)。
4. `部署 -> 新增部署作業 -> 網頁應用程式`。
5. 存取權限選 `任何人`。
6. 複製 Web App URL。

## 2. 前端設定 API

編輯 [config.js](./assets/js/config.js)：

```js
window.APP_CONFIG = {
  API_BASE_URL: "https://script.google.com/macros/s/你的ID/exec"
};
```

## 3. GitHub Pages

1. Push 到 GitHub。
2. Repo `Settings -> Pages`。
3. Source 選 `Deploy from branch`。
4. Branch 選 `main` + `/ (root)`。

## 4. Render Static Site

1. 建立 `Static Site`。
2. 接 GitHub repo。
3. `Build Command` 留空。
4. `Publish Directory` 設 `.`。

## 備註

- 本專案是 MVP，仍不建議用在高風險正式場景。
- 如果你是從舊版升級，`Code.gs` 會自動補上缺少欄位標題。
- polling 週期在 [app.js](./assets/js/app.js) 的 `setInterval(fetchRoomState, 3000)`。
