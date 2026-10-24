/*
 * drop-wheel-config.js — 「輪盤配置」 dialog for the drop wheel loadouts.
 * One <dialog>: tabs per file kind, the 8 fixed slots as a 3x3 compass grid
 * (centre = cancel zone), a select per slot, 還原預設, and the list of library
 * items that are not on the wheel. Edits persist immediately via window.DropWheel.
 * Needs drop-wheel-geom.js and drop-wheel.js loaded first.
 */
(function () {
  'use strict';

  var Core = window.DropWheelCore;
  var DW = window.DropWheel;
  if (!Core || !DW) { console.error('[drop-wheel-config] drop wheel core missing; config disabled'); return; }

  var KIND_LABELS = { image: '圖片', svg: 'SVG', 'json-csv': 'JSON / CSV', 'text-code': '文字／程式碼', other: '其他檔案', unknown: '無法判斷' };
  var DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
  // grid cell (row, col) of each slot index; the centre cell is the cancel zone
  var CELL = [[1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1], [1, 1]];

  var dialog, tabsEl, gridEl, libEl, hintEl, openBtn, kind = 'image', lastFocus = null;

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function optionLabel(it) {
    if (it.id === Core.MORE_ID) return '「更多」（未上輪盤的項目）';
    return it.type === 'group' ? '▸ ' + it.name + '（' + it.children.length + ' 個）' : it.name;
  }

  function currentIds() { return DW.slotIds(kind); }

  function setSlot(i, value) {
    var ids = currentIds().slice();
    var prev = ids[i];
    var v = value === '' ? null : value;
    if (v) {
      var j = ids.indexOf(v);
      if (j >= 0 && j !== i) ids[j] = prev || null;   // item lives in one slot only: swap
    }
    ids[i] = v;
    DW.setSlotIds(kind, ids);
    render();
  }

  function render() {
    var lib = DW.library(kind);
    var ids = currentIds();

    Array.prototype.forEach.call(tabsEl.children, function (b) {
      var on = b.getAttribute('data-kind') === kind;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('is-active', on);
    });

    gridEl.textContent = '';
    for (var i = 0; i < 8; i++) {
      var cell = el('div', 'dwc-cell', gridEl);
      cell.style.gridRow = CELL[i][0]; cell.style.gridColumn = CELL[i][1];
      cell.style.order = i;
      var id = 'dwc-slot-' + i;
      var lab = el('label', 'dwc-cell__dir', cell, DIRS[i]);
      lab.setAttribute('for', id);
      var sel = el('select', 'dwc-select', cell);
      sel.id = id;
      sel.setAttribute('data-slot', i);
      var o0 = el('option', '', sel, '空'); o0.value = '';
      lib.forEach(function (it) { var o = el('option', '', sel, optionLabel(it)); o.value = it.id; });
      var om = el('option', '', sel, optionLabel({ id: Core.MORE_ID })); om.value = Core.MORE_ID;
      sel.value = ids[i] || '';
      sel.addEventListener('change', (function (idx) { return function (e) { setSlot(idx, e.target.value); focusSlot(idx); }; })(i));
    }
    var mid = el('div', 'dwc-centre', gridEl, '中央放開＝取消');
    mid.style.gridRow = 2; mid.style.gridColumn = 2;

    var placed = {};
    ids.forEach(function (x) { if (x) placed[x] = true; });
    libEl.textContent = '';
    var off = lib.filter(function (it) { return !placed[it.id]; });
    if (!off.length) {
      el('li', 'dwc-lib__none', libEl, '所有項目都已在輪盤上。');
    } else {
      off.forEach(function (it) {
        var li = el('li', 'dwc-lib__item', libEl);
        el('span', 'dwc-lib__name', li, it.type === 'group' ? '▸ ' + it.name : it.name);
        if (it.type === 'group') el('span', 'dwc-lib__sub', li, it.children.map(function (c) { return c.name; }).join('、') + (it.extra ? '（輪盤最多顯示 5 個，另 ' + it.extra + ' 個只在這裡）' : ''));
      });
    }
    hintEl.textContent = DW.isCustom(kind) ? '已自訂此類檔案的配置。' : '目前是預設配置。';
  }

  function focusSlot(i) {
    var s = gridEl.querySelector('#dwc-slot-' + i);
    if (s) s.focus();
  }

  function open() {
    lastFocus = document.activeElement;
    render();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    var active = tabsEl.querySelector('.is-active');
    if (active) active.focus();
  }

  function close() {
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
  }

  function build() {
    openBtn = el('button', 'btn btn--ghost dw-config-btn', null, '輪盤配置');
    openBtn.type = 'button';
    openBtn.setAttribute('aria-haspopup', 'dialog');
    openBtn.title = '設定拖放檔案時 Shift 輪盤上的工具';
    var sort = document.getElementById('sort-select');
    if (sort && sort.parentNode) sort.parentNode.insertBefore(openBtn, sort.nextSibling);
    else { console.error('[drop-wheel-config] toolbar not found; config button not mounted'); return; }

    dialog = el('dialog', 'dwc', document.body);
    dialog.setAttribute('aria-labelledby', 'dwc-title');
    var head = el('div', 'dwc__head', dialog);
    var h = el('h2', 'dwc__title', head, '輪盤配置'); h.id = 'dwc-title';
    var x = el('button', 'btn btn--ghost btn--sm', head, '關閉'); x.type = 'button';
    x.addEventListener('click', close);
    el('p', 'dwc__lead', dialog, '拖檔案到大廳再按 Shift 會出現輪盤。八個位置的方向固定，這裡決定每種檔案的每個位置放哪個工具。變更立即儲存在這個瀏覽器。');

    tabsEl = el('div', 'dwc__tabs', dialog);
    tabsEl.setAttribute('role', 'group');
    tabsEl.setAttribute('aria-label', '檔案類型');
    DW.kinds.forEach(function (k) {
      var b = el('button', 'dwc__tab', tabsEl, KIND_LABELS[k] || k);
      b.type = 'button'; b.setAttribute('data-kind', k);
      b.addEventListener('click', function () { kind = k; render(); b.focus(); });
    });

    gridEl = el('div', 'dwc__grid', dialog);
    var bar = el('div', 'dwc__bar', dialog);
    hintEl = el('span', 'dwc__state', bar);
    var reset = el('button', 'btn btn--ghost btn--sm', bar, '還原預設'); reset.type = 'button';
    reset.addEventListener('click', function () { DW.reset(kind); render(); reset.focus(); });

    el('h3', 'dwc__sub', dialog, '不在輪盤上的項目');
    libEl = el('ul', 'dwc-lib', dialog);

    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });   // backdrop click
    dialog.addEventListener('close', function () { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
    openBtn.addEventListener('click', open);
  }

  function init() { DW.whenReady(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
