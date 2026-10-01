document.documentElement.dataset.slowMotionLoader = "progress-status-v1";

(async () => {
  'use strict';

  const replaceOnce = (source, search, replacement, label) => {
    if (!source.includes(search)) {
      console.warn('[Slow Motion loader] Nie znaleziono fragmentu:', label);
      return source;
    }
    return source.replace(search, replacement);
  };

  try {
    const response = await fetch('app.js?v=progress-status-v1', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let source = await response.text();

    source = replaceOnce(
      source,
      'document.documentElement.dataset.slowMotionVersion = "V10-viewer-status-alerts";',
      'document.documentElement.dataset.slowMotionVersion = "V11-progress-status";',
      'wersja aplikacji'
    );

    source = replaceOnce(
      source,
      'window.SMF_BUILD = "V7_KOMPAKT_UWAGI_ZLECENIA_2026_05_04";',
      'window.SMF_BUILD = "V8_STATUS_W_TRAKCIE_2026_10_01";',
      'numer buildu'
    );

    source = replaceOnce(
      source,
      "const normalizeStatus = (st) => st === 'done' ? 'done' : 'todo';",
      "const normalizeStatus = (st) => st === 'done' ? 'done' : (st === 'progress' ? 'progress' : 'todo');",
      'normalizacja statusu'
    );

    source = replaceOnce(
      source,
      '      .compact-status .viewer-status[disabled].active{ box-shadow:0 0 0 4px rgba(76,112,255,.16); }',
      '      .compact-status .viewer-status[disabled].active{ box-shadow:0 0 0 4px rgba(76,112,255,.16); }\n      .sbtn.progress{ color:#d88700; font-weight:900; }\n      .sbtn.progress.active{ border-color:rgba(216,135,0,.60); box-shadow:0 0 0 4px rgba(216,135,0,.18), var(--shadow2); background:#fff9e8; }',
      'styl statusu w trakcie'
    );

    source = replaceOnce(
      source,
      '          <button class="btn" data-action="bulk-set-color-status" data-status="todo">✕</button>\n          <button class="btn" data-action="bulk-set-color-status" data-status="done">✓</button>',
      '          <button class="btn" data-action="bulk-set-color-status" data-status="todo" title="Do nagrania">✕</button>\n          <button class="btn" data-action="bulk-set-color-status" data-status="progress" title="W trakcie — ucięte i czeka w kolejce">⏳</button>\n          <button class="btn" data-action="bulk-set-color-status" data-status="done" title="Nagrane">✓</button>',
      'masowy status kolorów'
    );

    source = replaceOnce(
      source,
      "      const activeTodo = normalizeStatus(st)==='todo' ? 'active' : '';\n      const activeDone = normalizeStatus(st)==='done' ? 'active' : '';",
      "      const activeTodo = normalizeStatus(st)==='todo' ? 'active' : '';\n      const activeProgress = normalizeStatus(st)==='progress' ? 'active' : '';\n      const activeDone = normalizeStatus(st)==='done' ? 'active' : '';",
      'aktywny status koloru'
    );

    source = replaceOnce(
      source,
      '              <button class="sbtn todo ${activeTodo} viewer-status" title="Do nagrania" data-action="set-color-status" data-status="todo" data-color="${ck}" ${statusReadonly}>✕</button>\n              <button class="sbtn done ${activeDone} viewer-status" title="Nagrane" data-action="set-color-status" data-status="done" data-color="${ck}" ${statusReadonly}>✓</button>',
      '              <button class="sbtn todo ${activeTodo} viewer-status" title="Do nagrania" data-action="set-color-status" data-status="todo" data-color="${ck}" ${statusReadonly}>✕</button>\n              <button class="sbtn progress ${activeProgress} viewer-status" title="W trakcie — ucięte i czeka w kolejce" data-action="set-color-status" data-status="progress" data-color="${ck}" ${statusReadonly}>⏳</button>\n              <button class="sbtn done ${activeDone} viewer-status" title="Nagrane" data-action="set-color-status" data-status="done" data-color="${ck}" ${statusReadonly}>✓</button>',
      'przycisk statusu przy kolorze'
    );

    source = replaceOnce(
      source,
      '            <button class="btn" data-action="bulk-set-fabric-status" data-status="todo">✕</button>\n            <button class="btn" data-action="bulk-set-fabric-status" data-status="done">✓</button>',
      '            <button class="btn" data-action="bulk-set-fabric-status" data-status="todo" title="Do nagrania">✕</button>\n            <button class="btn" data-action="bulk-set-fabric-status" data-status="progress" title="W trakcie — ucięte i czeka w kolejce">⏳</button>\n            <button class="btn" data-action="bulk-set-fabric-status" data-status="done" title="Nagrane">✓</button>',
      'masowy status tkaniny w szczegółach'
    );

    source = replaceOnce(
      source,
      '        <button class="btn" data-action="bulk-set-fabric-status" data-status="todo">✕</button>\n        <button class="btn" data-action="bulk-set-fabric-status" data-status="done">✓</button>',
      '        <button class="btn" data-action="bulk-set-fabric-status" data-status="todo" title="Do nagrania">✕</button>\n        <button class="btn" data-action="bulk-set-fabric-status" data-status="progress" title="W trakcie — ucięte i czeka w kolejce">⏳</button>\n        <button class="btn" data-action="bulk-set-fabric-status" data-status="done" title="Nagrane">✓</button>',
      'masowy status tkanin w górnym pasku'
    );

    source = replaceOnce(
      source,
      "  const STATUS_META = {\n    todo: { symbol: '✕', label: 'Do nagrania' },\n    done: { symbol: '✓', label: 'Nagrane' },",
      "  const STATUS_META = {\n    todo: { symbol: '✕', label: 'Do nagrania' },\n    progress: { symbol: '⏳', label: 'W trakcie' },\n    done: { symbol: '✓', label: 'Nagrane' },",
      'status w eksporcie'
    );

    source = replaceOnce(
      source,
      "    if (mode === 'worklist') return normalizeStatus(st) === 'todo';",
      "    if (mode === 'worklist') return normalizeStatus(st) !== 'done';",
      'lista pracy PDF'
    );

    source = replaceOnce(
      source,
      "      subtitle.textContent = 'Lista tkanin → statusy kolorów (✕ / ✓) + uwagi i zlecenia';",
      "      subtitle.textContent = 'Lista tkanin → statusy kolorów (✕ / ⏳ / ✓) + uwagi i zlecenia';",
      'opis statusów'
    );

    // sourceURL pomaga w debugowaniu F12, mimo że kod jest uruchamiany dynamicznie.
    const runner = new Function(`${source}\n//# sourceURL=app.js`);
    runner();
  } catch (error) {
    console.error('[Slow Motion loader] Nie udało się uruchomić aplikacji:', error);
    document.body.innerHTML = '<div style="max-width:760px;margin:60px auto;padding:24px;font-family:system-ui;border:1px solid #e2d7c7;border-radius:18px;background:#fff">Nie udało się załadować aplikacji Slow Motion Fabrics. Odśwież stronę Ctrl+F5.</div>';
  }
})();
