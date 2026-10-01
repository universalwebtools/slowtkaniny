(() => {
  'use strict';

  const STORE_KEY = 'slow_motion_fabrics_v20';
  let activeFilter = 'progress';
  let lastSignature = '';

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const normalize = (st) => st === 'done' ? 'done' : (st === 'progress' ? 'progress' : 'todo');

  const META = {
    todo: { symbol: '✕', label: 'Do nagrania', cls: 'todo' },
    progress: { symbol: '⏳', label: 'W trakcie', cls: 'progress' },
    done: { symbol: '✓', label: 'Nagrane', cls: 'done' }
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const currentCollectionId = (state) => {
    const activeFabricId = document.querySelector('.fabric-row.active')?.dataset?.fabricId || '';
    if (activeFabricId && state?.fabrics?.[activeFabricId]) return state.fabrics[activeFabricId].collectionId;

    const openCollection = document.querySelector('.collection.open')?.dataset?.collectionId || '';
    if (openCollection && state?.collections?.[openCollection]) return openCollection;

    return state?.settings?.collectionOrder?.find(cid => state.collections?.[cid]) || Object.keys(state?.collections || {})[0] || '';
  };

  const ensureStyles = () => {
    if (document.getElementById('statusOverviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'statusOverviewStyles';
    style.textContent = `
      #statusOverviewPanel{
        margin:10px 12px 4px;
        border:1px solid var(--border,#e6ded2);
        border-radius:14px;
        background:#fffdf9;
        overflow:hidden;
      }
      .status-overview-head{
        padding:10px 12px 8px;
        border-bottom:1px solid var(--border,#e6ded2);
        background:linear-gradient(180deg,#fff,#fffaf2);
      }
      .status-overview-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;}
      .status-overview-title strong{font-size:13px;}
      .status-overview-title span{font-size:11px;color:var(--muted,#6f6456);text-align:right;}
      .status-filter-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
      .status-filter-btn{
        border:1px solid var(--border2,#d7cbbb);
        background:#fff;
        border-radius:999px;
        padding:6px 9px;
        cursor:pointer;
        font-size:12px;
        font-weight:700;
      }
      .status-filter-btn.active{box-shadow:0 0 0 3px rgba(47,111,237,.13);border-color:#7ca2f6;}
      .status-filter-btn.todo{color:#b93232;}
      .status-filter-btn.progress{color:#b06e00;background:#fffaf0;}
      .status-filter-btn.done{color:#1f7a36;}
      .status-overview-list{max-height:230px;overflow:auto;padding:8px;}
      .status-overview-item{
        width:100%;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        border:1px solid transparent;
        background:transparent;
        border-radius:10px;
        padding:7px 8px;
        cursor:pointer;
        text-align:left;
        font:inherit;
      }
      .status-overview-item:hover{background:#fbf7f1;border-color:#eadfce;}
      .status-overview-item .name{font-weight:750;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .status-overview-item .right{display:flex;gap:7px;align-items:center;flex:0 0 auto;}
      .status-overview-item .color{font-weight:900;font-variant-numeric:tabular-nums;background:#f6efe6;border:1px solid #eadfce;border-radius:999px;padding:3px 7px;}
      .status-dot{font-weight:900;min-width:18px;text-align:center;}
      .status-dot.todo{color:#c43d3d}.status-dot.progress{color:#d88700}.status-dot.done{color:#1f8a3b}
      .status-overview-empty{padding:14px;text-align:center;color:var(--muted,#6f6456);font-size:12px;}
      .status-overview-more{padding:6px 10px 10px;color:var(--muted,#6f6456);font-size:11px;text-align:center;}
      @media (max-width:980px){.status-overview-list{max-height:190px;}}
    `;
    document.head.appendChild(style);
  };

  const ensurePanel = () => {
    const rightCard = document.getElementById('rightCard');
    const detailPane = document.getElementById('detailPane');
    if (!rightCard || !detailPane) return null;
    let panel = document.getElementById('statusOverviewPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'statusOverviewPanel';
      rightCard.insertBefore(panel, detailPane);
    }
    return panel;
  };

  const collectRows = (state, cid) => {
    const c = state?.collections?.[cid];
    if (!c) return [];
    const rows = [];
    for (const fid of c.fabricOrder || []) {
      const f = state.fabrics?.[fid];
      if (!f) continue;
      for (const ck of f.colorOrder || []) {
        rows.push({
          fid,
          fabric: f.name || fid,
          color: String(ck),
          status: normalize(f.colors?.[ck])
        });
      }
    }
    return rows;
  };

  const jumpTo = (fid, color) => {
    const search = document.getElementById('searchInput');
    if (search && search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles:true }));
    }

    const fabricRow = document.querySelector(`.fabric-row[data-fabric-id="${CSS.escape(fid)}"]`);
    if (fabricRow) fabricRow.click();

    setTimeout(() => {
      const colorRow = [...document.querySelectorAll('.color-row[data-color]')]
        .find(el => String(el.dataset.color) === String(color));
      colorRow?.scrollIntoView({ behavior:'smooth', block:'center' });
      if (colorRow) {
        colorRow.animate([
          { boxShadow:'0 0 0 0 rgba(216,135,0,0)' },
          { boxShadow:'0 0 0 5px rgba(216,135,0,.28)' },
          { boxShadow:'0 0 0 0 rgba(216,135,0,0)' }
        ], { duration:1100, easing:'ease-out' });
      }
    }, 90);
  };

  const render = (force=false) => {
    ensureStyles();
    const panel = ensurePanel();
    const state = loadState();
    if (!panel || !state) return;

    const cid = currentCollectionId(state);
    const collection = state.collections?.[cid];
    if (!collection) return;

    const rows = collectRows(state, cid);
    const counts = {
      all: rows.length,
      todo: rows.filter(r => r.status === 'todo').length,
      progress: rows.filter(r => r.status === 'progress').length,
      done: rows.filter(r => r.status === 'done').length
    };

    const filtered = activeFilter === 'all' ? rows : rows.filter(r => r.status === activeFilter);
    const signature = JSON.stringify([cid, activeFilter, counts, filtered.slice(0,250).map(r => [r.fid,r.color,r.status])]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    const max = 250;
    const visible = filtered.slice(0,max);
    panel.innerHTML = `
      <div class="status-overview-head">
        <div class="status-overview-title">
          <strong>Lista kolorów wg statusu</strong>
          <span>${esc(collection.name || '')}</span>
        </div>
        <div class="status-filter-row">
          <button class="status-filter-btn ${activeFilter==='all'?'active':''}" data-status-filter="all">Wszystkie ${counts.all}</button>
          <button class="status-filter-btn todo ${activeFilter==='todo'?'active':''}" data-status-filter="todo">✕ Do nagrania ${counts.todo}</button>
          <button class="status-filter-btn progress ${activeFilter==='progress'?'active':''}" data-status-filter="progress">⏳ W trakcie ${counts.progress}</button>
          <button class="status-filter-btn done ${activeFilter==='done'?'active':''}" data-status-filter="done">✓ Nagrane ${counts.done}</button>
        </div>
      </div>
      <div class="status-overview-list">
        ${visible.length ? visible.map(r => {
          const m = META[r.status];
          return `<button class="status-overview-item" data-status-jump-fid="${esc(r.fid)}" data-status-jump-color="${esc(r.color)}">
            <span class="name">${esc(r.fabric)}</span>
            <span class="right"><span class="color">${esc(r.color)}</span><span class="status-dot ${m.cls}" title="${esc(m.label)}">${m.symbol}</span></span>
          </button>`;
        }).join('') : `<div class="status-overview-empty">Brak kolorów z tym statusem w tej kolekcji.</div>`}
      </div>
      ${filtered.length > max ? `<div class="status-overview-more">Pokazano pierwsze ${max} z ${filtered.length} pozycji.</div>` : ''}
    `;

    panel.querySelectorAll('[data-status-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.statusFilter || 'all';
        lastSignature = '';
        render(true);
      });
    });

    panel.querySelectorAll('[data-status-jump-fid]').forEach(btn => {
      btn.addEventListener('click', () => jumpTo(btn.dataset.statusJumpFid, btn.dataset.statusJumpColor));
    });
  };

  const boot = () => {
    render(true);
    setInterval(() => render(false), 650);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
