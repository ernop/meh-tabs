/* Minimal smoke test runnable under node.
 * Usage:  node page-date-overlay/tests/smoke.js
 * Loads url.js + relevant parts of extractor.js (normalizeDate) in a fake `self`
 * and asserts a handful of known cases. No test framework needed.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadInto(ctx, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInContext(src, ctx);
}

const sandbox = { console, URL, URLSearchParams, Date };
sandbox.self = sandbox;
vm.createContext(sandbox);
loadInto(sandbox, 'common/url.js');
loadInto(sandbox, 'common/storage.js'); // mostly for side effects; won't be called here
loadInto(sandbox, 'content/extractor.js');

const PDO = sandbox.PDO;

const failures = [];
function eq(label, got, want) {
  const ok = got === want;
  if (!ok) failures.push(`${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label);
}

// URL normalization
eq('normalizeUrl strips www + fragment + utm',
  PDO.normalizeUrl('https://www.example.com/path/?utm_source=a&q=1#frag'),
  'https://example.com/path?q=1');

eq('normalizeUrl strips trailing slash',
  PDO.normalizeUrl('https://example.com/a/b/'),
  'https://example.com/a/b');

eq('normalizeUrl rejects non-http',
  PDO.normalizeUrl('chrome://extensions'),
  null);

eq('getPathPrefix produces domain + two segments',
  PDO.getPathPrefix('https://www.ibm.com/think/topics/autoregressive-model'),
  'ibm.com/think/topics');

// Date normalization
eq('normalizeDate ISO',           PDO.normalizeDate('2024-03-15T09:00:00Z'), '2024-03-15');
eq('normalizeDate YYYY-MM-DD',    PDO.normalizeDate('2024-03-15'), '2024-03-15');
eq('normalizeDate Month D, YYYY', PDO.normalizeDate('March 15, 2024'), '2024-03-15');
eq('normalizeDate D Month YYYY',  PDO.normalizeDate('15 Mar 2024'), '2024-03-15');
eq('normalizeDate US slashed',    PDO.normalizeDate('3/15/2024'), '2024-03-15');
eq('normalizeDate epoch sec',     PDO.normalizeDate('1710460800'), '2024-03-15');
eq('normalizeDate epoch ms',      PDO.normalizeDate('1710460800000'), '2024-03-15');
eq('normalizeDate junk → null',   PDO.normalizeDate('not a date'), null);
eq('normalizeDate 1800 → null',   PDO.normalizeDate('1800-01-01'), null);

// resolveType
const rules = [
  { match: 'path-prefix', pattern: 'ibm.com/think/topics', type: 'article' },
  { match: 'domain', pattern: 'ibm.com', type: 'docs' }
];
eq('resolveType path-prefix wins', PDO.resolveType('https://www.ibm.com/think/topics/foo', rules).type, 'article');
eq('resolveType domain fallback', PDO.resolveType('https://www.ibm.com/products', rules).type, 'docs');
eq('resolveType no match', PDO.resolveType('https://other.com/', rules), null);

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
console.log('\nAll smoke tests passed.');
