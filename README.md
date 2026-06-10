# HTML 工具大廳 (HTML Tools Lobby)

一個以 GitHub Pages 為基礎的靜態工具集合站，用來集中管理各種 HTML 小工具 (HTML tools)，並透過大廳頁 (Lobby page) 以卡片 (Card) 形式展示、開啟與預覽工具。

## 專案目標

這個 repo 的目標是把多個獨立的小工具整理到同一個靜態網站中，降低工具分散、路徑混亂、維護成本過高的問題。

核心概念：

- 使用 `index.html` 作為大廳首頁。
- 每個工具放在 `tools/<tool-name>/index.html`。
- 首頁透過 `tools.json` 自動讀取工具清單並產生卡片。
- 支援直接開啟工具，部分工具可透過 `iframe` 內嵌預覽。
- 以 GitHub Pages 部署，不依賴後端 (backend)。

## 功能特性

- 工具集中展示。
- 卡片式工具入口。
- 工具資料由 `tools.json` 管理。
- 支援 iframe 預覽模式。
- 支援自訂 `404.html` 錯誤頁。
- 可持續擴充為分類、搜尋、標籤、更新紀錄等功能。

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
   ├─ 1:1 Image Filler/
      └─ index.html
.....
```

## 使用方式

### 一般使用者

1. 開啟 GitHub Pages 網站首頁。
2. 在大廳頁瀏覽工具卡片。
3. 點擊「開啟」進入工具頁。
4. 若工具支援，可點擊「預覽」在 Lobby 中用小視窗查看。

### 維護者

新增工具時，至少完成以下兩件事：

1. 建立工具頁，例如：
   `tools/my-tool/index.html`
2. 在 `tools.json` 中新增一筆工具資料。

## tools.json 格式

每個工具至少包含以下欄位：

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
  "status": "ready"
}
```

## 設計原則

- 優先使用靜態 HTML/CSS/JavaScript。
- 工具彼此獨立，避免過度耦合。
- 大廳頁只做索引、導覽與預覽，不承擔工具主邏輯。
- 保持路徑清楚、資料結構一致、命名可預測。
- MVP 優先，避免過早複雜化。

## 部署方式

本專案可直接透過 GitHub Pages 發布為靜態網站。

若 repo 已啟用 GitHub Pages，推送到對應 branch 後，網站會自動更新。

## 文件

- [維護與更新原則](./docs/MAINTENANCE.md)

## 授權

本專案採用 `LICENSE` 檔案中所指定的授權條款。
