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

function domainMatches(domain, candidate) {
  return domain === candidate || domain.endsWith('.' + candidate);
}

const AI_CHAT_DOMAINS = ['claude.ai', 'chatgpt.com'];
const X_DOMAINS = ['x.com'];

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

// Titles are what Firefox displays in the tab strip. URL breaks ties so the
// result remains deterministic when several pages have the same title.
function tabSortComparator(a, b) {
  const titleResult = (a.title || '').localeCompare(
    b.title || '',
    undefined,
    { sensitivity: 'base', numeric: true }
  );
  if (titleResult !== 0) return titleResult;
  return (a.url || '').localeCompare(b.url || '', undefined, { sensitivity: 'base' });
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

// Consolidates all tabs into four groups. AI chat and X are code-defined groups
// and take precedence over the user-maintained entertainment domain list.
async function sortTabsAlphabetically(entertainmentDomains = []) {
  try {
    const allTabs = await browserAPI.tabs.query({});
    const tabs = await deduplicateTabs(allTabs);
    const duplicatesClosed = allTabs.length - tabs.length;
    const managedIds = new Set(tabs.map(t => t.id));

    const matchesAnyDomain = (tab, domains) => {
      const domain = extractDomain(tab.url);
      if (!domain) return false;
      return domains.some(candidate => domainMatches(domain, candidate));
    };

    const groupedTabs = {
      aiChats: [],
      x: [],
      entertainment: [],
      regular: [],
    };
    for (const tab of tabs) {
      if (matchesAnyDomain(tab, AI_CHAT_DOMAINS)) {
        groupedTabs.aiChats.push(tab);
      } else if (matchesAnyDomain(tab, X_DOMAINS)) {
        groupedTabs.x.push(tab);
      } else if (matchesAnyDomain(tab, entertainmentDomains)) {
        groupedTabs.entertainment.push(tab);
      } else {
        groupedTabs.regular.push(tab);
      }
    }

    const regular = splitPinned(groupedTabs.regular);
    const entertainment = splitPinned(groupedTabs.entertainment);
    const aiChats = splitPinned(groupedTabs.aiChats);
    const x = splitPinned(groupedTabs.x);

    console.log(
      `Sorting: ${regular.ordered.length} regular, ` +
      `${entertainment.ordered.length} entertainment, ` +
      `${aiChats.ordered.length} AI chat, ${x.ordered.length} X tabs`
    );

    const currentWindow = await browserAPI.windows.getCurrent();
    const mainWindowId = currentWindow.id;

    // Park one regular tab in the main window before extracting the other groups.
    const regularInMain = regular.ordered.some(t => t.windowId === mainWindowId);
    if (!regularInMain && regular.ordered.length > 0) {
      const park = regular.ordered[0];
      try {
        await moveTabToWindow(park, mainWindowId, park.pinned ? 0 : -1);
      } catch (error) {
        console.error('Error parking a regular tab in the main window:', error);
      }
    }

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

    let aiChatWindowId = null;
    if (aiChats.ordered.length > 0) {
      aiChatWindowId = await adoptTabsIntoNewWindow(aiChats.ordered);
    }

    let xWindowId = null;
    if (x.ordered.length > 0) {
      xWindowId = await adoptTabsIntoNewWindow(x.ordered);
    }

    await moveTabsToWindow(regular.pinned, mainWindowId, 0);
    await moveTabsToWindow(regular.unpinned, mainWindowId, regular.pinned.length);

    await closeAbandonedWindows(
      managedIds,
      [mainWindowId, entertainmentWindowId, aiChatWindowId, xWindowId]
    );

    console.log(`Sorting complete! ${duplicatesClosed} duplicates closed.`);
    return {
      success: true,
      tabCount: tabs.length,
      duplicatesClosed: duplicatesClosed,
      regularCount: regular.ordered.length,
      entertainmentCount: entertainment.ordered.length,
      aiChatCount: aiChats.ordered.length,
      xCount: x.ordered.length
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

if (browserAPI.browserAction && browserAPI.browserAction.onClicked) {
  browserAPI.browserAction.onClicked.addListener(async () => {
    console.log('Toolbar button clicked');
    try {
      const response = await fetch(
        'http://home.localhost/newtab-config.json',
        { cache: 'no-store' }
      );
      if (!response.ok) {
        throw new Error(`newtab-config.json ${response.status}`);
      }
      const config = await response.json();
      if (!Array.isArray(config.entertainmentDomains)) {
        throw new Error('newtab-config.json missing entertainmentDomains');
      }
      const result = await sortTabsAlphabetically(config.entertainmentDomains);
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Toolbar tab sort failed:', error);
    }
  });
  console.log('Toolbar button handler registered');
}

console.log('Background script fully loaded and ready!');