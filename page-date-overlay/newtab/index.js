(function () {
  const browserAPI = window.browser || window.chrome;
  const PDO = window.PDO;

  const state = { data: null, filter: { q: '', type: '', date: 'all', override: 'all' } };

  function daysAgo(n) { return Date.now() - n * 86400000; }

  async function load() {
    state.data = await PDO.getAll();
    renderStats();
    renderSettings();
    renderRules();
    renderTypeFilterOptions();
    renderPages();
  }

  function renderStats() {
    const pages = Object.values(state.data.pageMeta);
    document.getElementById('stat-pages').textContent = pages.length;
    document.getElementById('stat-dated').textContent = pages.filter(p => p.publishedAt).length;
    document.getElementById('stat-authored').textContent = pages.filter(p => p.author).length;
    document.getElementById('stat-overrides').textContent = pages.filter(p => p.userOverride).length;
    document.getElementById('stat-rules').textContent = state.data.typeRules.length;

    const cutoff = daysAgo(7);
    let reads7 = 0;
    for (const p of pages) {
      for (const r of (p.reads || [])) {
        if (Date.parse(r.at) >= cutoff) reads7++;
      }
    }
    document.getElementById('stat-reads-7d').textContent = reads7;
  }

  function renderSettings() {
    const s = state.data.settings;
    document.getElementById('s-enabled').checked = !!s.enabled;
    document.getElementById('s-position').value = s.overlayPosition || 'tr';
    document.getElementById('s-read-sec').value = s.readingMinActiveSec;
    document.getElementById('s-read-scroll').value = s.readingMinScrollPct;

    const hiddenHost = document.getElementById('s-hidden-types');
    hiddenHost.textContent = '';
    for (const t of PDO.PAGE_TYPES) {
      const id = 'hide-' + t;
      const wrap = document.createElement('label');
      wrap.style.marginRight = '10px';
      wrap.style.display = 'inline-flex';
      wrap.style.gap = '4px';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = id; cb.checked = (s.hiddenTypes || []).includes(t);
      cb.addEventListener('change', async () => {
        const current = new Set((state.data.settings.hiddenTypes || []));
        if (cb.checked) current.add(t); else current.delete(t);
        const merged = await PDO.setSettings({ hiddenTypes: Array.from(current) });
        state.data.settings = merged;
      });
      wrap.appendChild(cb);
      const span = document.createElement('span'); span.textContent = t;
      wrap.appendChild(span);
      hiddenHost.appendChild(wrap);
    }
  }

  function renderRules() {
    const tbody = document.getElementById('rules-body');
    tbody.textContent = '';
    document.getElementById('rules-count').textContent = `(${state.data.typeRules.length})`;
    state.data.typeRules.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.appendChild(td(String(i + 1)));
      tr.appendChild(td(r.match));
      tr.appendChild(td(r.pattern));
      tr.appendChild(td(r.type));
      tr.appendChild(td(r.addedAt ? r.addedAt.slice(0, 10) : ''));
      const delCell = document.createElement('td');
      const btn = document.createElement('button'); btn.className = 'btn danger'; btn.textContent = 'Remove';
      btn.addEventListener('click', async () => {
        state.data.typeRules = await PDO.removeTypeRule(i);
        renderRules(); renderStats();
      });
      delCell.appendChild(btn);
      tr.appendChild(delCell);
      tbody.appendChild(tr);
    });
  }

  function renderTypeFilterOptions() {
    const sel = document.getElementById('filter-type');
    for (const t of PDO.PAGE_TYPES) {
      const opt = document.createElement('option'); opt.value = t; opt.textContent = t; sel.appendChild(opt);
    }
  }

  function renderPages() {
    const tbody = document.getElementById('pages-body');
    tbody.textContent = '';

    const rows = Object.entries(state.data.pageMeta)
      .map(([url, meta]) => Object.assign({ url }, meta))
      .filter(r => matchesFilter(r))
      .sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''))
      .slice(0, 500);

    for (const r of rows) {
      const tr = document.createElement('tr');

      tr.appendChild(td(r.lastSeenAt ? r.lastSeenAt.slice(0, 16).replace('T', ' ') : '—'));

      const urlTd = document.createElement('td'); urlTd.className = 'url';
      const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = r.url;
      urlTd.appendChild(a);
      tr.appendChild(urlTd);

      const pubTd = document.createElement('td');
      if (r.publishedAt) pubTd.textContent = r.publishedAt;
      else { pubTd.textContent = 'unknown'; pubTd.classList.add('unknown'); }
      tr.appendChild(pubTd);

      tr.appendChild(td(r.author || '—'));

      const typeTd = document.createElement('td'); typeTd.textContent = r.type || '—';
      if (r.userOverride) {
        const p = document.createElement('span'); p.className = 'pill'; p.textContent = 'override';
        typeTd.appendChild(p);
      }
      tr.appendChild(typeTd);

      const confTd = document.createElement('td');
      const dot = document.createElement('span'); dot.className = 'conf-dot conf-' + (r.confidence || 'none');
      confTd.appendChild(dot);
      confTd.appendChild(document.createTextNode(r.confidence || 'none'));
      tr.appendChild(confTd);

      tr.appendChild(td(String((r.reads || []).length)));

      const actionsTd = document.createElement('td');
      const del = document.createElement('button'); del.className = 'btn danger'; del.textContent = 'Forget';
      del.addEventListener('click', async () => {
        delete state.data.pageMeta[r.url];
        await browserAPI.storage.local.set({ [PDO.KEYS.pageMeta]: state.data.pageMeta });
        renderPages(); renderStats();
      });
      actionsTd.appendChild(del);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    }
  }

  function matchesFilter(r) {
    const f = state.filter;
    if (f.type && r.type !== f.type) return false;
    if (f.date === 'dated' && !r.publishedAt) return false;
    if (f.date === 'unknown' && r.publishedAt) return false;
    if (f.override === 'yes' && !r.userOverride) return false;
    if (f.override === 'no' && r.userOverride) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = (r.url + ' ' + (r.author || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function td(text) { const t = document.createElement('td'); t.textContent = text; return t; }

  // ==== Wire events ====

  document.getElementById('filter-url').addEventListener('input', e => { state.filter.q = e.target.value.trim(); renderPages(); });
  document.getElementById('filter-type').addEventListener('change', e => { state.filter.type = e.target.value; renderPages(); });
  document.getElementById('filter-date').addEventListener('change', e => { state.filter.date = e.target.value; renderPages(); });
  document.getElementById('filter-override').addEventListener('change', e => { state.filter.override = e.target.value; renderPages(); });

  document.getElementById('s-enabled').addEventListener('change', async e => {
    state.data.settings = await PDO.setSettings({ enabled: e.target.checked });
  });
  document.getElementById('s-position').addEventListener('change', async e => {
    state.data.settings = await PDO.setSettings({ overlayPosition: e.target.value });
  });
  document.getElementById('s-read-sec').addEventListener('change', async e => {
    const v = Math.max(5, Math.min(600, parseInt(e.target.value) || 30));
    state.data.settings = await PDO.setSettings({ readingMinActiveSec: v });
    e.target.value = v;
  });
  document.getElementById('s-read-scroll').addEventListener('change', async e => {
    const v = Math.max(5, Math.min(100, parseInt(e.target.value) || 50));
    state.data.settings = await PDO.setSettings({ readingMinScrollPct: v });
    e.target.value = v;
  });

  document.getElementById('export').addEventListener('click', async () => {
    const json = await PDO.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `page-date-overlay-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      await PDO.importAll(text);
      await load();
      alert('Import complete.');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  });

  load();
})();
