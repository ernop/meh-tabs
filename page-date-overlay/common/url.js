/* URL normalization — identical rules shared by content script, background, and dashboard.
 * Attached to `self.PDO` namespace so it works in both window and service-worker contexts. */
(function (root) {
  const TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'utm_name', 'utm_reader', 'utm_brand', 'utm_social',
    'fbclid', 'gclid', 'gclsrc', 'msclkid', 'dclid',
    'mc_cid', 'mc_eid', 'ref', 'ref_src', 'ref_url', 'ref_source',
    'igshid', 'igsh', 'si', 'spm',
    '_ga', '_gl', 'yclid', 'wbraid', 'gbraid',
    'vero_id', 'vero_conv', 'hsCtaTracking', 'hsa_acc'
  ]);

  function normalizeUrl(input) {
    if (!input) return null;
    let u;
    try {
      u = new URL(input);
    } catch (_) {
      return null;
    }
    if (!/^https?:$/.test(u.protocol)) return null;

    u.hostname = u.hostname.toLowerCase();
    if (u.hostname.startsWith('www.')) u.hostname = u.hostname.slice(4);
    u.hash = '';
    const params = new URLSearchParams();
    const sortedKeys = Array.from(u.searchParams.keys()).sort();
    for (const key of sortedKeys) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) continue;
      for (const v of u.searchParams.getAll(key)) params.append(key, v);
    }
    u.search = params.toString();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  }

  function getDomain(input) {
    try {
      const u = new URL(input);
      return u.hostname.toLowerCase().replace(/^www\./, '');
    } catch (_) {
      return null;
    }
  }

  function getPathPrefix(input) {
    try {
      const u = new URL(input);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const parts = u.pathname.split('/').filter(Boolean);
      const segs = parts.slice(0, 2).join('/');
      return segs ? `${host}/${segs}` : host;
    } catch (_) {
      return null;
    }
  }

  const api = { normalizeUrl, getDomain, getPathPrefix };
  if (root.PDO) Object.assign(root.PDO, api);
  else root.PDO = api;
})(typeof self !== 'undefined' ? self : this);
