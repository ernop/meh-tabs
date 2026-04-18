/* Tier 1-3 extractors: JSON-LD + meta tags, URL patterns, visible byline text.
 * Produces an array of candidates plus a reconciled best-pick.
 * Output shape:
 * {
 *   candidates: [{tier, source, raw, normalizedDate, authorRaw}],
 *   published: 'YYYY-MM-DD' | null,
 *   modified:  'YYYY-MM-DD' | null,
 *   author:    string | null,
 *   confidence: 'high' | 'medium' | 'low' | 'none',
 *   sources: { published: string, modified: string, author: string }
 * }
 */
(function (root) {
  const MONTH = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  function pad2(n) { return String(n).padStart(2, '0'); }

  function plausibleYear(y) {
    const now = new Date().getUTCFullYear();
    return y >= 1990 && y <= now + 1;
  }

  function toIsoDate(y, m, d) {
    if (!plausibleYear(y) || !m || m < 1 || m > 12) return null;
    if (d && (d < 1 || d > 31)) return null;
    const month = pad2(m);
    const day = d ? pad2(d) : '01';
    return `${y}-${month}-${day}`;
  }

  /* Normalize a raw date string into YYYY-MM-DD (or null).
   * Accepts ISO-8601, `YYYY-MM-DD`, `YYYY/MM/DD`, `Month D, YYYY`, `D Month YYYY`,
   * Unix epoch seconds/millis, and a few common variants. */
  function normalizeDate(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;

    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2})?/);
    if (isoMatch) return toIsoDate(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

    const slashMatch = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})/);
    if (slashMatch) return toIsoDate(+slashMatch[1], +slashMatch[2], +slashMatch[3]);

    const usMatch = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
    if (usMatch) return toIsoDate(+usMatch[3], +usMatch[1], +usMatch[2]);

    const monDYMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
    if (monDYMatch) {
      const m = MONTH[monDYMatch[1].toLowerCase()];
      if (m) return toIsoDate(+monDYMatch[3], m, +monDYMatch[2]);
    }

    const dMonYMatch = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
    if (dMonYMatch) {
      const m = MONTH[dMonYMatch[2].toLowerCase()];
      if (m) return toIsoDate(+dMonYMatch[3], m, +dMonYMatch[1]);
    }

    const monYMatch = s.match(/^([A-Za-z]+)\s+(\d{4})/);
    if (monYMatch) {
      const m = MONTH[monYMatch[1].toLowerCase()];
      if (m) return toIsoDate(+monYMatch[2], m, null);
    }

    const num = Number(s);
    if (Number.isFinite(num) && num > 0) {
      const ms = num < 1e12 ? num * 1000 : num;
      const d = new Date(ms);
      if (!isNaN(d.getTime()) && plausibleYear(d.getUTCFullYear())) {
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
      }
    }

    const d = new Date(s);
    if (!isNaN(d.getTime()) && plausibleYear(d.getUTCFullYear())) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
    return null;
  }

  // ============== Tier 1: structured metadata ==============

  function extractJsonLd() {
    const results = [];
    const nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (const node of nodes) {
      let data;
      try { data = JSON.parse(node.textContent); }
      catch (_) { continue; }
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) walkJsonLd(item, results);
    }
    return results;
  }

  function walkJsonLd(obj, results) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(o => walkJsonLd(o, results)); return; }

    const pub = obj.datePublished || obj.dateCreated;
    const mod = obj.dateModified;
    const author = obj.author
      ? Array.isArray(obj.author)
        ? obj.author.map(a => (typeof a === 'string' ? a : a && a.name)).filter(Boolean).join(', ')
        : (typeof obj.author === 'string' ? obj.author : obj.author.name)
      : null;

    if (pub || mod || author) {
      results.push({
        type: obj['@type'] || null,
        datePublished: pub || null,
        dateModified: mod || null,
        author: author || null
      });
    }
    if (obj['@graph']) walkJsonLd(obj['@graph'], results);
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (v && typeof v === 'object') walkJsonLd(v, results);
    }
  }

  function extractMetaTags() {
    const pick = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const v = el.getAttribute('content') || el.getAttribute('datetime') || el.textContent;
          if (v && v.trim()) return { raw: v.trim(), selector: sel };
        }
      }
      return null;
    };

    const pubCandidates = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="pubdate"]',
      'meta[name="publishdate"]',
      'meta[name="publish-date"]',
      'meta[name="PublishDate"]',
      'meta[name="DC.date.issued"]',
      'meta[name="DC.date.created"]',
      'meta[name="dc.date"]',
      'meta[name="date"]',
      'meta[name="parsely-pub-date"]',
      'meta[name="sailthru.date"]',
      'meta[name="citation_publication_date"]',
      'meta[name="citation_date"]',
      'meta[itemprop="datePublished"]',
      'time[itemprop="datePublished"]'
    ];
    const modCandidates = [
      'meta[property="article:modified_time"]',
      'meta[name="article:modified_time"]',
      'meta[name="last-modified"]',
      'meta[name="DC.date.modified"]',
      'meta[itemprop="dateModified"]',
      'time[itemprop="dateModified"]'
    ];
    const authorCandidates = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="article:author"]',
      'meta[name="DC.creator"]',
      'meta[name="citation_author"]',
      'meta[name="parsely-author"]',
      'meta[itemprop="author"]'
    ];

    return {
      published: pick(pubCandidates),
      modified: pick(modCandidates),
      author: pick(authorCandidates)
    };
  }

  function extractVisibleTimeTags() {
    const results = [];
    const nodes = document.querySelectorAll('time[datetime]');
    for (const t of nodes) {
      const dt = t.getAttribute('datetime');
      if (!dt) continue;
      const inByline = !!t.closest('.byline, .meta, .posted-on, .article-date, .published, .entry-date, .post-date, [class*="date"], [class*="byline"]');
      results.push({
        raw: dt,
        text: t.textContent.trim(),
        inByline
      });
    }
    return results;
  }

  // ============== Tier 2: URL patterns ==============

  function extractUrlDate() {
    const path = location.pathname;
    const m1 = path.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
    if (m1) {
      const iso = toIsoDate(+m1[1], +m1[2], +m1[3]);
      if (iso) return { raw: m1[0], normalized: iso, granularity: 'day' };
    }
    const m2 = path.match(/\/(\d{4})-(\d{2})-(\d{2})(?:\/|-|$)/);
    if (m2) {
      const iso = toIsoDate(+m2[1], +m2[2], +m2[3]);
      if (iso) return { raw: m2[0], normalized: iso, granularity: 'day' };
    }
    const m3 = path.match(/\/(\d{4})\/(\d{1,2})(?:\/|$)/);
    if (m3) {
      const iso = toIsoDate(+m3[1], +m3[2], null);
      if (iso) return { raw: m3[0], normalized: iso, granularity: 'month' };
    }
    const q = new URLSearchParams(location.search);
    for (const key of ['date', 'published', 'pubdate']) {
      const v = q.get(key);
      if (v) {
        const iso = normalizeDate(v);
        if (iso) return { raw: v, normalized: iso, granularity: 'day' };
      }
    }
    return null;
  }

  // ============== Tier 3: visible text within main content ==============

  const DATE_PHRASE = /\b(published|posted|updated|last\s+modified|revised)\b[^\n<]{0,40}?(\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i;
  const LONE_DATE = /(\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/;

  function mainRegion() {
    return document.querySelector('article main')
      || document.querySelector('main article')
      || document.querySelector('article')
      || document.querySelector('main')
      || document.body;
  }

  function extractTextDate() {
    const region = mainRegion();
    if (!region) return null;
    const clone = region.cloneNode(true);
    clone.querySelectorAll('nav, header, footer, aside, script, style, .comments, .related, .sidebar, .ad, .advertisement').forEach(el => el.remove());
    const text = clone.textContent.replace(/\s+/g, ' ').slice(0, 20000);

    const phraseMatch = text.match(DATE_PHRASE);
    if (phraseMatch) {
      const iso = normalizeDate(phraseMatch[2]);
      if (iso) return { raw: phraseMatch[0], normalized: iso, kind: phraseMatch[1].toLowerCase() };
    }

    const head = text.slice(0, 2000);
    const loneMatch = head.match(LONE_DATE);
    if (loneMatch) {
      const iso = normalizeDate(loneMatch[1]);
      if (iso) return { raw: loneMatch[1], normalized: iso, kind: 'lone' };
    }
    return null;
  }

  function extractBylineAuthor() {
    const selectors = [
      '[rel="author"]',
      '[itemprop="author"] [itemprop="name"]',
      '[itemprop="author"]',
      '.byline .author',
      '.byline-author',
      '.post-author',
      '.article-author',
      '.entry-author',
      '.author-name'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return { raw: el.textContent.trim(), selector: sel };
      }
    }
    const region = mainRegion();
    if (region) {
      const text = region.textContent.slice(0, 2000);
      const m = text.match(/\bBy\s+([A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3})/);
      if (m) return { raw: m[1], selector: 'text:by-regex' };
    }
    return null;
  }

  // ============== Reconciliation ==============

  function extractAll() {
    const candidates = [];
    const jsonLd = extractJsonLd();
    for (const j of jsonLd) {
      if (j.datePublished) {
        candidates.push({ tier: 1, source: `jsonld${j.type ? '/' + j.type : ''}:datePublished`, field: 'published', raw: j.datePublished, normalizedDate: normalizeDate(j.datePublished) });
      }
      if (j.dateModified) {
        candidates.push({ tier: 1, source: `jsonld${j.type ? '/' + j.type : ''}:dateModified`, field: 'modified', raw: j.dateModified, normalizedDate: normalizeDate(j.dateModified) });
      }
      if (j.author) {
        candidates.push({ tier: 1, source: `jsonld${j.type ? '/' + j.type : ''}:author`, field: 'author', raw: j.author });
      }
    }

    const meta = extractMetaTags();
    if (meta.published) candidates.push({ tier: 1, source: `meta:${meta.published.selector}`, field: 'published', raw: meta.published.raw, normalizedDate: normalizeDate(meta.published.raw) });
    if (meta.modified) candidates.push({ tier: 1, source: `meta:${meta.modified.selector}`, field: 'modified', raw: meta.modified.raw, normalizedDate: normalizeDate(meta.modified.raw) });
    if (meta.author) candidates.push({ tier: 1, source: `meta:${meta.author.selector}`, field: 'author', raw: meta.author.raw });

    const timeTags = extractVisibleTimeTags();
    for (const t of timeTags) {
      const iso = normalizeDate(t.raw);
      if (iso) candidates.push({ tier: 1, source: `time[datetime]${t.inByline ? '@byline' : ''}`, field: 'published', raw: t.raw, normalizedDate: iso, weak: !t.inByline });
    }

    const urlDate = extractUrlDate();
    if (urlDate) candidates.push({ tier: 2, source: 'url-path', field: 'published', raw: urlDate.raw, normalizedDate: urlDate.normalized, granularity: urlDate.granularity });

    const textDate = extractTextDate();
    if (textDate) candidates.push({ tier: 3, source: `text:${textDate.kind}`, field: textDate.kind === 'updated' || textDate.kind === 'last modified' || textDate.kind === 'revised' ? 'modified' : 'published', raw: textDate.raw, normalizedDate: textDate.normalized });

    const bylineAuthor = extractBylineAuthor();
    if (bylineAuthor) candidates.push({ tier: 3, source: `dom:${bylineAuthor.selector}`, field: 'author', raw: bylineAuthor.raw });

    const pickFirst = (field, predicate) => {
      const hits = candidates.filter(c => c.field === field && (!predicate || predicate(c)));
      hits.sort((a, b) => a.tier - b.tier || (a.weak === b.weak ? 0 : a.weak ? 1 : -1));
      return hits[0] || null;
    };

    const pubPick = pickFirst('published', c => !!c.normalizedDate);
    const modPick = pickFirst('modified', c => !!c.normalizedDate);
    const authorPick = pickFirst('author');

    const published = pubPick ? pubPick.normalizedDate : null;
    const modified = modPick ? modPick.normalizedDate : null;
    const author = authorPick ? cleanAuthor(authorPick.raw) : null;

    let confidence = 'none';
    if (pubPick && pubPick.tier === 1 && !pubPick.weak) confidence = 'high';
    else if (pubPick && (pubPick.tier <= 2 || published)) confidence = 'medium';
    else if (pubPick) confidence = 'low';

    const pubAgreeing = candidates.filter(c => c.field === 'published' && c.normalizedDate);
    if (pubAgreeing.length >= 2) {
      const first = pubAgreeing[0].normalizedDate;
      const deltas = pubAgreeing.slice(1).map(c => Math.abs(daysBetween(first, c.normalizedDate)));
      if (deltas.every(d => d <= 30) && confidence !== 'high') confidence = 'high';
    }

    return {
      candidates,
      published, modified, author, confidence,
      sources: {
        published: pubPick ? pubPick.source : null,
        modified: modPick ? modPick.source : null,
        author: authorPick ? authorPick.source : null
      }
    };
  }

  function cleanAuthor(raw) {
    if (!raw) return null;
    let s = String(raw).replace(/^\s*by\s+/i, '').trim();
    s = s.replace(/\s*[,;]\s*$/, '').replace(/\s+/g, ' ');
    return s || null;
  }

  function daysBetween(aIso, bIso) {
    const a = Date.parse(aIso);
    const b = Date.parse(bIso);
    if (isNaN(a) || isNaN(b)) return 9999;
    return Math.abs(a - b) / 86400000;
  }

  root.PDO = root.PDO || {};
  root.PDO.extractAll = extractAll;
  root.PDO.normalizeDate = normalizeDate;
})(typeof self !== 'undefined' ? self : this);
