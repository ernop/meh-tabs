#!/usr/bin/env node
/* Fetch any URL, run the extractor against its HTML, print a report.
 * Usage:  node tools/try-url.js https://example.com/article
 *         node tools/try-url.js --file tests/fixtures/foo.html
 * Requires jsdom (npm install).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

function die(msg, code) { console.error(msg); process.exit(code || 1); }

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { url: null, file: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) { out.file = args[++i]; }
    else if (args[i].startsWith('http://') || args[i].startsWith('https://')) { out.url = args[i]; }
    else if (!args[i].startsWith('--')) { out.url = args[i]; }
  }
  return out;
}

function fetchUrl(target) {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'GET',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PageDateOverlay-Dev/0.1; +https://local)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, target).toString();
        fetchUrl(next).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${target}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          html: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
          url: target
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function loadExtractor(documentRef, urlHref) {
  // Mimic the content-script load order using jsdom's document / URL globals.
  const vm = require('vm');
  const locationShim = new URL(urlHref);
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Date,
    document: documentRef,
    location: {
      href: urlHref,
      hostname: locationShim.hostname,
      pathname: locationShim.pathname,
      search: locationShim.search
    }
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const f of ['common/url.js', 'common/storage.js', 'content/extractor.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox);
  }
  return sandbox.PDO;
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.url && !args.file) {
    die('Usage: node tools/try-url.js <url>\n   or: node tools/try-url.js --file path/to/fixture.html');
  }

  let jsdom;
  try { jsdom = require('jsdom'); }
  catch (_) {
    die(
      'jsdom is not installed.\n' +
      'Install Node.js (https://nodejs.org) and then run:\n' +
      '  cd page-date-overlay\n' +
      '  npm install'
    );
  }
  const { JSDOM } = jsdom;

  let html, effectiveUrl;
  if (args.file) {
    html = fs.readFileSync(args.file, 'utf8');
    effectiveUrl = args.url || `file://${path.resolve(args.file)}`;
  } else {
    console.log(`Fetching ${args.url} …`);
    const res = await fetchUrl(args.url);
    html = res.html;
    effectiveUrl = res.url;
    if (res.headers['last-modified']) {
      console.log(`  HTTP Last-Modified: ${res.headers['last-modified']}`);
    }
  }

  const dom = new JSDOM(html, { url: effectiveUrl, runScripts: 'outside-only' });
  const PDO = loadExtractor(dom.window.document, effectiveUrl);

  const result = PDO.extractAll();
  const normUrl = PDO.normalizeUrl(effectiveUrl);

  console.log('\n=== RESULT ==================================================');
  console.log('URL (normalized):', normUrl);
  console.log('Published:       ', result.published || '(unknown)');
  console.log('Modified:        ', result.modified  || '(unknown)');
  console.log('Author:          ', result.author    || '(unknown)');
  console.log('Confidence:      ', result.confidence);
  console.log('Sources:         ', result.sources);

  console.log('\n=== CANDIDATES (ordered by tier) ============================');
  const sorted = [...result.candidates].sort((a, b) => a.tier - b.tier || a.field.localeCompare(b.field));
  for (const c of sorted) {
    const raw = String(c.raw || '').replace(/\s+/g, ' ').slice(0, 110);
    const norm = c.normalizedDate ? ` → ${c.normalizedDate}` : '';
    console.log(`  T${c.tier} [${c.field}] ${c.source}: ${raw}${norm}`);
  }
  if (sorted.length === 0) console.log('  (none)');

  // Quick hints for debugging
  if (!result.published) {
    console.log('\nNo publication date extracted. Consider inspecting the raw HTML for:');
    console.log('  - <meta property="article:published_time">');
    console.log('  - JSON-LD datePublished (script[type="application/ld+json"])');
    console.log('  - <time datetime="..."> inside .byline / .post-date / etc.');
    console.log('  - URL path segments like /YYYY/MM/DD/');
  }
  console.log();
}

run().catch(e => die(e.stack || e.message));
