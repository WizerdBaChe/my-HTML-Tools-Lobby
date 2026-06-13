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
