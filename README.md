# HTML 工具大廳 (HTML Tools Lobby)

一個以 GitHub Pages 為基礎的靜態工具集合站，用來集中管理各種 HTML 小工具 (HTML tools)，並透過大廳頁 (Lobby page) 以卡片 (Card) 形式展示、搜尋、排序、篩選、開啟與預覽工具。

## 專案目標

這個 repo 的目標是把多個獨立的小工具整理到同一個靜態網站中，降低工具分散、路徑混亂與維護成本。

核心概念：

- 使用 `index.html` 作為大廳首頁。
- 每個工具放在 `tools/<tool-name>/index.html`。
- 首頁透過 `tools.json` 自動讀取工具清單並產生卡片。
- 支援搜尋、分類篩選、排序與精選工具展示。
- 部分工具可透過 `iframe` 內嵌預覽。
- 以 GitHub Pages 部署，不依賴後端。

## 功能特性

- 工具集中展示。
- 卡片式工具入口。
- 搜尋與分類篩選。
- 排序功能。
- 精選工具區塊。
- `READY / BETA / DRAFT` 狀態徽章。
- `NEW / FEATURED` 標記。
- 支援 iframe 預覽模式。
- 支援自訂 `404.html` 錯誤頁。

## 專案結構

```text
.
├─ index.html
├─ 404.html
├─ tools.json
├─ README.md
├─ assets/
│  ├─ css/
│  │  └─ main.css
│  └─ js/
│     └─ lobby.js
├─ docs/
│  └─ MAINTENANCE.md
├─ pages/
│  ├─ about/
│  │  └─ index.html
│  └─ changelog/
│     └─ index.html
└─ tools/
   ├─ calculator/
      └─ index.html
....
```

## 使用方式

### 一般使用者

1. 開啟 GitHub Pages 網站首頁。
2. 在大廳頁瀏覽精選工具與全部工具卡片。
3. 透過搜尋、分類與排序快速找到目標工具。
4. 點擊「開啟」進入工具頁。
5. 若工具支援，可點擊「預覽」在 Lobby 中用小視窗查看。

### 維護者

新增工具時，至少完成以下兩件事：

1. 建立工具頁，例如：
   `tools/my-tool/index.html`
2. 在 `tools.json` 中新增一筆工具資料。

## tools.json 格式

每個工具建議包含以下欄位：

```json
{
  "id": "calculator",
  "name": "計算機",
  "name_en": "Calculator",
  "description": "基本四則運算工具。",
  "path": "./tools/calculator/",
  "category": "utility",
  "tags": ["math", "basic"],
  "supportsIframe": true,
  "status": "ready",
  "featured": true,
  "isNew": false,
  "order": 1,
  "updatedAt": "2026-06-11"
}
```

## 欄位說明

- `id`：工具唯一識別。
- `name`：中文名稱。
- `name_en`：英文名稱。
- `description`：工具描述。
- `path`：工具路徑。
- `category`：工具分類。
- `tags`：搜尋與標記用標籤。
- `supportsIframe`：是否支援首頁預覽。
- `status`：工具狀態，建議使用 `ready`、`beta`、`draft`。
- `featured`：是否列入精選工具區。
- `isNew`：是否顯示 NEW 標記。
- `order`：預設排序優先序。
- `updatedAt`：更新日期，建議格式為 `YYYY-MM-DD`。

## 設計原則

- 優先使用靜態 HTML/CSS/JavaScript。
- 工具彼此獨立，避免過度耦合。
- 大廳頁只做索引、導覽、預覽、搜尋、篩選與排序。
- 保持路徑清楚、資料結構一致、命名可預測。
- MVP 優先，避免過早複雜化。

## 文件

- [維護與更新原則](./docs/MAINTENANCE.md)

## 授權

本專案採用 `LICENSE` 檔案中所指定的授權條款。
