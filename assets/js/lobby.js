/**
 * HTML Tools Lobby — lobby.js (防呆安全修正版)
 * Data flow: fetch tools.json → render featured + all tools
 * Handles: search, category filter, sort, iframe preview modal
 */

/* ── State ──────────────────────────────────────────────────── */
const state = {
  tools: [],
  query: '',
  category: 'all',
  sort: 'order',
};

/* ── Category icon map ──────────────────────────────────────── */
const CATEGORY_ICONS = {
  utility:      '🔧',
  developer:    '💻',
  text:         '📝',
  data:         '📊',
  image:        '🖼️',
  experimental: '🧪',
  default:      '⚙️',
};

/* ── Status → badge class map ───────────────────────────────── */
const STATUS_CLASS = {
  ready: 'badge--ready',
  beta:  'badge--beta',
  draft: 'badge--draft',
};

/* ── DOM refs ───────────────────────────────────────────────── */
let $searchInput, $sortSelect, $filterBtns, $featuredSection, $featuredGrid,
    $allSection, $allGrid, $toolCount, $modal, $modalOverlay, $modalTitle,
    $modalIframe, $modalOpenLink;

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  cacheDOM();
  
  // 【防呆修正】只有當頁面存在主要的大廳網格時，才初始化大廳專用的資料載入與事件綁定
  if ($allGrid) {
    loadTools();
  }
  
  // 基礎事件與導覽列標明不受頁面限制，皆可安全執行
  bindEvents();
  highlightCurrentNav();
});

function cacheDOM() {
  $searchInput    = document.getElementById('search-input');
  $sortSelect     = document.getElementById('sort-select');
  $filterBtns     = document.querySelectorAll('[data-category]');
  $featuredSection= document.getElementById('section-featured');
  $featuredGrid   = document.getElementById('featured-grid');
  $allSection     = document.getElementById('section-all');
  $allGrid        = document.getElementById('all-grid');
  $toolCount      = document.getElementById('tool-count');
  $modalOverlay   = document.getElementById('modal-overlay');
  $modal          = document.getElementById('preview-modal');
  $modalTitle     = document.getElementById('modal-title');
  $modalIframe    = document.getElementById('modal-iframe');
  $modalOpenLink  = document.getElementById('modal-open-link');
}

/* ── Data Loading ───────────────────────────────────────────── */
async function loadTools() {
  // 【防呆修正】確保網格存在才渲染骨架屏
  if ($allGrid) renderSkeletons($allGrid, 6);

  try {
    const base = getBasePath();
    const res  = await fetch(`${base}tools.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.tools = await res.json();
  } catch (err) {
    console.error('[Lobby] Failed to load tools.json:', err);
    if ($allGrid) {
      $allGrid.innerHTML = errorState('無法載入工具清單，請確認 tools.json 是否存在。');
    }
    return;
  }

  buildCategoryFilters();
  render();
}

/* Derive the lobby's base path so relative links work from subdirs */
function getBasePath() {
  const script = document.querySelector('script[src*="lobby.js"]');
  if (script) {
    return new URL('../../', new URL(script.src, location.href)).href;
  }
  return location.href.replace(/\/[^/]*$/, '/');
}

/* ── Rendering ──────────────────────────────────────────────── */
function render() {
  const visible = filter(state.tools);
  const sorted  = sort(visible);

  const featured = sorted.filter(t => t.featured);
  const all      = sorted;

  // Featured section
  if (featured.length && state.query === '' && state.category === 'all') {
    $featuredSection && ($featuredSection.hidden = false);
    $featuredGrid && renderCards($featuredGrid, featured, true);
  } else {
    $featuredSection && ($featuredSection.hidden = true);
  }

  // All tools
  if ($toolCount) $toolCount.textContent = all.length;

  // 【防呆修正】確保網格存在才渲染主要卡片區
  if ($allGrid) {
    if (all.length === 0) {
      $allGrid.innerHTML = emptyState();
    } else {
      renderCards($allGrid, all, false);
    }
  }
}

function renderCards($grid, tools, featured) {
  if (!$grid) return;
  $grid.innerHTML = tools.map(t => cardHTML(t, featured)).join('');

  // Bind preview buttons
  $grid.querySelectorAll('[data-preview]').forEach(btn => {
    btn.addEventListener('click', () => openPreview(btn.dataset.preview));
  });
}

function cardHTML(t, featured = false) {
  const icon    = CATEGORY_ICONS[t.category] || CATEGORY_ICONS.default;
  const badgeStatus = `<span class="badge ${STATUS_CLASS[t.status] || 'badge--draft'}" aria-label="狀態">${t.status}</span>`;
  const badgeNew     = t.isNew      ? `<span class="badge badge--new">NEW</span>` : '';
  const badgeFeat    = t.featured && !featured ? `<span class="badge badge--featured">精選</span>` : '';

  const tags = (t.tags || []).slice(0, 3).map(tag =>
    `<span class="tag">${escHtml(tag)}</span>`
  ).join('');

  // 預覽按鈕邏輯保持不變
  const previewBtn = t.supportsIframe
    ? `<button class="btn btn--ghost btn--sm" data-preview="${escAttr(t.path)}" aria-label="預覽 ${escAttr(t.name)}">
         <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
         預覽
       </button>`
    : '';

  const base = getBasePath();
  
  // 💡 【修正核心】判斷是否為外部絕對網址
  const isExternalUrl = t.path.startsWith('http://') || t.path.startsWith('https://');
  const finalUrl = isExternalUrl ? t.path : `${base}${t.path.replace(/^\.\//, '')}`;

  return `
  <article class="card${featured ? ' card--featured' : ''}" role="article" aria-label="${escAttr(t.name)}">
    <div class="card__header">
      <div class="card__icon" aria-hidden="true">${icon}</div>
      <div class="card__badges">
        ${badgeNew}${badgeFeat}${badgeStatus}
      </div>
    </div>
    <div class="card__body">
      <h3 class="card__name">
        ${escHtml(t.name)}
        <span class="card__name-en">${escHtml(t.name_en || '')}</span>
      </h3>
      <p class="card__desc">${escHtml(t.description || '')}</p>
    </div>
    ${tags ? `<div class="card__tags">${tags}</div>` : ''}
    <footer class="card__footer">
      <a href="${escAttr(finalUrl)}"
         class="btn btn--primary btn--sm"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="開啟 ${escAttr(t.name)}">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M13 1h2v2m0-2L8 8"/></svg>
        開啟
      </a>
      ${previewBtn}
    </footer>
  </article>`;
}

/* ── Filter / Sort helpers ──────────────────────────────────── */
function filter(tools) {
  const q   = state.query.toLowerCase().trim();
  const cat = state.category;

  return tools.filter(t => {
    const matchCat = cat === 'all' || t.category === cat;
    if (!matchCat) return false;
    if (!q) return true;

    return (
      t.name?.toLowerCase().includes(q) ||
      t.name_en?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
    );
  });
}

function sort(tools) {
  const key = state.sort;
  return [...tools].sort((a, b) => {
    if (key === 'order')     return (a.order ?? 999) - (b.order ?? 999);
    if (key === 'name')      return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
    if (key === 'updatedAt') return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    return 0;
  });
}

/* ── Category filter buttons (dynamic build) ────────────────── */
function buildCategoryFilters() {
  if (!$filterBtns || !$filterBtns.length) return;

  const categories = ['all', ...new Set(state.tools.map(t => t.category).filter(Boolean))];
  const container  = document.getElementById('filter-group');
  if (!container) return;

  container.innerHTML = categories.map(cat => `
    <button class="filter-btn${cat === 'all' ? ' is-active' : ''}"
            data-category="${escAttr(cat)}"
            aria-pressed="${cat === 'all' ? 'true' : 'false'}">
      ${cat === 'all' ? '全部' : cat}
    </button>
  `).join('');

  container.querySelectorAll('[data-category]').forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.category));
  });
}

/* ── Event Bindings ─────────────────────────────────────────── */
function bindEvents() {
  // Search
  if ($searchInput) {
    let debounceTimer;
    $searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.query = $searchInput.value;
        render();
      }, 180);
    });
  }

  // Sort
  if ($sortSelect) {
    $sortSelect.addEventListener('change', () => {
      state.sort = $sortSelect.value;
      render();
    });
  }

  // Category (static buttons)
  document.querySelectorAll('[data-category]').forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.category));
  });

  // Modal close
  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closePreview);

  if ($modalOverlay) {
    $modalOverlay.addEventListener('click', e => {
      if (e.target === $modalOverlay) closePreview();
    });
  }

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePreview();
  });
}

function setCategory(cat) {
  state.category = cat;

  document.querySelectorAll('[data-category]').forEach(btn => {
    const active = btn.dataset.category === cat;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  render();
}

/* ── Preview Modal ──────────────────────────────────────────── */
function openPreview(path) {
  if (!$modalOverlay || !$modalIframe) return;

  const tool  = state.tools.find(t => t.path === path);
  const label = tool ? tool.name : 'Tool Preview';
  const base  = getBasePath();
  const url   = `${base}${path.replace(/^\.\//, '')}`;

  if ($modalTitle)    $modalTitle.textContent = label;
  if ($modalOpenLink) { $modalOpenLink.href = url; }
  $modalIframe.src = url;

  $modalOverlay.classList.add('is-open');
  $modalOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
}

function closePreview() {
  if (!$modalOverlay) return;
  $modalOverlay.classList.remove('is-open');
  $modalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  setTimeout(() => {
    if ($modalIframe) $modalIframe.src = 'about:blank';
  }, 300);
}

/* ── Skeleton Loader ────────────────────────────────────────── */
function renderSkeletons($grid, count) {
  if (!$grid) return;
  $grid.innerHTML = Array.from({ length: count }, () => `
    <div class="card" aria-hidden="true">
      <div class="card__header">
        <div class="skeleton" style="width:44px;height:44px;border-radius:var(--radius)"></div>
        <div class="skeleton" style="width:60px;height:22px;border-radius:999px"></div>
      </div>
      <div class="card__body">
        <div class="skeleton" style="width:70%;height:18px;margin-bottom:8px"></div>
        <div class="skeleton" style="width:100%;height:14px;margin-bottom:4px"></div>
        <div class="skeleton" style="width:80%;height:14px"></div>
      </div>
      <div class="card__footer" style="border-top:1px solid var(--color-border);padding-top:12px">
        <div class="skeleton" style="flex:1;height:30px"></div>
      </div>
    </div>
  `).join('');
}

/* ── Template helpers ───────────────────────────────────────── */
function emptyState() {
  return `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state__icon">🔍</div>
      <h3 class="empty-state__title">找不到相符的工具</h3>
      <p>試著換個關鍵字，或切換到「全部」分類。</p>
    </div>`;
}

function errorState(msg) {
  return `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state__icon">⚠️</div>
      <h3 class="empty-state__title">載入失敗</h3>
      <p>${escHtml(msg)}</p>
    </div>`;
}

/* ── Active nav highlight ───────────────────────────────────── */
function highlightCurrentNav() {
  const path = location.pathname;
  document.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    const norm = s => s.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
    link.classList.toggle('is-active', norm(href) === norm(path));
  });
}

/* ── XSS helpers ────────────────────────────────────────────── */
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(s) { return escHtml(s); }