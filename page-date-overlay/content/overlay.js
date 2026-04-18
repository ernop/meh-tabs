/* Overlay content script.
 * Runs at document_idle. Extracts page meta, renders a Shadow-DOM pill overlay,
 * and offers expand / edit / override / type-pick actions.
 *
 * Assumes common/url.js, common/storage.js, content/extractor.js have loaded
 * before this file (manifest declares that order).
 */
(function () {
  if (window.top !== window) return; // only in top frame
  if (window.__pdoOverlayLoaded) return;
  window.__pdoOverlayLoaded = true;

  const browserAPI = window.browser || window.chrome;
  const PDO = window.PDO;
  if (!PDO) { console.warn('[PDO] helpers missing'); return; }

  const PAGE_TYPES = PDO.PAGE_TYPES;
  const CONFIDENCE_LABEL = { high: 'HIGH', medium: 'MED', low: 'LOW', none: 'NONE' };

  const state = {
    normUrl: PDO.normalizeUrl(location.href),
    extraction: null,
    stored: null,
    rule: null,
    settings: null,
    open: false,
    editing: false,
    reading: { activeSec: 0, maxScrollPct: 0, lastActivityAt: Date.now() }
  };

  async function init() {
    if (!state.normUrl) return; // non-http(s) page
    state.settings = await PDO.getSettings();
    if (!state.settings.enabled) return;

    const rules = await PDO.getTypeRules();
    state.rule = PDO.resolveType(state.normUrl, rules);
    state.stored = await PDO.getPageMeta(state.normUrl);
    state.extraction = PDO.extractAll();
    await persistExtraction();

    const resolvedType = effectiveType();
    if (resolvedType && (state.settings.hiddenTypes || []).includes(resolvedType) && !shouldForceShow()) {
      // still track reading silently but don't render overlay
      startReadingTracker();
      return;
    }

    render();
    wireCommandListener();
    startReadingTracker();
  }

  function shouldForceShow() {
    return state.stored && state.stored.userOverride;
  }

  function effectiveType() {
    if (state.stored && state.stored.type) return state.stored.type;
    if (state.rule && state.rule.type) return state.rule.type;
    return inferType();
  }

  function inferType() {
    if (state.extraction && state.extraction.published) return 'article';
    const jsonLdTypes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const n of jsonLdTypes) {
      try {
        const d = JSON.parse(n.textContent);
        const items = Array.isArray(d) ? d : [d];
        for (const it of items) {
          const t = it && (it['@type'] || (it['@graph'] && it['@graph'][0] && it['@graph'][0]['@type']));
          if (!t) continue;
          const types = Array.isArray(t) ? t : [t];
          if (types.some(x => /Article|BlogPosting|NewsArticle|Report/i.test(x))) return 'article';
        }
      } catch (_) { /* ignore */ }
    }
    if (document.querySelector('article')) {
      const words = (document.querySelector('article').innerText || '').split(/\s+/).length;
      if (words > 400) return 'article';
    }
    return 'unknown';
  }

  async function persistExtraction() {
    const nowIso = new Date().toISOString();
    const existing = state.stored || {};
    const candidates = state.extraction.candidates.map(c => ({
      tier: c.tier, source: c.source, field: c.field, raw: c.raw,
      normalized: c.normalizedDate || null
    }));

    const merged = {
      author: existing.userOverride && existing.author ? existing.author : state.extraction.author,
      publishedAt: existing.userOverride && existing.publishedAt ? existing.publishedAt : state.extraction.published,
      modifiedAt: existing.userOverride && existing.modifiedAt ? existing.modifiedAt : state.extraction.modified,
      candidates,
      confidence: state.extraction.confidence,
      sources: state.extraction.sources,
      type: existing.type || null,
      userOverride: !!existing.userOverride,
      firstSeenAt: existing.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
      reads: existing.reads || []
    };
    state.stored = merged;
    await PDO.savePageMeta(state.normUrl, merged);
  }

  // ============== Rendering ==============

  let shadowRoot = null;
  let rootEl = null;

  function render() {
    if (!rootEl) {
      const host = document.createElement('div');
      host.id = 'pdo-overlay-host';
      host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
      shadowRoot = host.attachShadow({ mode: 'closed' });
      document.documentElement.appendChild(host);

      const styleLink = document.createElement('link');
      styleLink.rel = 'stylesheet';
      styleLink.href = browserAPI.runtime.getURL('content/overlay.css');
      shadowRoot.appendChild(styleLink);

      rootEl = document.createElement('div');
      rootEl.className = 'pdo-root';
      shadowRoot.appendChild(rootEl);
    }

    rootEl.className = 'pdo-root pos-' + (state.settings.overlayPosition || 'tr') + (state.open ? ' open' : '') + (state.editing ? ' editing' : '');
    rootEl.textContent = '';

    rootEl.appendChild(buildPill());
    rootEl.appendChild(buildCard());
  }

  function buildPill() {
    const pill = document.createElement('div');
    pill.className = 'pdo-pill';

    const dot = document.createElement('span');
    dot.className = 'pdo-dot conf-' + (state.stored.confidence || 'none');
    dot.title = 'Confidence: ' + CONFIDENCE_LABEL[state.stored.confidence || 'none'];
    pill.appendChild(dot);

    const dateSpan = document.createElement('span');
    if (state.stored.publishedAt) {
      dateSpan.className = 'pdo-pill-date';
      dateSpan.textContent = state.stored.publishedAt;
    } else {
      dateSpan.className = 'pdo-pill-unknown';
      dateSpan.textContent = 'date: unknown';
    }
    pill.appendChild(dateSpan);

    if (state.stored.author) {
      const sep = document.createElement('span');
      sep.className = 'pdo-pill-sep'; sep.textContent = '·';
      pill.appendChild(sep);
      const authorSpan = document.createElement('span');
      authorSpan.className = 'pdo-pill-author';
      authorSpan.textContent = truncate(state.stored.author, 28);
      pill.appendChild(authorSpan);
    }

    pill.addEventListener('click', () => {
      state.open = !state.open;
      render();
    });
    return pill;
  }

  function buildCard() {
    const card = document.createElement('div');
    card.className = 'pdo-card';

    const view = document.createElement('div');
    view.className = 'pdo-view';
    card.appendChild(view);
    renderView(view);

    const edit = document.createElement('div');
    edit.className = 'pdo-edit';
    card.appendChild(edit);
    renderEdit(edit);

    return card;
  }

  function renderView(view) {
    addRow(view, 'Published', state.stored.publishedAt, state.stored.sources && state.stored.sources.published);
    if (state.stored.modifiedAt) addRow(view, 'Modified', state.stored.modifiedAt, state.stored.sources && state.stored.sources.modified);
    addRow(view, 'Author', state.stored.author, state.stored.sources && state.stored.sources.author);

    const typeRow = document.createElement('div');
    typeRow.className = 'pdo-row';
    const label = document.createElement('span'); label.className = 'label'; label.textContent = 'Type';
    const value = document.createElement('span'); value.className = 'value';
    const t = effectiveType();
    value.textContent = t || 'unknown';
    if (state.rule) {
      const b = document.createElement('span'); b.className = 'pdo-type-badge';
      b.textContent = state.rule.match + ': ' + state.rule.pattern;
      value.appendChild(b);
    }
    typeRow.appendChild(label); typeRow.appendChild(value);
    view.appendChild(typeRow);

    const divider = document.createElement('div'); divider.className = 'pdo-divider'; view.appendChild(divider);

    const actions = document.createElement('div'); actions.className = 'pdo-actions';
    actions.appendChild(mkBtn('Edit', () => { state.editing = true; render(); }, 'primary'));
    actions.appendChild(mkBtn('Set type', () => openTypePicker(), ''));
    actions.appendChild(mkBtn('Wayback lookup', () => requestWayback(), ''));
    actions.appendChild(mkBtn('Last-Modified', () => requestHead(), ''));
    actions.appendChild(mkBtn('Download fixture', () => downloadFixture(), ''));
    actions.appendChild(mkBtn('Hide here', () => hideForUrl(), 'danger'));
    view.appendChild(actions);

    const cands = document.createElement('details'); cands.className = 'pdo-candidates';
    const sum = document.createElement('summary');
    sum.textContent = `Candidates (${(state.stored.candidates || []).length})`;
    cands.appendChild(sum);
    const ul = document.createElement('ul');
    for (const c of (state.stored.candidates || [])) {
      const li = document.createElement('li');
      const tierLabel = `T${c.tier}`;
      const norm = c.normalized ? ` → ${c.normalized}` : '';
      li.textContent = `${tierLabel} ${c.field} [${c.source}]: ${truncate(String(c.raw || ''), 80)}${norm}`;
      ul.appendChild(li);
    }
    cands.appendChild(ul);
    view.appendChild(cands);
  }

  function renderEdit(edit) {
    const mkField = (labelText, id, value) => {
      const l = document.createElement('label'); l.textContent = labelText; l.setAttribute('for', id);
      const i = document.createElement('input'); i.type = 'text'; i.id = id; i.value = value || '';
      edit.appendChild(l); edit.appendChild(i);
      return i;
    };
    const pubInput = mkField('Published (YYYY-MM-DD)', 'pdo-edit-pub', state.stored.publishedAt);
    const modInput = mkField('Modified (YYYY-MM-DD)', 'pdo-edit-mod', state.stored.modifiedAt);
    const authorInput = mkField('Author', 'pdo-edit-author', state.stored.author);

    const typeLabel = document.createElement('label'); typeLabel.textContent = 'Type'; typeLabel.setAttribute('for', 'pdo-edit-type');
    const typeSelect = document.createElement('select'); typeSelect.id = 'pdo-edit-type';
    for (const pt of PAGE_TYPES) {
      const opt = document.createElement('option'); opt.value = pt; opt.textContent = pt;
      if (effectiveType() === pt) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    edit.appendChild(typeLabel); edit.appendChild(typeSelect);

    const actions = document.createElement('div'); actions.className = 'pdo-actions';
    actions.appendChild(mkBtn('Save', async () => {
      const normPub = pubInput.value.trim() ? PDO.normalizeDate(pubInput.value.trim()) : null;
      const normMod = modInput.value.trim() ? PDO.normalizeDate(modInput.value.trim()) : null;
      state.stored.publishedAt = normPub;
      state.stored.modifiedAt = normMod;
      state.stored.author = authorInput.value.trim() || null;
      state.stored.type = typeSelect.value;
      state.stored.userOverride = true;
      state.stored.confidence = 'high';
      state.stored.sources = Object.assign({}, state.stored.sources, {
        published: 'user',
        modified: 'user',
        author: 'user'
      });
      await PDO.savePageMeta(state.normUrl, state.stored);
      state.editing = false;
      render();
    }, 'primary'));
    actions.appendChild(mkBtn('Cancel', () => { state.editing = false; render(); }, ''));
    actions.appendChild(mkBtn('Clear override', async () => {
      state.stored.userOverride = false;
      await PDO.savePageMeta(state.normUrl, state.stored);
      state.extraction = PDO.extractAll();
      await persistExtraction();
      state.editing = false;
      render();
    }, 'danger'));
    edit.appendChild(actions);
  }

  function addRow(parent, labelText, value, source) {
    const row = document.createElement('div'); row.className = 'pdo-row';
    const l = document.createElement('span'); l.className = 'label'; l.textContent = labelText;
    const v = document.createElement('span'); v.className = 'value';
    if (value) { v.textContent = value; }
    else { v.textContent = 'unknown'; v.classList.add('unknown'); }
    row.appendChild(l); row.appendChild(v);
    parent.appendChild(row);
    if (source) {
      const s = document.createElement('div'); s.className = 'pdo-source';
      s.textContent = 'via ' + source;
      parent.appendChild(s);
    }
  }

  function mkBtn(label, onClick, cls) {
    const b = document.createElement('button'); b.className = 'pdo-btn' + (cls ? ' ' + cls : ''); b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function truncate(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ============== Type picker ==============

  function openTypePicker() {
    const existing = shadowRoot.querySelector('.pdo-picker-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'pdo-picker-backdrop';
    backdrop.setAttribute('style', 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:2147483647;display:flex;align-items:center;justify-content:center;');

    const box = document.createElement('div');
    box.setAttribute('style', 'background:#fff;padding:14px 16px;border-radius:8px;min-width:320px;font-family:inherit;font-size:12px;color:#1a1a1a;');

    const title = document.createElement('div');
    title.setAttribute('style', 'font-weight:600;margin-bottom:8px;');
    title.textContent = 'Page type';
    box.appendChild(title);

    const typeRow = document.createElement('div');
    typeRow.setAttribute('style', 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;');
    let chosenType = effectiveType() || 'article';
    const typeButtons = {};
    for (const pt of PAGE_TYPES) {
      const b = document.createElement('button');
      b.className = 'pdo-btn';
      if (pt === chosenType) b.classList.add('primary');
      b.textContent = pt;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        chosenType = pt;
        for (const k of Object.keys(typeButtons)) typeButtons[k].classList.remove('primary');
        b.classList.add('primary');
      });
      typeButtons[pt] = b;
      typeRow.appendChild(b);
    }
    box.appendChild(typeRow);

    const scopeTitle = document.createElement('div');
    scopeTitle.setAttribute('style', 'font-weight:600;margin-bottom:6px;');
    scopeTitle.textContent = 'Apply to';
    box.appendChild(scopeTitle);

    const host = location.hostname.replace(/^www\./, '');
    const pathPrefix = PDO.getPathPrefix(state.normUrl) || host;
    const scopes = [
      { match: 'url-exact', pattern: state.normUrl, label: 'This URL only' },
      { match: 'path-prefix', pattern: pathPrefix, label: `Path prefix: ${pathPrefix}` },
      { match: 'domain', pattern: host, label: `Whole domain: ${host}` }
    ];
    const scopeRow = document.createElement('div');
    scopeRow.setAttribute('style', 'display:flex;flex-direction:column;gap:4px;margin-bottom:12px;');
    for (const s of scopes) {
      const b = document.createElement('button'); b.className = 'pdo-btn';
      b.textContent = s.label;
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        await PDO.addTypeRule({ match: s.match, pattern: s.pattern, type: chosenType });
        state.stored.type = chosenType;
        await PDO.savePageMeta(state.normUrl, state.stored);
        backdrop.remove();
        const rules = await PDO.getTypeRules();
        state.rule = PDO.resolveType(state.normUrl, rules);
        render();
      });
      scopeRow.appendChild(b);
    }
    box.appendChild(scopeRow);

    const cancel = document.createElement('button'); cancel.className = 'pdo-btn'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', (e) => { e.stopPropagation(); backdrop.remove(); });
    box.appendChild(cancel);

    backdrop.appendChild(box);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    shadowRoot.appendChild(backdrop);
  }

  function downloadFixture() {
    try {
      const host = location.hostname.replace(/^www\./, '').replace(/\./g, '-');
      const stamp = new Date().toISOString().slice(0, 10);
      const label = `${host}-${stamp}`;

      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('#pdo-overlay-host').forEach(n => n.remove());
      const html = '<!DOCTYPE html>\n' + clone.outerHTML;

      const expected = {
        label,
        url: state.normUrl,
        note: 'Captured from overlay. Fill in expected values and set pending=false.',
        pending: true,
        expected: {
          publishedAt: state.stored.publishedAt || null,
          modifiedAt: state.stored.modifiedAt || null,
          author: state.stored.author || null,
          type: effectiveType() || 'article',
          minConfidence: state.stored.confidence || 'none'
        },
        extractedAt: new Date().toISOString(),
        extractorSays: {
          published: state.stored.publishedAt,
          modified: state.stored.modifiedAt,
          author: state.stored.author,
          confidence: state.stored.confidence,
          sources: state.stored.sources,
          candidates: state.stored.candidates
        }
      };

      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${label}.html`);
      downloadBlob(new Blob([JSON.stringify(expected, null, 2)], { type: 'application/json' }), `${label}.expected.json`);
      notify('Downloaded fixture (.html + .expected.json)');
    } catch (e) {
      notify('Fixture download failed: ' + e.message);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function hideForUrl() {
    await PDO.addTypeRule({ match: 'url-exact', pattern: state.normUrl, type: 'app' });
    if (rootEl) rootEl.classList.add('pdo-hidden');
  }

  async function requestWayback() {
    try {
      const resp = await browserAPI.runtime.sendMessage({ action: 'wayback', url: location.href });
      if (resp && resp.success && resp.earliestDate) {
        state.stored.candidates = state.stored.candidates || [];
        state.stored.candidates.push({ tier: 5, source: 'wayback:earliest', field: 'published', raw: resp.earliestRaw, normalized: resp.earliestDate });
        if (!state.stored.publishedAt || resp.earliestDate < state.stored.publishedAt) {
          state.stored.publishedAt = resp.earliestDate;
          state.stored.sources = Object.assign({}, state.stored.sources, { published: 'wayback:earliest' });
        }
        await PDO.savePageMeta(state.normUrl, state.stored);
        render();
      } else {
        notify('Wayback: no snapshot found' + (resp && resp.error ? ' (' + resp.error + ')' : ''));
      }
    } catch (e) { notify('Wayback error: ' + e.message); }
  }

  async function requestHead() {
    try {
      const resp = await browserAPI.runtime.sendMessage({ action: 'head', url: location.href });
      if (resp && resp.success && resp.lastModifiedDate) {
        state.stored.candidates = state.stored.candidates || [];
        state.stored.candidates.push({ tier: 4, source: 'http:last-modified', field: 'modified', raw: resp.lastModifiedRaw, normalized: resp.lastModifiedDate });
        if (!state.stored.modifiedAt) {
          state.stored.modifiedAt = resp.lastModifiedDate;
          state.stored.sources = Object.assign({}, state.stored.sources, { modified: 'http:last-modified' });
        }
        await PDO.savePageMeta(state.normUrl, state.stored);
        render();
      } else {
        notify('No Last-Modified header' + (resp && resp.error ? ' (' + resp.error + ')' : ''));
      }
    } catch (e) { notify('HEAD error: ' + e.message); }
  }

  function notify(msg) {
    const n = document.createElement('div');
    n.setAttribute('style', 'position:fixed;left:50%;top:12px;transform:translateX(-50%);background:#333;color:#fff;padding:6px 12px;border-radius:6px;font-family:inherit;font-size:12px;z-index:2147483647;');
    n.textContent = msg;
    shadowRoot.appendChild(n);
    setTimeout(() => n.remove(), 2500);
  }

  // ============== Commands ==============

  function wireCommandListener() {
    browserAPI.runtime.onMessage.addListener((msg) => {
      if (!msg || !msg.command) return;
      if (msg.command === 'toggle-overlay') {
        if (!rootEl) { render(); return; }
        rootEl.classList.toggle('pdo-hidden');
      } else if (msg.command === 'pick-type') {
        if (!rootEl) render();
        openTypePicker();
      } else if (msg.command === 'edit-overlay') {
        if (!rootEl) render();
        state.open = true; state.editing = true; render();
      }
    });
  }

  // ============== Reading tracker ==============

  function startReadingTracker() {
    if (effectiveType() !== 'article') return;
    let lastTick = Date.now();
    let visible = document.visibilityState === 'visible';

    document.addEventListener('visibilitychange', () => {
      visible = document.visibilityState === 'visible';
      lastTick = Date.now();
    });

    ['mousemove', 'keydown', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, () => { state.reading.lastActivityAt = Date.now(); }, { passive: true });
    });

    setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      if (!visible) return;
      if (now - state.reading.lastActivityAt > 60000) return;
      state.reading.activeSec += delta;

      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const winH = window.innerHeight || doc.clientHeight;
      const docH = Math.max(doc.scrollHeight, doc.offsetHeight, winH);
      const pct = docH > 0 ? Math.min(100, Math.round(((scrollTop + winH) / docH) * 100)) : 0;
      if (pct > state.reading.maxScrollPct) state.reading.maxScrollPct = pct;
    }, 5000);

    const finalize = async () => {
      if (state.reading.activeSec < (state.settings.readingMinActiveSec || 30)) return;
      if (state.reading.maxScrollPct < (state.settings.readingMinScrollPct || 50)) return;
      state.stored.reads = state.stored.reads || [];
      state.stored.reads.push({
        at: new Date().toISOString(),
        activeSec: Math.round(state.reading.activeSec),
        scrollPct: state.reading.maxScrollPct
      });
      await PDO.savePageMeta(state.normUrl, state.stored);
    };
    window.addEventListener('pagehide', finalize);
    window.addEventListener('beforeunload', finalize);
  }

  init().catch(err => console.warn('[PDO] init failed', err));
})();
