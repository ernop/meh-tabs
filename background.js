// background.js
// This file runs in the background with full extension privileges
// It does NOT have access to any DOM - it's not a web page

// Use the browser API
const browserAPI = browser || chrome;

// Helper function to get a canonical URL for deduplication
// Strips trailing slashes, normalizes some patterns
function getCanonicalUrl(url) {
  if (!url) return '';
  let canonical = url.toLowerCase();
  // Remove trailing slashes (but keep single slash for root paths)
  canonical = canonical.replace(/\/+$/, '');
  // Normalize www prefix
  canonical = canonical.replace(/^(https?:\/\/)www\./, '$1');
  return canonical;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (error) {
    return null;
  }
}

// Deduplicate tabs by URL - closes duplicates, keeps the first occurrence.
// Pinned tabs win the URL slot so we don't close the pin and leave a copy.
async function deduplicateTabs(tabs) {
  const seen = new Map(); // canonical URL -> kept tab
  const duplicatesToClose = [];
  const pinnedFirst = [...tabs.filter(t => t.pinned), ...tabs.filter(t => !t.pinned)];

  for (const tab of pinnedFirst) {
    const canonical = getCanonicalUrl(tab.url);

    if (seen.has(canonical)) {
      duplicatesToClose.push(tab);
    } else {
      seen.set(canonical, tab);
    }
  }
  
  // Close duplicate tabs
  if (duplicatesToClose.length > 0) {
    console.log(`Closing ${duplicatesToClose.length} duplicate tabs`);
    for (const tab of duplicatesToClose) {
      try {
        await browserAPI.tabs.remove(tab.id);
        console.log(`Closed duplicate: ${tab.url}`);
      } catch (error) {
        console.error(`Error closing duplicate tab ${tab.id}:`, error);
      }
    }
  }
  
  // Return the unique tabs
  return Array.from(seen.values());
}

// Shared priority config used by sorting
const megaPriority = [
  'mail.google.com',
  'calendar.google.com', 
  'docs.google.com',
  'maps.google.com',
  'www.google.com/maps',
  'photos.google.com',
  'chatgpt.com',
  'claude.ai',
  'ebay.com',
  'youtube.com',	  
];

const getMegaPriority = (url) => {
  if (!url) return -1;
  for (let i = 0; i < megaPriority.length; i++) {
    if (url.includes(megaPriority[i])) {
      return i;
    }
  }
  return -1;
};

// Check if URL is a file:// URL
const isFileUrl = (url) => {
  return url && url.toLowerCase().startsWith('file://');
};

// Sort comparator for tabs
// Priority order: mega-priority sites > file:// URLs > regular URLs
// Within each group: audio tabs first, then alphabetically
function tabSortComparator(a, b) {
  let urlA = (a.url || '').toLowerCase();
  let urlB = (b.url || '').toLowerCase();
  
  const priorityA = getMegaPriority(urlA);
  const priorityB = getMegaPriority(urlB);
  
  // If either has mega-priority, sort by priority
  if (priorityA !== -1 || priorityB !== -1) {
    // If only one has priority, it goes first
    if (priorityA === -1) return 1;
    if (priorityB === -1) return -1;
    // If both have priority, sort by priority order first
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    // Same priority level - check audio status
    if (a.audible !== b.audible) {
      return a.audible ? -1 : 1; // Audio tabs first
    }
    // Same priority and audio status - sort alphabetically
    urlA = urlA.replace(/^(https?:\/\/)www\./, '$1');
    urlB = urlB.replace(/^(https?:\/\/)www\./, '$1');
    if (urlA < urlB) return -1;
    if (urlA > urlB) return 1;
    return 0;
  }
  
  // Check for file:// URLs - they go after mega-priority but before regular URLs
  const fileA = isFileUrl(urlA);
  const fileB = isFileUrl(urlB);
  
  if (fileA !== fileB) {
    return fileA ? -1 : 1; // file:// URLs come first
  }
  
  // Both are regular tabs (no mega-priority, same file:// status)
  // First check audio status
  if (a.audible !== b.audible) {
    return a.audible ? -1 : 1; // Audio tabs first
  }
  
  // Same audio status - sort alphabetically
  // Strip leading www. from URLs for sorting purposes
  urlA = urlA.replace(/^(https?:\/\/)www\./, '$1');
  urlB = urlB.replace(/^(https?:\/\/)www\./, '$1');
  
  if (urlA < urlB) return -1;
  if (urlA > urlB) return 1;
  return 0;
}

// Firefox keeps pinned tabs at indices 0..n-1 and rejects moves that would
// put an unpinned tab in front of them — or a pinned tab after unpinned ones.
// Sort each group on its own, pins first.
function splitPinned(tabs) {
  const pinned = tabs.filter(t => t.pinned);
  const unpinned = tabs.filter(t => !t.pinned);
  pinned.sort(tabSortComparator);
  unpinned.sort(tabSortComparator);
  return { pinned, unpinned, ordered: [...pinned, ...unpinned] };
}

// Move one tab, restoring pin state. Firefox sometimes refuses a cross-window
// move while the tab is pinned; unpin, move, re-pin in that case.
async function moveTabToWindow(tab, windowId, index) {
  const wasPinned = !!tab.pinned;
  try {
    await browserAPI.tabs.move(tab.id, { windowId, index });
  } catch (error) {
    if (!wasPinned) throw error;
    await browserAPI.tabs.update(tab.id, { pinned: false });
    await browserAPI.tabs.move(tab.id, { windowId, index });
  }
  if (wasPinned) {
    const current = await browserAPI.tabs.get(tab.id);
    if (!current.pinned) {
      await browserAPI.tabs.update(tab.id, { pinned: true });
    }
  }
  await sleep(15);
}

async function moveTabsToWindow(tabs, windowId, startIndex) {
  for (let i = 0; i < tabs.length; i++) {
    try {
      await moveTabToWindow(tabs[i], windowId, startIndex + i);
    } catch (error) {
      console.error(`Error moving tab ${tabs[i].id}:`, error);
    }
  }
}

// Seed a window with the first tab (pinned ones first), then move the rest.
async function adoptTabsIntoNewWindow(tabs) {
  if (tabs.length === 0) return null;
  const first = tabs[0];
  let newWindow;
  try {
    newWindow = await browserAPI.windows.create({ tabId: first.id });
  } catch (error) {
    if (!first.pinned) throw error;
    await browserAPI.tabs.update(first.id, { pinned: false });
    newWindow = await browserAPI.windows.create({ tabId: first.id });
  }
  if (first.pinned) {
    await browserAPI.tabs.update(first.id, { pinned: true });
  }
  for (let i = 1; i < tabs.length; i++) {
    try {
      await moveTabToWindow(tabs[i], newWindow.id, i);
    } catch (error) {
      console.error(`Error moving tab ${tabs[i].id}:`, error);
    }
  }
  return newWindow.id;
}

// After a sort, other windows often keep a Firefox-created about:newtab (the
// API almost never reports tabs.length === 0). Close those, but never a window
// that still holds a tab we meant to keep (e.g. a pin we failed to move).
async function closeAbandonedWindows(managedTabIds, keepWindowIds) {
  const keep = new Set(keepWindowIds.filter(Boolean));
  const allWindows = await browserAPI.windows.getAll({ populate: true, windowTypes: ['normal'] });
  for (const win of allWindows) {
    if (keep.has(win.id)) continue;
    const leftoverManaged = win.tabs.filter(t => managedTabIds.has(t.id));
    if (leftoverManaged.length > 0) continue;
    try {
      await browserAPI.windows.remove(win.id);
      console.log(`Closed leftover window ${win.id}`);
    } catch (error) {
      console.error(`Error closing leftover window ${win.id}:`, error);
    }
  }
}

// Consolidates ALL tabs from ALL windows into two windows:
// - Main window: non-entertainment tabs (pinned strip first, then the rest)
// - Entertainment window: entertainment tabs (minimized; same pin rule)
async function sortTabsAlphabetically(entertainmentDomains = []) {
  try {
    const allTabs = await browserAPI.tabs.query({});
    const tabs = await deduplicateTabs(allTabs);
    const duplicatesClosed = allTabs.length - tabs.length;
    const managedIds = new Set(tabs.map(t => t.id));

    const isEntertainment = (tab) => {
      if (entertainmentDomains.length === 0) return false;
      const domain = extractDomain(tab.url);
      if (!domain) return false;
      return entertainmentDomains.some(entertainmentDomain => {
        if (domain === entertainmentDomain) return true;
        if (domain.endsWith('.' + entertainmentDomain)) return true;
        return false;
      });
    };

    const regular = splitPinned(tabs.filter(tab => !isEntertainment(tab)));
    const entertainment = splitPinned(tabs.filter(tab => isEntertainment(tab)));

    console.log(`Sorting: ${regular.ordered.length} regular tabs (${regular.pinned.length} pinned), ${entertainment.ordered.length} entertainment tabs (${entertainment.pinned.length} pinned)`);

    const currentWindow = await browserAPI.windows.getCurrent();
    const mainWindowId = currentWindow.id;

    // If the current window is all entertainment (including pins), moving those
    // out first would close it. Park one regular tab so the window stays.
    const regularInMain = regular.ordered.some(t => t.windowId === mainWindowId);
    if (!regularInMain && regular.ordered.length > 0) {
      const park = regular.ordered[0];
      try {
        await moveTabToWindow(park, mainWindowId, park.pinned ? 0 : -1);
      } catch (error) {
        console.error('Error parking a regular tab in the main window:', error);
      }
    }

    // Entertainment (pins included) out first so they don't occupy the main
    // window's pin strip and block reordering there.
    let entertainmentWindowId = null;
    if (entertainment.ordered.length > 0) {
      entertainmentWindowId = await adoptTabsIntoNewWindow(entertainment.ordered);
      try {
        await browserAPI.windows.update(entertainmentWindowId, { state: 'minimized' });
        console.log(`Minimized entertainment window ${entertainmentWindowId}`);
      } catch (error) {
        console.error('Error minimizing entertainment window:', error);
      }
    }

    await moveTabsToWindow(regular.pinned, mainWindowId, 0);
    await moveTabsToWindow(regular.unpinned, mainWindowId, regular.pinned.length);

    await closeAbandonedWindows(managedIds, [mainWindowId, entertainmentWindowId]);

    console.log(`Sorting complete! ${duplicatesClosed} duplicates closed.`);
    return {
      success: true,
      tabCount: tabs.length,
      duplicatesClosed: duplicatesClosed,
      regularCount: regular.ordered.length,
      entertainmentCount: entertainment.ordered.length
    };

  } catch (error) {
    console.error('Error sorting tabs:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// GITHUB CONTRIBUTION MONITOR
// Fetches public contribution counts for a watched set of usernames from the
// jogruber contributions API (no auth; returns the same numbers GitHub renders
// on the profile calendar).
//
// WHY this lives here and not in newtab.js: the new tab page opens constantly,
// so fetching there would hit the API once per watched user PER TAB OPEN. This
// script is the single fetch path, driven by a chrome.alarms timer, and writes
// results to storage.local. Every new tab only READS that cache. So API load is
// fixed at (watched users x 24h/GH_REFRESH_HOURS) per day, independent of how
// many tabs get opened.
// ============================================================================
const GH_CACHE_KEY = 'githubContrib';
const GH_ALARM = 'github-refresh';
const GH_REFRESH_HOURS = 6; // timer cadence; contribution totals move at most daily
const GH_STALE_MS = GH_REFRESH_HOURS * 60 * 60 * 1000; // only refetch entries older than this
const GH_API = 'https://github-contributions-api.jogruber.de/v4/';

// Coalesce concurrent refreshes: opening several new tabs on a cold cache fires
// several refresh messages at once, but they share this one in-flight promise.
let ghRefreshInFlight = null;

// Resolve the watch list from the single source of truth: the Caddy-served
// config (home.localhost/newtab-config.json), the same file the tab reads and
// writes. No storage copy -- the watch list rides along with the rest of the
// config by git. If Caddy is down there's simply nothing to fetch this cycle.
async function ghGetWatchList() {
  try {
    const res = await fetch('http://home.localhost/newtab-config.json', { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (Array.isArray(cfg.githubWatch)) return cfg.githubWatch;
    }
  } catch (e) { /* Caddy not reachable this cycle */ }
  return [];
}

async function ghFetchUser(username) {
  // ?y=last -> trailing 365 days, which is the "recent contributions" number.
  const res = await fetch(`${GH_API}${encodeURIComponent(username)}?y=last`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { lastYear: (data.total && data.total.lastYear) || 0, fetchedAt: Date.now(), ok: true };
}

async function ghRefresh(force = false) {
  if (ghRefreshInFlight) return ghRefreshInFlight;
  ghRefreshInFlight = (async () => {
    const watch = await ghGetWatchList();
    const stored = (await browserAPI.storage.local.get(GH_CACHE_KEY))[GH_CACHE_KEY] || { users: {} };
    const users = { ...stored.users };
    const now = Date.now();
    for (const name of watch) {
      const prev = users[name];
      const fresh = prev && prev.ok && (now - prev.fetchedAt) < GH_STALE_MS;
      if (!force && fresh) continue; // skip still-fresh entries -> no needless request
      try {
        users[name] = await ghFetchUser(name);
      } catch (err) {
        users[name] = { ok: false, error: String(err.message || err), fetchedAt: now };
      }
      await new Promise(r => setTimeout(r, 200)); // gentle pacing between users
    }
    // Forget anyone dropped from the watch list.
    for (const name of Object.keys(users)) {
      if (!watch.includes(name)) delete users[name];
    }
    const payload = { users, updatedAt: now };
    await browserAPI.storage.local.set({ [GH_CACHE_KEY]: payload });
    return payload;
  })();
  try {
    return await ghRefreshInFlight;
  } finally {
    ghRefreshInFlight = null;
  }
}

// alarms.create with the same name just resets the schedule, so this is safe to
// call whenever the event page spins up.
function ghEnsureAlarm() {
  if (browserAPI.alarms) browserAPI.alarms.create(GH_ALARM, { periodInMinutes: GH_REFRESH_HOURS * 60 });
}
if (browserAPI.alarms && browserAPI.alarms.onAlarm) {
  browserAPI.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === GH_ALARM) ghRefresh(false);
  });
}
if (browserAPI.runtime.onInstalled) {
  browserAPI.runtime.onInstalled.addListener(() => { ghEnsureAlarm(); ghRefresh(false); });
}
if (browserAPI.runtime.onStartup) {
  browserAPI.runtime.onStartup.addListener(() => { ghEnsureAlarm(); ghRefresh(false); });
}
ghEnsureAlarm(); // NOTE: only (re)arm the timer here -- do NOT refresh on every
                 // event-page wake, or a message-triggered wake would refetch.

// IMPORTANT: Set up message listener to receive requests from newtab.js
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === 'sortTabs') {
    console.log('Sort tabs action requested with entertainment domains:', request.entertainmentDomains);
    
    // Call the sort function and send response back
    sortTabsAlphabetically(request.entertainmentDomains || []).then(result => {
      console.log('Sending result back:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('Error in message handler:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // IMPORTANT: Return true to indicate we'll send a response asynchronously
    return true;
  }

  if (request.action === 'refreshGithub') {
    // force:true bypasses the per-user staleness guard (used by the Refresh button).
    ghRefresh(!!request.force)
      .then(payload => sendResponse({ success: true, data: payload }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Optional: Add toolbar button handler
if (browserAPI.browserAction && browserAPI.browserAction.onClicked) {
  browserAPI.browserAction.onClicked.addListener(() => {
    console.log('Toolbar button clicked');
    sortTabsAlphabetically();
  });
  console.log('Toolbar button handler registered');
}

console.log('Background script fully loaded and ready!');