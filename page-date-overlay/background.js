/* Background script for page-date-overlay.
 * - Handles Wayback and HEAD requests initiated by the content script.
 * - Forwards keyboard commands to the active tab's content script.
 * - Opens the dashboard when the browser action is clicked (falls back if popup fails).
 */
try { importScripts('common/url.js', 'common/storage.js'); } catch (_) { /* MV2 non-worker: ignored */ }

const browserAPI = self.browser || self.chrome;

function pad2(n) { return String(n).padStart(2, '0'); }

function waybackRawToIso(raw) {
  // Wayback timestamps: YYYYMMDDhhmmss
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

async function waybackEarliest(url) {
  try {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=19960101`;
    const resp = await fetch(api, { method: 'GET' });
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
    const data = await resp.json();
    const snap = data && data.archived_snapshots && data.archived_snapshots.closest;
    if (!snap || !snap.timestamp) return { success: true, earliestDate: null };
    const iso = waybackRawToIso(snap.timestamp);
    return { success: true, earliestRaw: snap.timestamp, earliestDate: iso, waybackUrl: snap.url || null };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function headLastModified(url) {
  try {
    let resp;
    try {
      resp = await fetch(url, { method: 'HEAD', credentials: 'omit', redirect: 'follow' });
    } catch (_) {
      resp = await fetch(url, { method: 'GET', credentials: 'omit', redirect: 'follow' });
    }
    if (!resp.ok && resp.status !== 0) return { success: false, error: `HTTP ${resp.status}` };
    const raw = resp.headers.get('last-modified');
    if (!raw) return { success: true, lastModifiedDate: null };
    const d = new Date(raw);
    if (isNaN(d.getTime())) return { success: true, lastModifiedRaw: raw, lastModifiedDate: null };
    const iso = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    return { success: true, lastModifiedRaw: raw, lastModifiedDate: iso };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return;

  if (request.action === 'wayback') {
    waybackEarliest(request.url).then(sendResponse);
    return true;
  }

  if (request.action === 'head') {
    headLastModified(request.url).then(sendResponse);
    return true;
  }
});

if (browserAPI.commands && browserAPI.commands.onCommand) {
  browserAPI.commands.onCommand.addListener(async (command) => {
    try {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab) return;
      await browserAPI.tabs.sendMessage(tab.id, { command });
    } catch (e) {
      console.warn('[PDO bg] command forward failed', e);
    }
  });
}

if (browserAPI.browserAction && browserAPI.browserAction.onClicked) {
  browserAPI.browserAction.onClicked.addListener(async () => {
    const url = browserAPI.runtime.getURL('newtab/index.html');
    await browserAPI.tabs.create({ url });
  });
}

console.log('[PDO bg] ready');
