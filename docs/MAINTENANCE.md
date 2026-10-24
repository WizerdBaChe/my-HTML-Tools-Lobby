# 維護與更新原則 (Maintenance Guide)

本文件用來定義本 repo 的維護方式、更新原則、命名規範與擴充邏輯，避免工具數量增加後出現結構混亂、首頁失控、路徑不一致等問題。

## 維護目標

本 repo 的維護重點不是做成大型前端框架專案，而是持續維持一個清楚、可擴充、低耦合的 HTML 工具集合站。

優先確保：

- 工具可直接開啟。
- 路徑穩定。
- 首頁可正常載入 `tools.json`。
- 搜尋、篩選、排序結果正確。
- 精選工具與狀態標記顯示正常。
- 不同工具彼此獨立，不互相污染。

## 核心原則

### 1. 工具獨立

每個工具原則上應位於：

```text
tools/<tool-id>/index.html
```

若工具較複雜，可在該資料夾內再加入：

- `style.css`
- `script.js`
- `assets/`

工具相關資源應優先放在自己的資料夾，不要濫用全域共用資源。

#### 第三方函式庫一律隨工具存放

工具需要的第三方函式庫，必須把檔案實體放進：

```text
tools/<tool-id>/libs/
```

不要從 CDN 載入。理由：CDN 不可達、被牆、或套件被下架時，工具會直接壞掉，
而靜態站沒有後端可以補救；vendored 版本則是離線可用、版本鎖死、行為可重現。

vendored 進來的函式庫要一併保留其 `LICENSE`，並在工具頁的註解裡記下版本號與來源網址。

> 現況例外：`Html-live` 與 `text_DiffLens` 仍走 jsDelivr，屬於此原則確立前的既有寫法。
> 它們不是範本，日後若要調整再一併處理。

### 2. Lobby 與工具分離

`index.html` 的角色是大廳頁，不應承載具體工具邏輯。

Lobby 只負責：

- 讀取 `tools.json`
- 產生卡片
- 顯示精選工具
- 進行搜尋、分類、排序
- 進行 iframe 預覽

### 3. tools.json 是單一資料來源

首頁工具卡片、精選區塊、排序依據、狀態標記應以 `tools.json` 作為唯一資料來源。

新增、下架、重新分類、調整 featured、修改排序時，應優先修改 `tools.json`，而不是直接手改首頁 HTML。

### 4. 路徑優先使用相對路徑

所有站內連結、腳本、樣式與工具入口，優先使用相對路徑。

例如：

- `./tools/calculator/`
- `./assets/css/main.css`
- `../../`

不要直接寫死完整 GitHub Pages 網址。
例外：掛載外部工具時，`path` 應填入完整 URL，這是唯一允許寫死絕對網址的情境。

### 5. 先做 MVP，再做擴充

新增功能時，優先順序如下：

1. 功能是否真的需要。
2. 先做最小可用版。
3. 確認不會破壞既有結構。
4. 再考慮美化與互動升級。

## 命名規範

### 工具資料夾命名

統一使用：

- 小寫英文
- kebab-case

例如：

- `json-viewer`
- `image-resizer`
- `text-diff`

### tools.json 的 id 規範

`id` 應與資料夾名稱一致或高度對應。

例如：

```json
{
  "id": "json-viewer",
  "path": "./tools/json-viewer/"
}
```

## tools.json 欄位規則

建議欄位如下：

- `id`
- `name`
- `name_en`
- `description`
- `path`
- `category`
- `tags`
- `supportsIframe`
- `status`
- `featured`
- `isNew`
- `order`
- `updatedAt`
- `accepts`、`handoff`（選填，見下方「拖放輪盤欄位」）

若為外部檔案，參照 [## 新增工具流程 > **外部工具（獨立 repo）**]
### 拖放輪盤欄位（選填）

大廳的「拖放輪盤」(drop wheel) 是一個啟動器功能：把檔案從作業系統拖到大廳頁，按一下 Shift，
就會叫出只列出「收得了這類檔案」的工具的輪盤。實作在 `assets/js/drop-wheel.js`（介面）與
`assets/js/drop-wheel-geom.js`（純函式，測試：`node tests/drop-wheel.test.mjs`），不屬於 `lobby.js`。

- `accepts`：字串陣列，值取自 `image`、`svg`、`json-csv`、`text-code`、`other`。
  `other` 代表「任何檔案都能收」，會出現在每一種檔案的輪盤上。
  **沒有 `accepts` 的工具永遠不會出現在輪盤上。** 只有工具頁面真的有檔案輸入
  （`<input type=file>` 或 drop 處理）時才填，並以該工具實際接受的類型為準。
  外部工具（完整 URL）不會出現在輪盤上。
- `handoff`：布林，`true` 代表該工具實作了檔案接收端，輪盤放開後檔案會直接帶進去；
  沒有則只開啟工具，輪盤中央會提示「開啟後請再選一次檔案」。

接收端協定（僅同源，雙向檢查 `event.origin === location.origin`）：
工具以 `window.open` 從大廳開啟 → 工具對 `window.opener` 送 `{type:'lobby-handoff-ready'}`
→ 大廳回 `{type:'lobby-handoff', files:[File...]}`。接收端只應在 `window.opener` 存在時啟動，
並驗證 `event.source === window.opener`。範例：`tools/image-squeezer/index.html` 結尾的 handoff 區塊。

### 狀態值

建議固定使用：

- `ready`
- `beta`
- `draft`

### 分類值

建議從少量類別開始，例如：

- `utility`
- `developer`
- `text`
- `data`
- `image`
- `experimental`
- `entertainment`

#### 分類不變條件

`assets/js/lobby.js` 中的 `CATEGORY_ICONS`、`CATEGORY_SVG`、`CATEGORY_LABELS` 三張表，
必須涵蓋 `tools.json` 裡出現過的每一個 `category` 值。

漏掉任何一張表都不會報錯，只會靜默降級：卡片顯示預設齒輪圖示、篩選按鈕沒有圖示、
標籤直接印出英文原字。新增分類時三張表要一起改。

> 檢查方式：把 `tools.json` 的 `category` 取集合，逐一確認三張表都有對應的鍵。

### 日期格式

`updatedAt` 建議固定為：

```text
YYYY-MM-DD
```

避免混用不同日期格式，否則排序容易錯。

## 新增工具流程
> **外部工具（獨立 repo）**：若工具已部署於其他網址，只需完成步驟 3–4，並將 `path` 填入完整 URL、`supportsIframe` 設為 `false`，不需建立本地資料夾。

1. 建立工具資料夾與入口頁：
   `tools/<tool-id>/index.html`
2. 補上該工具需要的 `style.css`、`script.js`。
3. 在 `tools.json` 新增工具描述。
4. 補上：
   - `category`
   - `status`
   - `order`
   - `updatedAt`
   - `featured`
   - `isNew`
5. 確認 `path` 可正常開啟。
6. 確認是否適合 `iframe` 預覽。
7. 從 Lobby 測試：
   - 卡片是否顯示
   - 搜尋是否找得到
   - 分類是否正常
   - 排序是否正確
   - 精選區是否正確
   - 預覽是否正常
8. 若屬於明顯功能變更，補到 changelog 頁。

## 允許與不建議的變更

### 允許

- 新增獨立工具。
- 補充分類、標籤、描述。
- 調整 featured 與排序。
- 新增搜尋、排序、篩選邏輯。
- 改善 Lobby 視覺設計。
- 新增 about、changelog、help 等靜態頁。
- 以外部連結形式掛載獨立部署的工具。

### 不建議

- 把所有工具混寫在首頁。
- 讓不同工具共用過多全域變數。
- 未整理就把外部第三方程式碼直接丟進 repo。
- 沒有必要卻導入大型框架。
- 破壞既有工具路徑而不做相容處理。

## iframe 使用原則

不是所有工具都適合 iframe。

適合 iframe 的工具通常具備：

- 單頁操作。
- 視窗需求不大。
- 不依賴複雜跳轉流程。
- 不需要特殊權限或跨頁互動。

不適合內嵌時，應將 `supportsIframe` 設為 `false`。
外部工具（`path` 為完整 URL）因跨 origin 限制，通常無法 iframe 內嵌，應一律設為 `false`。

### 預覽沙箱的硬限制

首頁的預覽 iframe 使用 `sandbox="allow-scripts allow-forms"`，**刻意不含 `allow-same-origin`**
（見 v1.1.0 更新紀錄）。工具在預覽視窗中因此執行於不透明來源 (opaque origin)，以下能力不可用或不可靠：

- `localStorage` / `sessionStorage` / IndexedDB — 存取會拋出 `SecurityError`
- `navigator.clipboard.writeText` — 常被權限政策擋下，必須準備 `document.execCommand('copy')` 退路
- `new Worker('./worker.js')` — 外部檔案的 worker 會被擋，需改用 blob URL 建立
- 相機 / 麥克風 — 預覽 iframe 沒有 `allow="camera"`，取用一定失敗
- **下載** — sandbox 沒有 `allow-downloads`，`<a download>` 與 `toBlob` 存檔都不會觸發。
  工具可以在 `window.self !== window.top` 時提示改開新分頁，但不該把下載當成核心功能。

以下能力**可用**，2026-08-26 以帶 `Access-Control-Allow-Origin: *` 的 Pages 模擬伺服器實測：

- classic `<script src>` — 可用（不需要 CORS）
- `<canvas>` + `getImageData` — 可用
- **ES module 動態載入 `import()` — 可用**，但取決於伺服器有沒有送 CORS 標頭。
  同一支探測在沒有 CORS 標頭的伺服器上會失敗；GitHub Pages 會送 `ACAO: *`，所以在正式站上可用。
  這一點曾經被誤判成「不可用」兩次，兩次都是量測環境的問題而非瀏覽器行為：
  一次是巢狀 sandbox iframe 根本沒發出請求，一次是本機測試伺服器沒送 CORS 標頭。
  **要重測時務必先跑正對照**（同一個檔案用 `fetch` 拿得到嗎？classic script 載得進來嗎？），
  確認儀器能產出陽性，再相信它的陰性。

`supportsIframe` 的判準：**工具的核心功能在上述限制下仍然完整可用**才設 `true`。
一個只會顯示錯誤訊息的預覽，比沒有預覽按鈕更糟。
## 更新原則

### 小更新

- 修正文案。
- 調整樣式。
- 修正工具描述。
- 修補單一工具 bug。

### 中更新

- 新增工具。
- 調整工具分類。
- 新增或調整排序邏輯。
- 修改 `tools.json` 結構。

### 大更新

- 更改整體目錄結構。
- 導入建置流程。
- 改用前端框架。
- 大幅改動首頁資料載入機制。

## 文件同步原則

當以下內容有變化時，文件要同步更新：

- 專案結構
- 新增工具流程
- `tools.json` 欄位規格
- 授權方式
- 部署方式
- About / Changelog 內容

若程式已更新但文件未更新，應視為不完整更新。
