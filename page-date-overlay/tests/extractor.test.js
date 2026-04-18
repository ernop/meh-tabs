/* Fixture-driven extractor tests.
 * Discovers tests/fixtures/*.html and runs the extractor against each, asserting
 * against the sibling *.expected.json file (if present).
 *
 * Fixtures can be hand-authored or captured via:
 *   node tools/fetch-fixture.js <url> [label]
 * or by clicking "Download fixture" in the overlay.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { URL } = require('url');

let jsdom;
try { jsdom = require('jsdom'); } catch (_) { jsdom = null; }

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

if (!jsdom) {
  console.log('SKIP extractor.test.js — jsdom not installed.');
  console.log('     Install Node.js + run:  cd page-date-overlay && npm install');
  process.exit(0);
}
if (!fs.existsSync(FIXTURES_DIR)) {
  console.log('SKIP extractor.test.js — no tests/fixtures/ directory yet.');
  process.exit(0);
}

const { JSDOM } = jsdom;

function loadExtractor(documentRef, urlHref) {
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

function runFixture(htmlPath) {
  const label = path.basename(htmlPath, '.html');
  const expectedPath = path.join(FIXTURES_DIR, `${label}.expected.json`);

  const html = fs.readFileSync(htmlPath, 'utf8');

  let expected = null;
  if (fs.existsSync(expectedPath)) {
    try { expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8')); }
    catch (e) { return { label, status: 'FAIL', reason: `bad expected.json: ${e.message}` }; }
  }

  const fixtureUrl = (expected && expected.url) || `https://fixture.local/${label}`;
  let dom;
  try { dom = new JSDOM(html, { url: fixtureUrl }); }
  catch (e) { return { label, status: 'FAIL', reason: `jsdom parse failed: ${e.message}` }; }

  const PDO = loadExtractor(dom.window.document, fixtureUrl);
  const r = PDO.extractAll();

  if (!expected) {
    return { label, status: 'CAPTURED', actual: compact(r) };
  }
  if (expected.pending) {
    return { label, status: 'PENDING', actual: compact(r), note: 'expected.pending=true — fill in and set false' };
  }

  const e = expected.expected || {};
  const failures = [];
  if ('publishedAt' in e && e.publishedAt !== r.published) failures.push(`publishedAt: got ${r.published} want ${e.publishedAt}`);
  if ('modifiedAt' in e && e.modifiedAt !== r.modified) failures.push(`modifiedAt: got ${r.modified} want ${e.modifiedAt}`);
  if ('author' in e && e.author && !sameAuthor(r.author, e.author)) failures.push(`author: got ${JSON.stringify(r.author)} want ${JSON.stringify(e.author)}`);
  if ('minConfidence' in e && !atLeast(r.confidence, e.minConfidence)) failures.push(`confidence: got ${r.confidence} want >= ${e.minConfidence}`);

  if (failures.length) return { label, status: 'FAIL', failures, actual: compact(r) };
  return { label, status: 'PASS', actual: compact(r) };
}

function sameAuthor(got, want) {
  if (!got || !want) return got === want;
  return got.toLowerCase().includes(want.toLowerCase()) || want.toLowerCase().includes(got.toLowerCase());
}

function atLeast(got, want) {
  const rank = { none: 0, low: 1, medium: 2, high: 3 };
  return (rank[got] || 0) >= (rank[want] || 0);
}

function compact(r) {
  return {
    published: r.published,
    modified: r.modified,
    author: r.author,
    confidence: r.confidence,
    sources: r.sources,
    candidateCount: r.candidates.length
  };
}

const htmlFiles = fs.readdirSync(FIXTURES_DIR)
  .filter(n => n.endsWith('.html'))
  .map(n => path.join(FIXTURES_DIR, n));

if (htmlFiles.length === 0) {
  console.log('No HTML fixtures found in tests/fixtures/. Add one with:');
  console.log('  node tools/fetch-fixture.js https://example.com/article');
  process.exit(0);
}

let pass = 0, fail = 0, pending = 0, captured = 0;
for (const htmlPath of htmlFiles) {
  const r = runFixture(htmlPath);
  const tag = r.status.padEnd(8);
  if (r.status === 'PASS') { pass++; console.log(`${tag} ${r.label}`); }
  else if (r.status === 'FAIL') {
    fail++;
    console.log(`${tag} ${r.label}`);
    for (const f of (r.failures || [r.reason])) console.log(`         ${f}`);
    console.log(`         actual: ${JSON.stringify(r.actual)}`);
  } else if (r.status === 'PENDING') {
    pending++;
    console.log(`${tag} ${r.label}  (actual: ${r.actual.published} / ${r.actual.author} / conf=${r.actual.confidence})`);
  } else if (r.status === 'CAPTURED') {
    captured++;
    console.log(`${tag} ${r.label}  (no expected.json; actual: ${JSON.stringify(r.actual)})`);
  }
}

console.log(`\n${pass} pass  ${fail} fail  ${pending} pending  ${captured} captured  (${htmlFiles.length} total)`);
if (fail > 0) process.exit(1);
