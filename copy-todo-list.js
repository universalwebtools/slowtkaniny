(() => {
  'use strict';

  const STORE_KEY = 'slow_motion_fabrics_v20';
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

  const getActiveFabricId = () =>
    document.querySelector('.fabric-row.active')?.dataset?.fabricId || '';

  const getTodoColors = (state, fid) => {
    const fabric = state?.fabrics?.[fid];
    if (!fabric) return [];
    return (fabric.colorOrder || [])
      .filter(ck => normalize(fabric.colors?.[ck]) === 'todo')
      .map(String);
  };

  const buildClipboardText = (state, fid) => {
    const fabric = state?.fabrics?.[fid];
    if (!fabric) return { text:'', total:0, fabricName:'' };

    const colors = getTodoColors(state, fid);
    if (!colors.length) {
      return { text:'', total:0, fabricName:fabric.name || fid };
    }

    const lines = [
      `${fabric.name || fid} — kolory do ucięcia`,
      colors.join(', ')
    ];

    return {
      text: lines.join('\n'),
      total: colors.length,
      fabricName: fabric.name || fid
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
      #copyTodoWrap{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        margin-top:8px;
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
      #copyTodoFabricName{
        font-size:11px;
        color:var(--muted,#756b60);
        white-space:nowrap;
      }
      @media (max-width:720px){
        #copyTodoWrap{width:100%;}
        #copyTodoListBtn{flex:1 1 auto;}
      }
    `;
    document.head.appendChild(style);
  };

  const ensureButton = () => {
    const detailTitle = document.querySelector('#detailPane .detail-title > div:first-child');
    if (!detailTitle) {
      document.getElementById('copyTodoWrap')?.remove();
      return null;
    }

    let wrap = document.getElementById('copyTodoWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'copyTodoWrap';
      wrap.innerHTML = `
        <button class="btn" id="copyTodoListBtn" type="button"
          title="Kopiuje tylko kolory tej tkaniny ze statusem ✕ Do nagrania. ⏳ W trakcie jest pomijane.">
          📋 Skopiuj niezrobione
        </button>
        <span id="copyTodoFabricName"></span>
      `;
      detailTitle.appendChild(wrap);

      wrap.querySelector('#copyTodoListBtn')?.addEventListener('click', async () => {
        const state = loadState();
        const fid = getActiveFabricId();
        if (!state || !fid) return;

        const result = buildClipboardText(state, fid);
        const btn = document.getElementById('copyTodoListBtn');
        if (!btn) return;

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
          setTimeout(() => render(true), 1800);
        }
      });
    } else if (!detailTitle.contains(wrap)) {
      detailTitle.appendChild(wrap);
    }

    return wrap;
  };

  const removeOldHeaderButton = () => {
    const old = document.querySelector('#leftCard #copyTodoWrap');
    if (old) old.remove();
  };

  const render = (force = false) => {
    removeOldHeaderButton();
    ensureStyles();

    const state = loadState();
    const fid = getActiveFabricId();
    if (!state || !fid || !state.fabrics?.[fid]) {
      document.getElementById('copyTodoWrap')?.remove();
      lastSignature = '';
      return;
    }

    const wrap = ensureButton();
    if (!wrap) return;

    const result = buildClipboardText(state, fid);
    const signature = JSON.stringify([fid, result.total, result.fabricName, result.text]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    const btn = document.getElementById('copyTodoListBtn');
    const name = document.getElementById('copyTodoFabricName');

    if (btn && !btn.classList.contains('copied')) {
      btn.textContent = `📋 Skopiuj niezrobione (${result.total})`;
      btn.classList.toggle('empty', result.total === 0);
    }
    if (name) name.textContent = result.fabricName;
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('.fabric-row[data-fabric-id]')) {
      setTimeout(() => {
        lastSignature = '';
        render(true);
      }, 50);
    }
  });

  const boot = () => {
    render(true);
    setInterval(() => render(false), 700);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();
