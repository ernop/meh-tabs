/* Storage helpers for pageMeta / typeRules / settings.
 * Uses browser.storage.local as the only persistence layer. */
(function (root) {
  const browserAPI = root.browser || root.chrome;

  const KEYS = {
    pageMeta: 'pdo_pageMeta',
    typeRules: 'pdo_typeRules',
    domainHints: 'pdo_domainHints',
    settings: 'pdo_settings'
  };

  const DEFAULT_SETTINGS = {
    overlayPosition: 'tr',
    enabled: true,
    hiddenTypes: ['home', 'feed', 'app', 'product'],
    waybackAutoLookup: false,
    lastModifiedAutoLookup: false,
    localLlmEndpoint: null,
    readingMinActiveSec: 30,
    readingMinScrollPct: 50
  };

  const PAGE_TYPES = ['article', 'docs', 'home', 'feed', 'product', 'app', 'unknown'];

  async function getAll() {
    const result = await browserAPI.storage.local.get([
      KEYS.pageMeta, KEYS.typeRules, KEYS.domainHints, KEYS.settings
    ]);
    return {
      pageMeta: result[KEYS.pageMeta] || {},
      typeRules: result[KEYS.typeRules] || [],
      domainHints: result[KEYS.domainHints] || {},
      settings: Object.assign({}, DEFAULT_SETTINGS, result[KEYS.settings] || {})
    };
  }

  async function getSettings() {
    const result = await browserAPI.storage.local.get(KEYS.settings);
    return Object.assign({}, DEFAULT_SETTINGS, result[KEYS.settings] || {});
  }

  async function setSettings(patch) {
    const current = await getSettings();
    const merged = Object.assign({}, current, patch);
    await browserAPI.storage.local.set({ [KEYS.settings]: merged });
    return merged;
  }

  async function getPageMeta(normUrl) {
    const result = await browserAPI.storage.local.get(KEYS.pageMeta);
    const all = result[KEYS.pageMeta] || {};
    return all[normUrl] || null;
  }

  async function savePageMeta(normUrl, meta) {
    const result = await browserAPI.storage.local.get(KEYS.pageMeta);
    const all = result[KEYS.pageMeta] || {};
    all[normUrl] = meta;
    await browserAPI.storage.local.set({ [KEYS.pageMeta]: all });
  }

  async function getTypeRules() {
    const result = await browserAPI.storage.local.get(KEYS.typeRules);
    return result[KEYS.typeRules] || [];
  }

  async function addTypeRule(rule) {
    const rules = await getTypeRules();
    rules.unshift(Object.assign({ addedAt: new Date().toISOString() }, rule));
    await browserAPI.storage.local.set({ [KEYS.typeRules]: rules });
    return rules;
  }

  async function removeTypeRule(index) {
    const rules = await getTypeRules();
    if (index < 0 || index >= rules.length) return rules;
    rules.splice(index, 1);
    await browserAPI.storage.local.set({ [KEYS.typeRules]: rules });
    return rules;
  }

  /* Resolve a URL against the rule list. First match wins (rules are ordered
   * most-specific first by convention: exact URL, then path-prefix, then domain). */
  function resolveType(url, rules) {
    if (!url) return null;
    let host, path;
    try {
      const u = new URL(url);
      host = u.hostname.toLowerCase().replace(/^www\./, '');
      path = u.pathname;
    } catch (_) { return null; }

    for (const rule of rules) {
      if (!rule || !rule.type) continue;
      if (rule.match === 'url-exact') {
        if (rule.pattern === url) return rule;
      } else if (rule.match === 'path-prefix') {
        // pattern like "ibm.com/think/topics/"
        const [pHost, ...rest] = rule.pattern.split('/');
        const pPath = '/' + rest.filter(Boolean).join('/');
        if (host === pHost && (path === pPath || path.startsWith(pPath + '/') || path.startsWith(pPath))) {
          return rule;
        }
      } else if (rule.match === 'domain') {
        if (host === rule.pattern || host.endsWith('.' + rule.pattern)) return rule;
      } else if (rule.match === 'regex') {
        try {
          const re = new RegExp(rule.pattern);
          if (re.test(url)) return rule;
        } catch (_) { /* skip bad regex */ }
      }
    }
    return null;
  }

  async function exportAll() {
    const data = await getAll();
    return JSON.stringify(data, null, 2);
  }

  async function importAll(jsonString) {
    const data = JSON.parse(jsonString);
    const payload = {};
    if (data.pageMeta) payload[KEYS.pageMeta] = data.pageMeta;
    if (data.typeRules) payload[KEYS.typeRules] = data.typeRules;
    if (data.domainHints) payload[KEYS.domainHints] = data.domainHints;
    if (data.settings) payload[KEYS.settings] = data.settings;
    await browserAPI.storage.local.set(payload);
  }

  const api = {
    KEYS, DEFAULT_SETTINGS, PAGE_TYPES,
    getAll, getSettings, setSettings,
    getPageMeta, savePageMeta,
    getTypeRules, addTypeRule, removeTypeRule, resolveType,
    exportAll, importAll
  };
  if (root.PDO) Object.assign(root.PDO, api);
  else root.PDO = api;
})(typeof self !== 'undefined' ? self : this);
