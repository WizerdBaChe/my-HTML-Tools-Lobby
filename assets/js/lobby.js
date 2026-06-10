const toolGrid = document.getElementById("toolGrid");
const featuredGrid = document.getElementById("featuredGrid");
const frame = document.getElementById("previewFrame");
const clearBtn = document.getElementById("clearPreview");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const categoryFilters = document.getElementById("categoryFilters");
const resetFilters = document.getElementById("resetFilters");
const resultCount = document.getElementById("resultCount");

let allTools = [];
let activeCategory = "all";

const categoryLabelMap = {
  all: "全部",
  utility: "通用工具",
  developer: "開發工具",
  text: "文字處理",
  data: "資料處理",
  image: "圖像處理",
  experimental: "實驗工具"
};

const statusLabelMap = {
  ready: "READY",
  beta: "BETA",
  draft: "DRAFT"
};

const statusOrderMap = {
  ready: 1,
  beta: 2,
  draft: 3
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCategoryLabel(category) {
  return categoryLabelMap[category] || category || "未分類";
}

function getStatusLabel(status) {
  return statusLabelMap[status] || String(status || "unknown").toUpperCase();
}

function compareDateDesc(a, b) {
  return new Date(b.updatedAt || "1970-01-01") - new Date(a.updatedAt || "1970-01-01");
}

function compareDefault(a, b) {
  const orderDiff = (a.order ?? 9999) - (b.order ?? 9999);
  if (orderDiff !== 0) return orderDiff;
  return (a.name || "").localeCompare(b.name || "", "zh-Hant");
}

function sortTools(tools, mode) {
  const copied = [...tools];

  switch (mode) {
    case "name-asc":
      return copied.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "zh-Hant")
      );

    case "updated-desc":
      return copied.sort(compareDateDesc);

    case "status":
      return copied.sort((a, b) => {
        const statusDiff = (statusOrderMap[a.status] ?? 999) - (statusOrderMap[b.status] ?? 999);
        if (statusDiff !== 0) return statusDiff;
        return compareDefault(a, b);
      });

    case "default":
    default:
      return copied.sort(compareDefault);
  }
}

function createToolCard(tool, options = {}) {
  const article = document.createElement("article");
  article.className = `card ${tool.featured ? "featured" : ""}`;

  const tags = (tool.tags || [])
    .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");

  const flags = [
    tool.featured ? `<span class="featured-badge">FEATURED</span>` : "",
    tool.isNew ? `<span class="new-badge">NEW</span>` : ""
  ].join("");

  const categoryLabel = getCategoryLabel(tool.category);
  const statusLabel = getStatusLabel(tool.status);
  const statusClass = `status-${tool.status || "draft"}`;

  article.innerHTML = `
    <div class="card-top">
      <div class="card-title-group">
        <div class="flag-row">${flags}</div>
        <h2>${escapeHtml(tool.name)} <small>(${escapeHtml(tool.name_en || "")})</small></h2>
      </div>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
    </div>
    <p>${escapeHtml(tool.description || "")}</p>
    <div class="meta-row">
      <span class="meta-pill">${escapeHtml(categoryLabel)}</span>
      <span class="meta-pill">${tool.supportsIframe ? "可預覽" : "僅外部開啟"}</span>
      ${tool.updatedAt ? `<span class="meta-pill">更新：${escapeHtml(tool.updatedAt)}</span>` : ""}
    </div>
    <div class="tag-row">${tags}</div>
    <div class="actions">
      <a href="${tool.path}" target="_blank" rel="noopener noreferrer">開啟</a>
      ${
        tool.supportsIframe
          ? `<button data-src="${tool.path}" type="button">預覽</button>`
          : `<button disabled type="button">不可預覽</button>`
      }
    </div>
    ${options.showUpdatedText ? `<div class="updated-text">最後更新：${escapeHtml(tool.updatedAt || "未標記")}</div>` : ""}
  `;

  return article;
}

function bindPreviewButtons() {
  document.querySelectorAll("button[data-src]").forEach(btn => {
    btn.addEventListener("click", () => {
      frame.src = btn.dataset.src;
    });
  });
}

function renderFeaturedTools() {
  const featuredTools = sortTools(
    allTools.filter(tool => tool.featured),
    "default"
  );

  featuredGrid.innerHTML = "";

  if (!featuredTools.length) {
    featuredGrid.innerHTML = `
      <div class="empty-state">目前沒有標記為 featured 的工具。</div>
    `;
    return;
  }

  featuredTools.forEach(tool => {
    featuredGrid.appendChild(createToolCard(tool));
  });

  bindPreviewButtons();
}

function getFilteredTools() {
  const keyword = searchInput?.value.trim().toLowerCase() || "";

  return allTools.filter(tool => {
    const matchCategory =
      activeCategory === "all" || tool.category === activeCategory;

    const text = [
      tool.name,
      tool.name_en,
      tool.description,
      tool.category,
      tool.status,
      tool.updatedAt,
      ...(tool.tags || [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchKeyword = !keyword || text.includes(keyword);

    return matchCategory && matchKeyword;
  });
}

function renderTools(tools) {
  toolGrid.innerHTML = "";

  if (!tools.length) {
    toolGrid.innerHTML = `
      <div class="empty-state">
        找不到符合條件的工具，請調整搜尋字詞或分類條件。
      </div>
    `;
    resultCount.textContent = "0 個結果";
    return;
  }

  tools.forEach(tool => {
    toolGrid.appendChild(createToolCard(tool, { showUpdatedText: true }));
  });

  resultCount.textContent = `${tools.length} 個結果`;
  bindPreviewButtons();
}

function refreshToolView() {
  const filtered = getFilteredTools();
  const sorted = sortTools(filtered, sortSelect?.value || "default");
  renderTools(sorted);
}

function renderCategoryFilters() {
  const categories = [...new Set(allTools.map(tool => tool.category).filter(Boolean))];
  const categoryList = ["all", ...categories];

  categoryFilters.innerHTML = "";

  categoryList.forEach(category => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-chip ${category === activeCategory ? "active" : ""}`;
    btn.textContent = getCategoryLabel(category);

    btn.addEventListener("click", () => {
      activeCategory = category;
      renderCategoryFilters();
      refreshToolView();
    });

    categoryFilters.appendChild(btn);
  });
}

async function loadTools() {
  try {
    const res = await fetch("./tools.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    allTools = await res.json();
    renderFeaturedTools();
    renderCategoryFilters();
    refreshToolView();
  } catch (error) {
    const errorHtml = `
      <div class="empty-state">
        無法載入 tools.json，請檢查檔案路徑、JSON 格式與部署狀態。
      </div>
    `;
    featuredGrid.innerHTML = errorHtml;
    toolGrid.innerHTML = errorHtml;
    console.error(error);
  }
}

clearBtn?.addEventListener("click", () => {
  frame.src = "";
});

searchInput?.addEventListener("input", () => {
  refreshToolView();
});

sortSelect?.addEventListener("change", () => {
  refreshToolView();
});

resetFilters?.addEventListener("click", () => {
  activeCategory = "all";
  if (searchInput) searchInput.value = "";
  if (sortSelect) sortSelect.value = "default";
  renderCategoryFilters();
  refreshToolView();
});

loadTools();
