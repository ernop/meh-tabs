#!/usr/bin/env node
/* Download a page and save it as a test fixture.
 * Usage:  node tools/fetch-fixture.js <url> [label]
 *   e.g.: node tools/fetch-fixture.js https://www.ibm.com/think/topics/autoregressive-model ibm-autoregressive
 *
 * Writes:
 *   tests/fixtures/<label>.html
 *   tests/fixtures/<label>.expected.json   (skeleton; fill in and re-run `npm test`)
 *   tests/fixtures/<label>.meta.json       (fetch metadata: url, fetchedAt, http headers)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

function die(msg, code) { console.error(msg); process.exit(code || 1); }

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
          url: target,
          status: res.statusCode
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function slug(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    const pathSegment = url.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    return `${host.replace(/\./g, '-')}${pathSegment ? '--' + pathSegment : ''}`.slice(0, 80);
  } catch (_) { return 'fixture-' + Date.now(); }
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 1) die('Usage: node tools/fetch-fixture.js <url> [label]');
  const target = args[0];
  const label = args[1] || slug(target);

  const dir = path.join(__dirname, '..', 'tests', 'fixtures');
  fs.mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, `${label}.html`);
  const expectedPath = path.join(dir, `${label}.expected.json`);
  const metaPath = path.join(dir, `${label}.meta.json`);

  console.log(`Fetching ${target} …`);
  const res = await fetchUrl(target);
  fs.writeFileSync(htmlPath, res.html, 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify({
    url: target,
    fetchedAt: new Date().toISOString(),
    status: res.status,
    contentType: res.headers['content-type'] || null,
    lastModifiedHeader: res.headers['last-modified'] || null
  }, null, 2), 'utf8');

  if (!fs.existsSync(expectedPath)) {
    fs.writeFileSync(expectedPath, JSON.stringify({
      label,
      url: target,
      note: 'Fill in expected values below; leave null if truly unknown on the page. Set pending=false when reviewed.',
      pending: true,
      expected: {
        publishedAt: null,
        modifiedAt: null,
        author: null,
        type: 'article',
        minConfidence: 'low'
      }
    }, null, 2), 'utf8');
  }

  console.log(`Saved:`);
  console.log(`  ${htmlPath}`);
  console.log(`  ${metaPath}`);
  console.log(`  ${expectedPath}  (edit this, then run: npm test)`);
  console.log(`\nTry it:  node tools/try-url.js --file "${htmlPath}"`);
}

run().catch(e => die(e.stack || e.message));
