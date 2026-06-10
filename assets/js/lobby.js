const toolGrid = document.getElementById("toolGrid");
const frame = document.getElementById("previewFrame");
const clearBtn = document.getElementById("clearPreview");

function createToolCard(tool) {
  const article = document.createElement("article");
  article.className = "card";

  const tags = (tool.tags || [])
    .map(tag => `<span class="tag">${tag}</span>`)
    .join("");

  article.innerHTML = `
    <h2>${tool.name} <small>(${tool.name_en})</small></h2>
    <p>${tool.description}</p>
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

async function loadTools() {
  try {
    const res = await fetch("./tools.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tools = await res.json();

    toolGrid.innerHTML = "";
    tools.forEach(tool => {
      const card = createToolCard(tool);
      toolGrid.appendChild(card);
    });

    document.querySelectorAll("button[data-src]").forEach(btn => {
      btn.addEventListener("click", () => {
        frame.src = btn.dataset.src;
      });
    });
  } catch (error) {
    toolGrid.innerHTML = `
      <article class="card">
        <h2>載入失敗</h2>
        <p>目前無法讀取 tools.json，請檢查檔案路徑、JSON 格式，或 GitHub Pages 部署是否完成。</p>
      </article>
    `;
    console.error(error);
  }
}

clearBtn?.addEventListener("click", () => {
  frame.src = "";
});

loadTools();
