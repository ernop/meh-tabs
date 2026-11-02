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

// Only web pages have a host. moz-extension:, about: and file: tabs are
// hostless, so they sort after websites and never match a domain list.
function extractDomain(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.replace(/^www\./, '');
  } catch (error) {
    return null;
  }
}

// Second-level labels that pair with a 2-letter ccTLD (co.uk, com.au, ...).
// Keeps news.bbc.co.uk under bbc.co.uk instead of the suffix co.uk.
const GENERIC_SECOND_LEVEL = new Set([
  'ac', 'co', 'com', 'edu', 'gob', 'gov', 'govt', 'ltd', 'me', 'mil',
  'ne', 'net', 'or', 'org', 'plc', 'sch',
]);

function compareText(a, b) {
  return (a || '').localeCompare(b || '', undefined, { sensitivity: 'base', numeric: true });
}

// Split example.com / mail.google.com / news.bbc.co.uk into the registrable
// root and the leftover subdomain prefix. www. is already stripped.
function splitHostForSort(hostname) {
  if (!hostname) return { root: '', subdomain: '' };
  const host = hostname.toLowerCase();
  if (host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return { root: host, subdomain: '' };
  }
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) {
    return { root: host, subdomain: '' };
  }
  const useThree =
    labels.length >= 3 &&
    labels[labels.length - 1].length === 2 &&
    GENERIC_SECOND_LEVEL.has(labels[labels.length - 2]);
  const rootLen = useThree ? 3 : 2;
  return {
    root: labels.slice(-rootLen).join('.'),
    subdomain: labels.slice(0, -rootLen).join('.'),
  };
}

function domainMatches(domain, candidate) {
  return domain === candidate || domain.endsWith('.' + candidate);
}

const GMAIL_DOMAINS = ['mail.google.com'];
const CALENDAR_DOMAINS = ['calendar.google.com'];
const AI_CHAT_DOMAINS = ['claude.ai', 'chatgpt.com'];
const X_DOMAINS = ['x.com'];
// Docs, Sheets, Slides and Forms all live here; Drive does not.
const GOOGLE_DOCS_DOMAINS = ['docs.google.com'];

// First match wins. Gmail and Calendar stay in the main window whatever the
// entertainment list says, and the code-defined windows beat that list too.
function classifyTab(tab, entertainmentDomains) {
  const domain = extractDomain(tab.url);
  const matches = candidates => !!domain && candidates.some(c => domainMatches(domain, c));
  if (matches(GMAIL_DOMAINS)) return 'gmail';
  if (matches(CALENDAR_DOMAINS)) return 'calendar';
  if (matches(AI_CHAT_DOMAINS)) return 'aiChats';
  if (matches(X_DOMAINS)) return 'x';
  if (matches(GOOGLE_DOCS_DOMAINS)) return 'googleDocs';
  if (matches(entertainmentDomains)) return 'entertainment';
  return 'regular';
}

// This extension's new tab page ("Your Journey Begins") as Firefox reports
// it, plus Firefox's own new tab and home pages, seen when the override is off.
const NEW_TAB_PAGE_URLS = new Set([
  browserAPI.runtime.getURL('newtab.html'),
  'about:newtab',
  'about:home',
]);

function isNewTabPage(url) {
  return !!url && NEW_TAB_PAGE_URLS.has(url.split(/[?#]/)[0]);
}

// Ids of loaded new tab pages someone is using (window.newTabPage in
// newtab.js). A page Firefox hasn't loaded has no view, so it counts as idle.
function newTabPagesInUse() {
  const inUse = new Set();
  for (const view of browserAPI.extension.getViews({ type: 'tab' })) {
    try {
      const page = view.newTabPage;
      if (page && page.tabId !== null && page.isInUse()) inUse.add(page.tabId);
    } catch (error) {
      console.error('Error checking whether a new tab page is in use:', error);
    }
  }
  return inUse;
}

// Close the new tab pages lying around: every one except the tab Sort was
// started from and any in use. Returns the tabs still open.
async function closeIdleNewTabPages(tabs, startTabId) {
  const inUse = newTabPagesInUse();
  const closed = new Set();
  for (const tab of tabs) {
    if (!isNewTabPage(tab.url) || tab.id === startTabId || inUse.has(tab.id)) continue;
    try {
      await browserAPI.tabs.remove(tab.id);
      closed.add(tab.id);
    } catch (error) {
      console.error(`Error closing new tab page ${tab.id}:`, error);
    }
  }
  if (closed.size > 0) console.log(`Closed ${closed.size} idle new tab pages`);
  return { open: tabs.filter(t => !closed.has(t.id)), closedCount: closed.size };
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

// After the group split, each window is ordered by registrable host
// (google.com), then subdomain (docs / mail), then document title, which keeps
// a site's tabs next to each other. URL is the last tie-break so equal titles
// stay deterministic. Hostless tabs (new tab pages, about:, file:) sort after
// real hosts.
function tabSortComparator(a, b) {
  const hostA = extractDomain(a.url);
  const hostB = extractDomain(b.url);
  if (!hostA !== !hostB) return hostA ? -1 : 1;

  const partsA = splitHostForSort(hostA);
  const partsB = splitHostForSort(hostB);
  const rootResult = compareText(partsA.root, partsB.root);
  if (rootResult !== 0) return rootResult;
  const subdomainResult = compareText(partsA.subdomain, partsB.subdomain);
  if (subdomainResult !== 0) return subdomainResult;
  const titleResult = compareText(a.title, b.title);
  if (titleResult !== 0) return titleResult;
  return compareText(a.url, b.url);
}

// Several Gmail or Calendar tabs order by URL, which puts account /u/0 first.
function urlComparator(a, b) {
  return compareText(a.url, b.url) || compareText(a.title, b.title);
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

async function windowTabIds(windowId) {
  const tabs = await browserAPI.tabs.query({ windowId });
  return tabs.sort((a, b) => a.index - b.index).map(t => t.id);
}

// Gather the main window's tabs, pin Gmail and Calendar, then fill the final
// order left to right. A tab only ever moves left into its slot, so a move
// never disturbs the slots already filled, and tabs already in place stay put.
async function arrangeMainWindow(windowId, pinnedOrder, unpinnedOrder) {
  const ordered = [...pinnedOrder, ...unpinnedOrder];
  for (const tab of ordered) {
    if (tab.windowId === windowId) continue;
    try {
      await moveTabToWindow(tab, windowId, tab.pinned ? 0 : -1);
    } catch (error) {
      console.error(`Error moving tab ${tab.id} to the main window:`, error);
    }
  }
  for (const tab of pinnedOrder) {
    if (tab.pinned) continue;
    try {
      await browserAPI.tabs.update(tab.id, { pinned: true });
    } catch (error) {
      console.error(`Error pinning tab ${tab.id}:`, error);
    }
  }

  let current = await windowTabIds(windowId);
  const present = new Set(current);
  const desired = ordered.map(t => t.id).filter(id => present.has(id));
  for (let i = 0; i < desired.length; i++) {
    if (current[i] === desired[i]) continue;
    let moved = [];
    try {
      moved = await browserAPI.tabs.move([desired[i]], { index: i });
    } catch (error) {
      console.error(`Error moving tab ${desired[i]}:`, error);
    }
    // An empty result means Firefox refused the move (pin boundary).
    if (moved.length === 0) {
      current = await windowTabIds(windowId);
      continue;
    }
    current.splice(current.indexOf(desired[i]), 1);
    current.splice(i, 0, desired[i]);
  }
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

// Sorts every normal window's tabs. The window Sort was started from is the
// main window: pinned Gmail, then pinned Calendar, then the other regular tabs.
// AI chats, X, Google Docs and entertainment (minimized) get windows of their
// own. Popup windows, such as a Gmail compose popout, are left alone.
async function sortTabsAlphabetically(entertainmentDomains = [], startTab = null) {
  try {
    const mainWindowId = startTab
      ? startTab.windowId
      : (await browserAPI.windows.getCurrent()).id;
    const allTabs = await browserAPI.tabs.query({ windowType: 'normal' });
    const { open, closedCount: newTabsClosed } =
      await closeIdleNewTabPages(allTabs, startTab ? startTab.id : null);
    // New tab pages still open are in use and share one URL; keep them all.
    const newTabPages = open.filter(t => isNewTabPage(t.url));
    const otherTabs = open.filter(t => !isNewTabPage(t.url));
    const uniqueTabs = await deduplicateTabs(otherTabs);
    const duplicatesClosed = otherTabs.length - uniqueTabs.length;
    const tabs = [...uniqueTabs, ...newTabPages];
    const managedIds = new Set(tabs.map(t => t.id));

    const groupedTabs = {
      gmail: [],
      calendar: [],
      aiChats: [],
      x: [],
      googleDocs: [],
      entertainment: [],
      regular: [],
    };
    for (const tab of tabs) {
      groupedTabs[classifyTab(tab, entertainmentDomains)].push(tab);
    }

    const gmail = [...groupedTabs.gmail].sort(urlComparator);
    const calendar = [...groupedTabs.calendar].sort(urlComparator);
    const regular = splitPinned(groupedTabs.regular);
    const entertainment = splitPinned(groupedTabs.entertainment);
    const aiChats = splitPinned(groupedTabs.aiChats);
    const x = splitPinned(groupedTabs.x);
    const googleDocs = splitPinned(groupedTabs.googleDocs);

    const mainPinned = [...gmail, ...calendar, ...regular.pinned];
    const mainTabs = [...mainPinned, ...regular.unpinned];

    console.log(
      `Sorting: ${gmail.length} Gmail, ${calendar.length} Calendar, ` +
      `${regular.ordered.length} regular, ` +
      `${entertainment.ordered.length} entertainment, ` +
      `${aiChats.ordered.length} AI chat, ${x.ordered.length} X, ` +
      `${googleDocs.ordered.length} Google Docs tabs`
    );

    // Park one main-window tab there before extracting the other groups, so
    // emptying the window can't close it.
    if (mainTabs.length > 0 && !mainTabs.some(t => t.windowId === mainWindowId)) {
      const park = mainTabs[0];
      try {
        await moveTabToWindow(park, mainWindowId, park.pinned ? 0 : -1);
        park.windowId = mainWindowId;
      } catch (error) {
        console.error('Error parking a tab in the main window:', error);
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

    let googleDocsWindowId = null;
    if (googleDocs.ordered.length > 0) {
      googleDocsWindowId = await adoptTabsIntoNewWindow(googleDocs.ordered);
    }

    await arrangeMainWindow(mainWindowId, mainPinned, regular.unpinned);

    await closeAbandonedWindows(
      managedIds,
      [mainWindowId, entertainmentWindowId, aiChatWindowId, xWindowId, googleDocsWindowId]
    );

    // Each new window took focus as it opened; hand it back.
    try {
      await browserAPI.windows.update(mainWindowId, { focused: true });
    } catch (error) {
      console.error('Error focusing the main window:', error);
    }

    console.log(
      `Sorting complete! ${duplicatesClosed} duplicates and ` +
      `${newTabsClosed} new tab pages closed.`
    );
    return {
      success: true,
      tabCount: tabs.length,
      duplicatesClosed: duplicatesClosed,
      newTabsClosed: newTabsClosed,
      regularCount: mainTabs.length,
      entertainmentCount: entertainment.ordered.length,
      aiChatCount: aiChats.ordered.length,
      xCount: x.ordered.length,
      googleDocsCount: googleDocs.ordered.length
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
    sortTabsAlphabetically(request.entertainmentDomains || [], sender.tab || null).then(result => {
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
  browserAPI.browserAction.onClicked.addListener(async (tab) => {
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
      const result = await sortTabsAlphabetically(config.entertainmentDomains, tab);
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