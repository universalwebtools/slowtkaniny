(() => {
  'use strict';

  // ---------- Helpers ----------
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
  const nowIso = () => new Date().toISOString();
  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : ('id_' + Math.random().toString(16).slice(2) + Date.now().toString(16)));
  const slug = (s) => (s || '').toString().trim().toLowerCase().replace(/[^\w\s-]/g,'').replace(/[\s_-]+/g,'-').replace(/^-+|-+$/g,'') || 'item';
  const fmtColor = (x) => {
    const s = String(x).trim();
    if (!s) return '';
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      if (n < 10) return '0' + n;
      return String(n);
    }
    return s;
  };
  const parseColorInput = (text) => {
    // Accept: "1-10, 15, 22"
    const out = [];
    const parts = (text || '').split(/[,;\s]+/).map(p => p.trim()).filter(Boolean);
    for (const p of parts) {
      const m = p.match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);
      if (m) {
        let a = parseInt(m[1],10), b = parseInt(m[2],10);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          const step = a <= b ? 1 : -1;
          for (let n=a; step>0 ? n<=b : n>=b; n+=step) out.push(fmtColor(n));
        }
      } else if (/^\d{1,4}$/.test(p)) {
        out.push(fmtColor(p));
      }
    }
    return [...new Set(out)];
  };

  const toastEl = $('#toast');
  let toastTimer = null;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  };

  // ---------- Storage keys ----------
  const STORE_KEY = 'slow_fabric_tracker_v17';
  const CLIENT_ID_KEY = 'slow_fabric_tracker_client_id';
  const CLOUD_CFG_KEY = 'slow_fabric_tracker_cloud_cfg_v1';

  const clientId = (() => {
    const prev = localStorage.getItem(CLIENT_ID_KEY);
    if (prev) return prev;
    const id = uid();
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  })();

  // ---------- State ----------
  let state = null;             // app data
  let selectedFabricId = null;  // current fabric
  let bulkMode = false;
  let undoStack = []; // array of previous state snapshots (data only)
  const UNDO_MAX = 10;

  // Cloud runtime
  let cloud = {
    configured: false,
    config: null,
    workspaceId: 'studio',
    authMode: 'google',
    app: null,
    auth: null,
    db: null,
    user: null,
    unsub: null,
    ready: false,
    saving: false,
    lastRemoteRev: 0,
    lastLocalRev: 0,
    saveTimer: null
  };

  // ---------- Initialize state ----------
  const seed = window.SEED_DATA;
  const loadState = () => {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        // minimal validation
        if (obj && obj.schemaVersion === 1 && obj.collections && obj.fabrics) return obj;
      } catch {}
    }
    return deepClone(seed);
  };

  const saveLocal = () => {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  };

  const pushUndo = () => {
    undoStack.push(deepClone(state));
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    $('#undoBtn').disabled = undoStack.length === 0;
  };

  const undo = () => {
    if (!undoStack.length) return;
    state = undoStack.pop();
    saveLocal();
    $('#undoBtn').disabled = undoStack.length === 0;
    renderAll();
    toast('Cofnięto zmianę');
    scheduleCloudSave();
  };

  // ---------- Cloud config UI ----------
  const loadCloudCfg = () => {
    const raw = localStorage.getItem(CLOUD_CFG_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const saveCloudCfg = (cfg) => localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify(cfg));
  const clearCloudCfg = () => localStorage.removeItem(CLOUD_CFG_KEY);

  const setCloudPill = (text) => {
    $('#cloudPill').textContent = 'Chmura: ' + text;
  };

  const setCloudStatusText = (text) => {
    $('#cloudStatusText').textContent = text;
  };

  const refreshCloudButtons = () => {
    const hasCfg = !!cloud.configured;
    $('#cloudLoginBtn').disabled = !hasCfg || !!cloud.user;
    $('#cloudLogoutBtn').disabled = !cloud.user;
    $('#cloudSyncBtn').disabled = !cloud.user || !cloud.db;
  };

  const applyCloudCfgToUI = () => {
    $('#workspaceInput').value = cloud.workspaceId || 'studio';
    $('#authModeSelect').value = cloud.authMode || 'google';
    $('#firebaseConfigTextarea').value = cloud.config ? JSON.stringify(cloud.config.firebaseConfig, null, 2) : '';
  };

  const initCloudFromStoredCfg = () => {
    const cfg = loadCloudCfg();
    if (!cfg || !cfg.firebaseConfig || !cfg.workspaceId) {
      cloud.configured = false;
      cloud.config = null;
      setCloudPill('lokalnie');
      setCloudStatusText('Lokalnie (brak konfiguracji)');
      refreshCloudButtons();
      return;
    }

    cloud.configured = true;
    cloud.config = cfg;
    cloud.workspaceId = cfg.workspaceId || 'studio';
    cloud.authMode = cfg.authMode || 'google';

    setCloudPill('skonfigurowana');
    setCloudStatusText('Skonfigurowana (niezalogowany)');
    refreshCloudButtons();

    // Init Firebase app lazily
    try {
      if (!firebase.apps.length) {
        cloud.app = firebase.initializeApp(cfg.firebaseConfig);
      } else {
        cloud.app = firebase.app();
      }
      cloud.auth = firebase.auth();
      cloud.db = firebase.firestore();
      cloud.ready = true;

      // Track auth state
      cloud.auth.onAuthStateChanged((user) => {
        cloud.user = user || null;
        if (cloud.user) {
          setCloudPill('zalogowany');
          setCloudStatusText('Zalogowany: ' + (cloud.user.isAnonymous ? 'anonimowy' : (cloud.user.email || 'konto Google')));
          startCloudListener();
          scheduleCloudSave(true);
        } else {
          stopCloudListener();
          setCloudPill('niezalogowany');
          setCloudStatusText('Skonfigurowana (niezalogowany)');
        }
        refreshCloudButtons();
      });

    } catch (e) {
      console.error(e);
      toast('Błąd inicjalizacji Firebase');
      cloud.configured = false;
      cloud.ready = false;
      setCloudPill('lokalnie');
      setCloudStatusText('Lokalnie (błąd konfiguracji)');
      refreshCloudButtons();
    }
  };

  const cloudDocRef = () => {
    // One document per workspace
    return cloud.db.collection('slowMotionTrackerWorkspaces').doc(cloud.workspaceId);
  };

  const stopCloudListener = () => {
    if (cloud.unsub) {
      cloud.unsub();
      cloud.unsub = null;
    }
  };

  const startCloudListener = () => {
    if (!cloud.user || !cloud.db) return;
    stopCloudListener();
    const ref = cloudDocRef();
    cloud.unsub = ref.onSnapshot((snap) => {
      if (!snap.exists) {
        // First time: create doc from local
        ref.set({
          schemaVersion: 1,
          rev: cloud.lastLocalRev,
          clientId,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          data: state
        }, { merge: true }).then(() => {
          toast('Chmura: utworzono workspace');
        }).catch(err => console.warn(err));
        return;
      }

      const remote = snap.data();
      const remoteRev = remote?.rev || 0;
      const remoteClient = remote?.clientId || '';
      const remoteData = remote?.data;

      cloud.lastRemoteRev = remoteRev;

      // Avoid applying our own echo if rev matches and clientId is ours
      if (remoteClient === clientId && remoteRev === cloud.lastLocalRev) return;

      if (remoteData && remoteRev > cloud.lastLocalRev) {
        // Remote is newer -> adopt
        state = remoteData;
        saveLocal();
        renderAll();
        toast('Chmura: wczytano nowszą wersję');
        cloud.lastLocalRev = remoteRev;
      }
    }, (err) => {
      console.warn('Snapshot error:', err);
      toast('Chmura: błąd odczytu');
    });
  };

  const scheduleCloudSave = (immediate=false) => {
    if (!cloud.user || !cloud.db || !cloud.configured) return;
    clearTimeout(cloud.saveTimer);
    const delay = immediate ? 50 : 650;
    cloud.saveTimer = setTimeout(() => cloudSave(), delay);
  };

  const cloudSave = async () => {
    if (!cloud.user || !cloud.db || !cloud.configured) return;
    try {
      cloud.saving = true;
      cloud.lastLocalRev = (cloud.lastLocalRev || 0) + 1;
      const ref = cloudDocRef();
      await ref.set({
        schemaVersion: 1,
        rev: cloud.lastLocalRev,
        clientId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        data: state
      }, { merge: true });
      cloud.saving = false;
    } catch (e) {
      console.warn(e);
      cloud.saving = false;
      toast('Chmura: błąd zapisu');
    }
  };

  const cloudSyncNow = async () => {
    if (!cloud.user || !cloud.db) return;
    try {
      const snap = await cloudDocRef().get();
      if (snap.exists) {
        const remote = snap.data();
        const remoteRev = remote?.rev || 0;
        if (remote?.data && remoteRev >= cloud.lastLocalRev) {
          state = remote.data;
          cloud.lastLocalRev = remoteRev;
          saveLocal();
          renderAll();
          toast('Chmura: pobrano dane');
          return;
        }
      }
      // push local if cloud empty or older
      await cloudSave();
      toast('Chmura: wysłano dane');
    } catch (e) {
      console.warn(e);
      toast('Chmura: błąd synchronizacji');
    }
  };

  // ---------- UI rendering ----------
  const fabricListEl = $('#fabricList');
  const detailPaneEl = $('#detailPane');

  const getCollectionProgress = (cid) => {
    const c = state.collections[cid];
    if (!c) return { done:0, total:0, pct:0 };
    let done=0, total=0;
    for (const fid of c.fabricOrder) {
      const f = state.fabrics[fid];
      if (!f) continue;
      for (const ck of f.colorOrder) {
        total++;
        if (f.colors[ck] === 'done') done++;
      }
    }
    const pct = total ? Math.round(done * 100 / total) : 0;
    return { done, total, pct };
  };

  const renderLeft = () => {
    const q = ($('#searchInput').value || '').trim().toLowerCase();
    const colOrder = state.settings.collectionOrder || Object.keys(state.collections);

    const html = colOrder.map(cid => {
      const c = state.collections[cid];
      if (!c) return '';
      const prog = getCollectionProgress(cid);

      // Filter fabrics based on search query
      const fabricRows = c.fabricOrder
        .map(fid => state.fabrics[fid])
        .filter(f => f)
        .filter(f => !q || f.name.toLowerCase().includes(q))
        .map(f => {
          const active = f.id === selectedFabricId ? 'active' : '';
          const checked = state.ui?.selectedFabricIds?.includes(f.id) ? 'checked' : '';
          const bulkClass = bulkMode ? 'bulk-on' : '';
          const colorsTotal = f.colorOrder.length;
          const doneCount = f.colorOrder.filter(k => f.colors[k] === 'done').length;

          return `
            <div class="fabric-row ${active} ${bulkClass}" data-fabric-id="${f.id}">
              <div class="fabric-left">
                <div class="chk"><input type="checkbox" class="bulk-fabric" data-fabric-id="${f.id}" ${checked}></div>
                <div class="fabric-name">${escapeHtml(f.name)}</div>
              </div>
              <div class="fabric-badge">${doneCount}/${colorsTotal} ✓</div>
            </div>
          `;
        }).join('');

      const open = state.ui?.openCollections?.includes(cid) ? 'open' : '';
      return `
        <div class="collection ${open}" data-collection-id="${cid}">
          <div class="collection-header" data-action="toggle-collection" data-collection-id="${cid}">
            <div class="collection-title">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="meta">${prog.done}/${prog.total} ✓</div>
            </div>
            <div class="collection-progress">
              <div class="progress" aria-label="Postęp kolekcji"><div style="width:${prog.pct}%"></div></div>
              <div class="pill">${prog.pct}%</div>
            </div>
          </div>
          <div class="collection-body">
            ${fabricRows || `<div class="small" style="padding:8px 10px;">Brak tkanin dla filtra.</div>`}
          </div>
        </div>
      `;
    }).join('');

    fabricListEl.innerHTML = html || `<div class="small">Brak danych.</div>`;

    document.body.classList.toggle('bulk-on', bulkMode);
  };

  const renderRight = () => {
    const fid = selectedFabricId;
    if (!fid || !state.fabrics[fid]) {
      detailPaneEl.innerHTML = `<div class="detail-empty">Wybierz tkaninę po lewej, żeby zobaczyć kolory po prawej.</div>`;
      return;
    }
    const f = state.fabrics[fid];
    const c = state.collections[f.collectionId];
    const selectedColors = new Set(state.ui?.selectedColorIds?.[fid] || []);
    const total = f.colorOrder.length;
    const done = f.colorOrder.filter(k => f.colors[k] === 'done').length;

    const bulkBar = bulkMode ? `
      <div class="bulkbar">
        <div><strong>Masowe kolory:</strong> zaznaczone <span id="selColorCount">${selectedColors.size}</span></div>
        <div class="bulk-actions">
          <button class="btn" data-action="select-all-colors">Zaznacz wszystkie</button>
          <button class="btn" data-action="clear-colors-selection">Wyczyść</button>
          <span class="pill">Ustaw:</span>
          <button class="btn" data-action="bulk-set-color-status" data-status="todo">✕</button>
          <button class="btn" data-action="bulk-set-color-status" data-status="fix">?</button>
          <button class="btn" data-action="bulk-set-color-status" data-status="done">✓</button>
          <button class="btn danger" data-action="bulk-delete-colors">Usuń kolory</button>
        </div>
      </div>
    ` : '';

    const colorRows = f.colorOrder.map(ck => {
      const st = f.colors[ck] || 'todo';
      const activeTodo = st==='todo' ? 'active' : '';
      const activeFix = st==='fix' ? 'active' : '';
      const activeDone = st==='done' ? 'active' : '';
      const checked = selectedColors.has(ck) ? 'checked' : '';
      return `
        <div class="color-row" data-color="${ck}">
          <div class="color-left">
            <div class="chk"><input type="checkbox" class="bulk-color" data-color="${ck}" ${checked}></div>
            <div class="color-code">${escapeHtml(ck)}</div>
          </div>
          <div class="status">
            <button class="sbtn todo ${activeTodo}" title="Do nagrania" data-action="set-color-status" data-status="todo" data-color="${ck}">✕</button>
            <button class="sbtn fix ${activeFix}" title="Do poprawy" data-action="set-color-status" data-status="fix" data-color="${ck}">?</button>
            <button class="sbtn done ${activeDone}" title="Nagrane" data-action="set-color-status" data-status="done" data-color="${ck}">✓</button>
            ${bulkMode ? '' : `<button class="btn danger" style="padding:7px 10px;border-radius:10px;" data-action="delete-color" data-color="${ck}">Usuń</button>`}
          </div>
        </div>
      `;
    }).join('');

    const header = `
      <div class="detail-title">
        <div>
          <h3>${escapeHtml(f.name)}</h3>
          <div class="detail-sub">${escapeHtml(c?.name || '')} • ${done}/${total} ✓</div>
        </div>
        <div class="detail-tools">
          ${bulkMode ? `
            <span class="pill">Tkanina:</span>
            <button class="btn" data-action="bulk-set-fabric-status" data-status="todo">✕</button>
            <button class="btn" data-action="bulk-set-fabric-status" data-status="fix">?</button>
            <button class="btn" data-action="bulk-set-fabric-status" data-status="done">✓</button>
            <button class="btn danger" data-action="delete-fabric">Usuń tkaninę</button>
          ` : `<button class="btn danger" data-action="delete-fabric">Usuń tkaninę</button>`}
        </div>
      </div>

      <div class="input-row">
        <input id="addColorsInput" placeholder="Dodaj kolory: np. 1-10, 15, 22" />
        <button class="btn primary" id="addColorsBtn" data-action="add-colors">Dodaj</button>
      </div>
      ${bulkBar}
      <div class="color-list">
        ${colorRows || `<div class="small">Brak kolorów. Dodaj je powyżej.</div>`}
      </div>
    `;

    detailPaneEl.innerHTML = header;
  };

  const renderSettings = () => {
    // collection dropdown for new fabric
    const sel = $('#newFabricCollection');
    const colOrder = state.settings.collectionOrder || Object.keys(state.collections);
    sel.innerHTML = colOrder.map(cid => `<option value="${cid}">${escapeHtml(state.collections[cid]?.name || cid)}</option>`).join('');

    // order list
    const list = $('#collectionOrderList');
    list.innerHTML = colOrder.map((cid, idx) => {
      const name = state.collections[cid]?.name || cid;
      return `
        <div class="kv" data-collection-id="${cid}">
          <div class="left">
            <strong>${escapeHtml(name)}</strong>
            <span>${idx===0 ? 'Wyświetlana jako pierwsza' : 'Kolejność: ' + (idx+1)}</span>
          </div>
          <div class="right">
            <button class="btn" data-action="move-collection-up" ${idx===0?'disabled':''}>▲</button>
            <button class="btn" data-action="move-collection-down" ${idx===colOrder.length-1?'disabled':''}>▼</button>
            <button class="btn" data-action="set-collection-first" ${idx===0?'disabled':''}>⭐ Pierwsza</button>
          </div>
        </div>
      `;
    }).join('');

    applyCloudCfgToUI();
    refreshCloudButtons();
  };

  let renderAll = () => {
    // init ui containers if missing
    state.ui ||= { openCollections: [], selectedFabricIds: [], selectedColorIds: {} };

    // Ensure all collection IDs are in openCollections (first one open by default)
    const colOrder = state.settings.collectionOrder || Object.keys(state.collections);
    if (!state.ui.openCollections.length && colOrder.length) state.ui.openCollections = [colOrder[0]];

    renderLeft();
    renderRight();
    renderSettings();
    saveLocal();
  };

  // ---------- Actions ----------
  const setColorStatus = (fid, ck, status) => {
    const f = state.fabrics[fid];
    if (!f || !f.colors[ck]) return;
    pushUndo();
    f.colors[ck] = status;
    saveLocal();
    renderLeft();
    renderRight();
    scheduleCloudSave();
  };

  const addColors = (fid, colorTokens) => {
    const f = state.fabrics[fid];
    if (!f) return;
    if (!colorTokens.length) return;
    pushUndo();
    for (const ck of colorTokens) {
      if (!f.colors[ck]) {
        f.colors[ck] = state.settings.defaultStatus || 'todo';
        f.colorOrder.push(ck);
      }
    }
    // sort numerically where possible
    f.colorOrder = [...new Set(f.colorOrder)].sort((a,b)=> (parseInt(a,10)||0) - (parseInt(b,10)||0));
    saveLocal();
    renderLeft();
    renderRight();
    scheduleCloudSave();
    toast('Dodano kolory');
  };

  const deleteColor = (fid, ck) => {
    const f = state.fabrics[fid];
    if (!f || !f.colors[ck]) return;
    pushUndo();
    delete f.colors[ck];
    f.colorOrder = f.colorOrder.filter(x => x !== ck);
    // selection cleanup
    if (state.ui.selectedColorIds?.[fid]) {
      state.ui.selectedColorIds[fid] = state.ui.selectedColorIds[fid].filter(x => x !== ck);
    }
    saveLocal();
    renderLeft();
    renderRight();
    scheduleCloudSave();
  };

  const deleteFabric = (fid) => {
    const f = state.fabrics[fid];
    if (!f) return;
    pushUndo();
    const cid = f.collectionId;
    delete state.fabrics[fid];
    const c = state.collections[cid];
    if (c) c.fabricOrder = c.fabricOrder.filter(x => x !== fid);
    if (selectedFabricId === fid) selectedFabricId = null;
    // selection cleanup
    state.ui.selectedFabricIds = (state.ui.selectedFabricIds || []).filter(x => x !== fid);
    delete state.ui.selectedColorIds?.[fid];

    saveLocal();
    renderAll();
    scheduleCloudSave();
    toast('Usunięto tkaninę');
  };

  const addFabric = (name, cid) => {
    const n = (name || '').trim();
    if (!n) return;
    pushUndo();
    const fid = 'f_' + slug(n) + '_' + uid().slice(0,8);
    state.fabrics[fid] = {
      id: fid,
      collectionId: cid,
      name: n,
      colors: {},
      colorOrder: []
    };
    state.collections[cid].fabricOrder.push(fid);
    selectedFabricId = fid;
    saveLocal();
    renderAll();
    scheduleCloudSave();
    toast('Dodano tkaninę');
  };

  const toggleCollection = (cid) => {
    state.ui.openCollections ||= [];
    const idx = state.ui.openCollections.indexOf(cid);
    if (idx >= 0) state.ui.openCollections.splice(idx,1);
    else state.ui.openCollections.push(cid);
    saveLocal();
    renderLeft();
  };

  const toggleBulk = () => {
    bulkMode = !bulkMode;
    // clear selections when leaving bulk mode
    if (!bulkMode) {
      state.ui.selectedFabricIds = [];
      state.ui.selectedColorIds = {};
    }
    renderAll();
  };

  const toggleFabricSelection = (fid, checked) => {
    state.ui.selectedFabricIds ||= [];
    const set = new Set(state.ui.selectedFabricIds);
    checked ? set.add(fid) : set.delete(fid);
    state.ui.selectedFabricIds = [...set];
    saveLocal();
    renderLeft();
  };

  const toggleColorSelection = (fid, ck, checked) => {
    state.ui.selectedColorIds ||= {};
    state.ui.selectedColorIds[fid] ||= [];
    const set = new Set(state.ui.selectedColorIds[fid]);
    checked ? set.add(ck) : set.delete(ck);
    state.ui.selectedColorIds[fid] = [...set];
    saveLocal();
    renderRight();
  };

  const selectAllColors = (fid) => {
    const f = state.fabrics[fid];
    if (!f) return;
    state.ui.selectedColorIds ||= {};
    state.ui.selectedColorIds[fid] = [...f.colorOrder];
    saveLocal();
    renderRight();
  };

  const clearColorSelection = (fid) => {
    state.ui.selectedColorIds ||= {};
    state.ui.selectedColorIds[fid] = [];
    saveLocal();
    renderRight();
  };

  const bulkSetColorStatus = (fid, status) => {
    const selected = new Set(state.ui.selectedColorIds?.[fid] || []);
    if (!selected.size) return toast('Zaznacz kolory');
    pushUndo();
    const f = state.fabrics[fid];
    for (const ck of selected) {
      if (f.colors[ck]) f.colors[ck] = status;
    }
    saveLocal();
    renderLeft();
    renderRight();
    scheduleCloudSave();
    toast('Zmieniono status');
  };

  const bulkDeleteColors = (fid) => {
    const selected = new Set(state.ui.selectedColorIds?.[fid] || []);
    if (!selected.size) return toast('Zaznacz kolory');
    pushUndo();
    const f = state.fabrics[fid];
    for (const ck of selected) delete f.colors[ck];
    f.colorOrder = f.colorOrder.filter(ck => !selected.has(ck));
    state.ui.selectedColorIds[fid] = [];
    saveLocal();
    renderLeft();
    renderRight();
    scheduleCloudSave();
    toast('Usunięto kolory');
  };

  const bulkSetFabricStatus = (status) => {
    if (!bulkMode) return;
    const ids = state.ui.selectedFabricIds || [];
    if (!ids.length) return toast('Zaznacz tkaniny');
    pushUndo();
    for (const fid of ids) {
      const f = state.fabrics[fid];
      if (!f) continue;
      for (const ck of f.colorOrder) {
        if (f.colors[ck]) f.colors[ck] = status;
      }
    }
    saveLocal();
    renderAll();
    scheduleCloudSave();
    toast('Zmieniono status tkanin');
  };

  const bulkDeleteFabrics = () => {
    if (!bulkMode) return;
    const ids = state.ui.selectedFabricIds || [];
    if (!ids.length) return toast('Zaznacz tkaniny');
    pushUndo();
    for (const fid of ids) {
      const f = state.fabrics[fid];
      if (!f) continue;
      const cid = f.collectionId;
      delete state.fabrics[fid];
      const c = state.collections[cid];
      if (c) c.fabricOrder = c.fabricOrder.filter(x => x !== fid);
      delete state.ui.selectedColorIds?.[fid];
      if (selectedFabricId === fid) selectedFabricId = null;
    }
    state.ui.selectedFabricIds = [];
    saveLocal();
    renderAll();
    scheduleCloudSave();
    toast('Usunięto tkaniny');
  };

  const moveCollection = (cid, dir) => {
    const order = state.settings.collectionOrder || [];
    const idx = order.indexOf(cid);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    pushUndo();
    order.splice(idx,1);
    order.splice(newIdx,0,cid);
    state.settings.collectionOrder = order;
    saveLocal();
    renderAll();
    scheduleCloudSave();
  };

  const setCollectionFirst = (cid) => {
    const order = state.settings.collectionOrder || [];
    const idx = order.indexOf(cid);
    if (idx <= 0) return;
    pushUndo();
    order.splice(idx,1);
    order.unshift(cid);
    state.settings.collectionOrder = order;
    saveLocal();
    renderAll();
    scheduleCloudSave();
  };

  // ---------- Settings modal ----------
  const openModal = () => $('#settingsModal').classList.add('open');
  const closeModal = () => $('#settingsModal').classList.remove('open');

  // ---------- Backup ----------
  const download = (filename, text) => {
    const blob = new Blob([text], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    download('slow_motion_tracker_backup.json', JSON.stringify(state, null, 2));
    toast('Wyeksportowano JSON');
  };

  const importJsonFile = async (file) => {
    const text = await file.text();
    let obj;
    try { obj = JSON.parse(text); } catch { return toast('Błędny JSON'); }
    if (!obj || obj.schemaVersion !== 1) return toast('Nieprawidłowy plik');
    pushUndo();
    state = obj;
    saveLocal();
    renderAll();
    scheduleCloudSave(true);
    toast('Zaimportowano JSON');
  };

  const resetSeed = () => {
    if (!confirm('Resetuje lokalne dane i ładuje dane startowe. Kontynuować?')) return;
    undoStack = [];
    state = deepClone(seed);
    selectedFabricId = null;
    saveLocal();
    renderAll();
    scheduleCloudSave(true);
    toast('Zresetowano');
  };

  // ---------- Cloud actions ----------
  const saveFirebaseConfig = () => {
    const wsId = ($('#workspaceInput').value || 'studio').trim() || 'studio';
    const authMode = $('#authModeSelect').value || 'google';
    const raw = ($('#firebaseConfigTextarea').value || '').trim();
    let firebaseConfig;
    try {
      firebaseConfig = JSON.parse(raw);
    } catch {
      toast('Niepoprawny JSON konfiguracji');
      return;
    }
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
      toast('Konfiguracja wygląda na niepełną');
      return;
    }
    const cfg = { firebaseConfig, workspaceId: wsId, authMode };
    saveCloudCfg(cfg);
    cloud.workspaceId = wsId;
    cloud.authMode = authMode;
    toast('Zapisano konfigurację chmury');
    initCloudFromStoredCfg();
    renderSettings();
  };

  const clearFirebaseConfig = () => {
    if (!confirm('Usunąć konfigurację chmury?')) return;
    clearCloudCfg();
    stopCloudListener();
    try { if (cloud.auth?.currentUser) cloud.auth.signOut(); } catch {}
    cloud = {...cloud, configured:false, config:null, app:null, auth:null, db:null, user:null, ready:false, unsub:null};
    toast('Usunięto konfigurację chmury');
    initCloudFromStoredCfg();
    renderSettings();
  };

  const cloudConnect = () => {
    // Just focus textarea section
    toast('Wklej firebaseConfig i kliknij „Zapisz konfigurację”');
    const el = $('#firebaseConfigTextarea');
    el.scrollIntoView({behavior:'smooth', block:'center'});
    el.focus();
  };

  const cloudLogin = async () => {
    if (!cloud.configured || !cloud.auth) return;
    if (location.protocol === 'file:') {
      toast('Logowanie zwykle nie działa z pliku. Uruchom na GitHub/Firebase lub localhost.');
      return;
    }
    try {
      if (cloud.authMode === 'anonymous') {
        await cloud.auth.signInAnonymously();
      } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        await cloud.auth.signInWithPopup(provider);
      }
    } catch (e) {
      console.warn(e);
      toast('Błąd logowania');
    }
  };

  const cloudLogout = async () => {
    try {
      await cloud.auth.signOut();
      toast('Wylogowano');
    } catch {
      toast('Błąd wylogowania');
    }
  };

  // ---------- Events ----------
  // Clicks (event delegation)
  document.addEventListener('click', (e) => {
    const t = e.target;

    // Top actions
    if (t.id === 'bulkToggleBtn') return toggleBulk();
    if (t.id === 'undoBtn') return undo();
    if (t.id === 'settingsBtn') { renderSettings(); return openModal(); }
    if (t.id === 'settingsClose') return closeModal();
    if (t.id === 'settingsModal' && e.target === $('#settingsModal')) return closeModal();

    // Left panel: collection header toggle
    const colHeader = t.closest('[data-action="toggle-collection"]');
    if (colHeader) {
      const cid = colHeader.getAttribute('data-collection-id');
      toggleCollection(cid);
      return;
    }

    // Fabric row select
    const fabricRow = t.closest('.fabric-row');
    if (fabricRow && fabricRow.dataset.fabricId) {
      const fid = fabricRow.dataset.fabricId;
      if (bulkMode && t.classList.contains('bulk-fabric')) return;
      selectedFabricId = fid;
      renderLeft();
      renderRight();
      return;
    }

    // Color status buttons / actions in detail pane
    const actionEl = t.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.getAttribute('data-action');
      const fid = selectedFabricId;
      if (action === 'set-color-status') {
        const ck = actionEl.getAttribute('data-color');
        const st = actionEl.getAttribute('data-status');
        setColorStatus(fid, ck, st);
        return;
      }
      if (action === 'add-colors') {
        const input = $('#addColorsInput');
        const tokens = parseColorInput(input.value);
        input.value = '';
        addColors(fid, tokens);
        return;
      }
      if (action === 'delete-color') {
        const ck = actionEl.getAttribute('data-color');
        if (!confirm(`Usunąć kolor ${ck}?`)) return;
        deleteColor(fid, ck);
        return;
      }
      if (action === 'delete-fabric') {
        if (!confirm('Usunąć tkaninę (i wszystkie jej kolory)?')) return;
        deleteFabric(fid);
        return;
      }
      if (action === 'select-all-colors') return selectAllColors(fid);
      if (action === 'clear-colors-selection') return clearColorSelection(fid);
      if (action === 'bulk-set-color-status') return bulkSetColorStatus(fid, actionEl.getAttribute('data-status'));
      if (action === 'bulk-delete-colors') {
        if (!confirm('Usunąć zaznaczone kolory?')) return;
        return bulkDeleteColors(fid);
      }
      if (action === 'bulk-set-fabric-status') return bulkSetFabricStatus(actionEl.getAttribute('data-status'));
      if (action === 'bulk-delete-fabrics') {
        if (!confirm('Usunąć zaznaczone tkaniny?')) return;
        return bulkDeleteFabrics();
      }

      // Settings actions
      if (action === 'move-collection-up') {
        const cid = actionEl.closest('[data-collection-id]').getAttribute('data-collection-id');
        return moveCollection(cid, -1);
      }
      if (action === 'move-collection-down') {
        const cid = actionEl.closest('[data-collection-id]').getAttribute('data-collection-id');
        return moveCollection(cid, 1);
      }
      if (action === 'set-collection-first') {
        const cid = actionEl.closest('[data-collection-id]').getAttribute('data-collection-id');
        return setCollectionFirst(cid);
      }
    }

    // Settings buttons
    if (t.id === 'addFabricBtn') {
      const name = $('#newFabricName').value;
      const cid = $('#newFabricCollection').value;
      $('#newFabricName').value = '';
      addFabric(name, cid);
      closeModal();
      return;
    }

    if (t.id === 'exportJsonBtn') return exportJson();
    if (t.id === 'resetSeedBtn') return resetSeed();

    // Cloud buttons
    if (t.id === 'saveFirebaseConfigBtn') return saveFirebaseConfig();
    if (t.id === 'clearFirebaseConfigBtn') return clearFirebaseConfig();
    if (t.id === 'cloudConnectBtn') return cloudConnect();
    if (t.id === 'cloudLoginBtn') return cloudLogin();
    if (t.id === 'cloudLogoutBtn') return cloudLogout();
    if (t.id === 'cloudSyncBtn') return cloudSyncNow();
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'importJsonInput' && t.files?.[0]) {
      importJsonFile(t.files[0]);
      t.value = '';
      return;
    }
    if (t.classList.contains('bulk-fabric')) {
      const fid = t.getAttribute('data-fabric-id');
      toggleFabricSelection(fid, t.checked);
      return;
    }
    if (t.classList.contains('bulk-color')) {
      const ck = t.getAttribute('data-color');
      toggleColorSelection(selectedFabricId, ck, t.checked);
      return;
    }
    if (t.id === 'workspaceInput') {
      // store immediately in cfg if present
      cloud.workspaceId = t.value.trim() || 'studio';
      const cfg = loadCloudCfg();
      if (cfg) { cfg.workspaceId = cloud.workspaceId; saveCloudCfg(cfg); }
    }
    if (t.id === 'authModeSelect') {
      cloud.authMode = t.value;
      const cfg = loadCloudCfg();
      if (cfg) { cfg.authMode = cloud.authMode; saveCloudCfg(cfg); }
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter') {
      const active = document.activeElement;
      if (active && active.id === 'addColorsInput') {
        e.preventDefault();
        $('#addColorsBtn').click();
      }
      if (active && active.id === 'newFabricName') {
        e.preventDefault();
        $('#addFabricBtn').click();
      }
    }
  });

  $('#searchInput').addEventListener('input', () => renderLeft());

  // Add bulk delete tkaniny buttons into UI (top bar when bulk on)
  const bulkToggleBtn = $('#bulkToggleBtn');
  const updateTopBulkControls = () => {
    // Add a dynamic button to topbar if bulk enabled
    let bulkBar = $('#topBulkBar');
    if (!bulkMode) {
      if (bulkBar) bulkBar.remove();
      bulkToggleBtn.textContent = 'Masowe';
      return;
    }
    bulkToggleBtn.textContent = 'Masowe ✓';
    if (!bulkBar) {
      bulkBar = document.createElement('div');
      bulkBar.id = 'topBulkBar';
      bulkBar.style.display = 'flex';
      bulkBar.style.gap = '8px';
      bulkBar.style.alignItems = 'center';
      bulkBar.innerHTML = `
        <span class="pill">Zaznaczone tkaniny: <span id="selFabricCount">0</span></span>
        <span class="pill">Ustaw:</span>
        <button class="btn" data-action="bulk-set-fabric-status" data-status="todo">✕</button>
        <button class="btn" data-action="bulk-set-fabric-status" data-status="fix">?</button>
        <button class="btn" data-action="bulk-set-fabric-status" data-status="done">✓</button>
        <button class="btn danger" data-action="bulk-delete-fabrics">Usuń tkaniny</button>
      `;
      // Insert next to actions
      $('.actions').prepend(bulkBar);
    }
    $('#selFabricCount').textContent = (state.ui?.selectedFabricIds?.length || 0);
  };

  // Override renderAll to include top bulk counts
  const _renderAll = renderAll;
  renderAll = () => {
    _renderAll();
    updateTopBulkControls();
    if (bulkMode) $('#selFabricCount').textContent = (state.ui?.selectedFabricIds?.length || 0);
  };

  // Escape HTML
  function escapeHtml(str){
    return String(str ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // ---------- Boot ----------
  state = loadState();
  state.ui ||= { openCollections: [], selectedFabricIds: [], selectedColorIds: {} };
  cloud.lastLocalRev = state.rev || 0;
  renderAll();
  $('#undoBtn').disabled = undoStack.length === 0;

  // Init cloud if configured
  initCloudFromStoredCfg();

})();
