(() => {
  'use strict';

  const STORE_KEY = 'slow_motion_fabrics_v20';
  let preferredCollectionId = '';
  let lastSignature = '';

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const normalize = (st) => st === 'done' ? 'done' : (st === 'progress' ? 'progress' : 'todo');

  const getCurrentCollectionId = (state) => {
    if (preferredCollectionId && state?.collections?.[preferredCollectionId]) return preferredCollectionId;

    const activeFabricId = document.querySelector('.fabric-row.active')?.dataset?.fabricId || '';
    if (activeFabricId && state?.fabrics?.[activeFabricId]) {
      return state.fabrics[activeFabricId].collectionId;
    }

    const openCollection = document.querySelector('.collection.open')?.dataset?.collectionId || '';
    if (openCollection && state?.collections?.[openCollection]) return openCollection;

    return state?.settings?.collectionOrder?.find(cid => state.collections?.[cid])
      || Object.keys(state?.collections || {})[0]
      || '';
  };

  const getTodoGroups = (state, cid) => {
    const collection = state?.collections?.[cid];
    if (!collection) return [];

    const groups = [];
    for (const fid of collection.fabricOrder || []) {
      const fabric = state.fabrics?.[fid];
      if (!fabric) continue;

      const colors = (fabric.colorOrder || [])
        .filter(ck => normalize(fabric.colors?.[ck]) === 'todo')
        .map(String);

      if (colors.length) {
        groups.push({
          fabric: fabric.name || fid,
          colors
        });
      }
    }
    return groups;
  };

  const buildClipboardText = (state, cid) => {
    const collection = state.collections?.[cid];
    const groups = getTodoGroups(state, cid);
    const total = groups.reduce((sum, g) => sum + g.colors.length, 0);

    if (!groups.length) return {
      text: '',
      total: 0,
      collectionName: collection?.name || ''
    };

    const lines = [
      `LISTA KOLORÓW DO UCIĘCIA — ${collection?.name || 'Kolekcja'}`,
      `Łącznie: ${total} kolorów`,
      ''
    ];

    for (const group of groups) {
      lines.push(`${group.fabric}: ${group.colors.join(', ')}`);
    }

    return {
      text: lines.join('\n'),
      total,
      collectionName: collection?.name || ''
    };
  };

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  };

  const ensureStyles = () => {
    if (document.getElementById('copyTodoListStyles')) return;

    const style = document.createElement('style');
    style.id = 'copyTodoListStyles';
    style.textContent = `
      .copy-todo-wrap{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        margin-left:auto;
      }
      #copyTodoListBtn{
        white-space:nowrap;
        border-color:rgba(196,61,61,.30);
        background:#fffaf7;
      }
      #copyTodoListBtn:hover{
        border-color:rgba(196,61,61,.55);
        background:#fff4ef;
      }
      #copyTodoListBtn.copied{
        border-color:rgba(31,138,59,.45);
        background:#f2fff5;
        color:#1f7a36;
      }
      #copyTodoListBtn.empty{
        opacity:.72;
      }
      #copyTodoCollectionName{
        font-size:11px;
        color:var(--muted,#756b60);
        white-space:nowrap;
      }
      #leftCard .card-head{
        gap:10px;
        flex-wrap:wrap;
      }
      @media (max-width:720px){
        .copy-todo-wrap{
          width:100%;
          margin-left:0;
        }
        #copyTodoListBtn{
          flex:1 1 auto;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const ensureButton = () => {
    const head = document.querySelector('#leftCard .card-head');
    if (!head) return null;

    let wrap = document.getElementById('copyTodoWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'copyTodoWrap';
      wrap.className = 'copy-todo-wrap';
      wrap.innerHTML = `
        <button class="btn" id="copyTodoListBtn" type="button"
          title="Kopiuje tylko kolory ze statusem ✕ Do nagrania. Status ⏳ W trakcie jest pomijany, bo materiał jest już ucięty.">
          📋 Skopiuj listę niezrobionych
        </button>
        <span id="copyTodoCollectionName"></span>
      `;
      head.appendChild(wrap);

      wrap.querySelector('#copyTodoListBtn')?.addEventListener('click', async () => {
        const state = loadState();
        if (!state) return;

        const cid = getCurrentCollectionId(state);
        const result = buildClipboardText(state, cid);
        const btn = document.getElementById('copyTodoListBtn');
        if (!btn) return;

        const original = btn.textContent;
        if (!result.total) {
          btn.textContent = 'Brak kolorów do ucięcia ✓';
          btn.classList.add('empty');
          setTimeout(() => {
            btn.classList.remove('empty');
            render(true);
          }, 1500);
          return;
        }

        try {
          await copyText(result.text);
          btn.textContent = `✓ Skopiowano ${result.total} kolorów`;
          btn.classList.add('copied');
          setTimeout(() => {
            btn.classList.remove('copied');
            render(true);
          }, 1800);
        } catch (e) {
          console.warn('Nie udało się skopiować listy:', e);
          btn.textContent = 'Nie udało się skopiować';
          setTimeout(() => {
            btn.textContent = original;
            render(true);
          }, 1800);
        }
      });
    }
    return wrap;
  };

  const render = (force = false) => {
    ensureStyles();
    const wrap = ensureButton();
    const state = loadState();
    if (!wrap || !state) return;

    const cid = getCurrentCollectionId(state);
    const result = buildClipboardText(state, cid);
    const signature = JSON.stringify([cid, result.total, result.collectionName, result.text]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    const btn = document.getElementById('copyTodoListBtn');
    const name = document.getElementById('copyTodoCollectionName');

    if (btn && !btn.classList.contains('copied')) {
      btn.textContent = `📋 Skopiuj listę niezrobionych (${result.total})`;
      btn.classList.toggle('empty', result.total === 0);
    }
    if (name) name.textContent = result.collectionName;
  };

  document.addEventListener('click', (event) => {
    const collectionHeader = event.target.closest('[data-action="toggle-collection"][data-collection-id]');
    if (collectionHeader) {
      preferredCollectionId = collectionHeader.getAttribute('data-collection-id') || '';
      setTimeout(() => render(true), 30);
      return;
    }

    const fabricRow = event.target.closest('.fabric-row[data-fabric-id]');
    if (fabricRow) {
      const state = loadState();
      const fid = fabricRow.getAttribute('data-fabric-id') || '';
      const cid = state?.fabrics?.[fid]?.collectionId || '';
      if (cid) preferredCollectionId = cid;
      setTimeout(() => render(true), 30);
    }
  });

  const boot = () => {
    render(true);
    setInterval(() => render(false), 700);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
