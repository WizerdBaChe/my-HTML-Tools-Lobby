const toolGrid = document.getElementById("toolGrid");
const frame = document.getElementById("previewFrame");
const clearBtn = document.getElementById("clearPreview");
const searchInput = document.getElementById("searchInput");

let allTools = [];

function createToolCard(tool) {
  const article = document.createElement("article");
  article.className = "card";

  const tags = (tool.tags || [])
    .map(tag => `<span class="tag">${tag}</span>`)
    .join("");

  article.innerHTML = `
    <h2>${tool.name} <small>(${tool.name_en || ""})</small></h2>
    <p>${tool.description || ""}</p>
    <div class="tag-row">${tags}</div>
    <div class="actions">
      <a href="${tool.path}" target="_blank" rel="noopener noreferrer">開啟</a>
      ${
        tool.supportsIframe
          ? `<button data-src="${tool.path}">預覽</button>`
          : `<button disabled>不可預覽</button>`
      }
    </div>
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

function renderTools(tools) {
  toolGrid.innerHTML = "";

  if (!tools.length) {
    toolGrid.innerHTML = `
      <div class="empty-state">
        找不到符合條件的工具。
      </div>
    `;
    return;
  }

  tools.forEach(tool => {
    toolGrid.appendChild(createToolCard(tool));
  });

  bindPreviewButtons();
}

function filterTools(keyword) {
  const q = keyword.trim().toLowerCase();

  if (!q) {
    renderTools(allTools);
    return;
  }

  const filtered = allTools.filter(tool => {
    const text = [
      tool.name,
      tool.name_en,
      tool.description,
      ...(tool.tags || []),
      tool.category
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(q);
  });

  renderTools(filtered);
}

async function loadTools() {
  try {
    const res = await fetch("./tools.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    allTools = await res.json();
    renderTools(allTools);
  } catch (error) {
    toolGrid.innerHTML = `
      <div class="empty-state">
        無法載入 tools.json，請檢查檔案路徑、JSON 格式與部署狀態。
      </div>
    `;
    console.error(error);
  }
}

clearBtn?.addEventListener("click", () => {
  frame.src = "";
});

searchInput?.addEventListener("input", (e) => {
  filterTools(e.target.value);
});

loadTools();
