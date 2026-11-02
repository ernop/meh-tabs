// Test-only background script: tests/sort-tabs/run.py adds it to a copy of the
// extension. It lays out tabs, runs Sort the two ways the user does, and POSTs
// the windows before and after to run.py. Web tabs are created discarded, so
// none of them loads.
const HARNESS_RESULT_URL = 'http://127.0.0.1:__RESULT_PORT__/result';
const HARNESS_NEW_TAB = browserAPI.runtime.getURL('newtab.html');

async function harnessSnapshot() {
  const windows = await browserAPI.windows.getAll({ populate: true });
  return windows.map(w => ({
    id: w.id,
    type: w.type,
    state: w.state,
    focused: w.focused,
    tabs: w.tabs
      .sort((a, b) => a.index - b.index)
      .map(t => ({ id: t.id, url: t.url, pinned: t.pinned, active: t.active })),
  }));
}

async function harnessWebTab(windowId, url, title, pinned = false) {
  const tab = await browserAPI.tabs.create({ windowId, url, title, discarded: true, active: false });
  if (pinned) await browserAPI.tabs.update(tab.id, { pinned: true });
  return tab;
}

function harnessView(tabId) {
  return browserAPI.extension.getViews({ type: 'tab' }).find(view =>
    view.newTabPage && view.newTabPage.tabId === tabId && view.document.readyState === 'complete');
}

async function harnessWaitFor(check, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const harnessLoadedView = tabId => harnessWaitFor(() => harnessView(tabId), `new tab page ${tabId}`);
const harnessLastAccessed = async tabId => (await browserAPI.tabs.get(tabId)).lastAccessed;

async function harnessRun() {
  const result = { newTabUrl: HARNESS_NEW_TAB, notes: [], ids: {} };
  const initialWindows = await browserAPI.windows.getAll();

  // Window A, where Sort is clicked: the start page first, then a page opened
  // the way Ctrl+T opens one, left idle.
  const winA = await browserAPI.windows.create({ url: HARNESS_NEW_TAB });
  const startTab = winA.tabs[0];
  await harnessWebTab(winA.id, 'https://example.com/a', 'Example A');
  await harnessWebTab(winA.id, 'https://mail.google.com/mail/u/1/#inbox', 'Inbox - second - Gmail');
  await harnessWebTab(winA.id, 'https://github.com/example', 'example - GitHub', true);
  await harnessWebTab(winA.id, 'https://docs.google.com/document/d/doc1/edit', 'Doc One - Google Docs');
  await harnessWebTab(winA.id, 'https://claude.ai/chat/abc', 'A chat - Claude');
  const idleTab = await browserAPI.tabs.create({ windowId: winA.id, active: false });

  // Window B: a new tab page in use (stopwatch started) and the rest.
  const winB = await browserAPI.windows.create({ url: HARNESS_NEW_TAB });
  const busyTab = winB.tabs[0];
  await harnessWebTab(winB.id, 'https://calendar.google.com/calendar/u/0/r/week', 'Google Calendar - Week');
  await harnessWebTab(winB.id, 'https://mail.google.com/mail/u/0/#inbox', 'Inbox - Gmail', true);
  await harnessWebTab(winB.id, 'https://docs.google.com/spreadsheets/d/sheet2/edit', 'Sheet Two - Google Sheets');
  await harnessWebTab(winB.id, 'https://x.com/home', 'Home / X');
  const duplicate = await harnessWebTab(winB.id, 'https://example.com/a', 'Example A');
  await harnessWebTab(winB.id, 'https://news.ycombinator.com/item?id=1', 'An item | Hacker News');
  await harnessWebTab(winB.id, 'https://www.google.com/search?q=test', 'test - Google Search');
  await harnessWebTab(winB.id, 'https://calendar.google.com/calendar/u/0/r/day', 'Google Calendar - Day');
  let pendingTab = null;
  try {
    pendingTab = await browserAPI.tabs.create({
      windowId: winB.id, url: HARNESS_NEW_TAB, discarded: true, active: false,
    });
  } catch (error) {
    result.notes.push(`A discarded new tab page could not be created: ${error.message}`);
  }

  // A Gmail compose popout, which Sort must leave where it is.
  const popup = await browserAPI.windows.create({
    type: 'popup', url: 'https://mail.google.com/mail/u/0/?view=cm&fs=1',
  });

  for (const win of initialWindows) await browserAPI.windows.remove(win.id);

  const startView = await harnessLoadedView(startTab.id);
  const busyView = await harnessLoadedView(busyTab.id);
  await harnessLoadedView(idleTab.id);
  busyView.document.getElementById('start-stopwatch').click();

  result.ids = {
    winA: winA.id, popup: popup.id, startTab: startTab.id, busyTab: busyTab.id,
    idleTab: idleTab.id, pendingTab: pendingTab && pendingTab.id, duplicate: duplicate.id,
  };
  result.idleTabUrl = (await browserAPI.tabs.get(idleTab.id)).url;
  result.startInUseBefore = startView.newTabPage.isInUse();
  result.busyInUseBefore = busyView.newTabPage.isInUse();
  result.before = await harnessSnapshot();

  // 1. Click Sort on the start page.
  const button = startView.document.getElementById('sort-tabs');
  button.click();
  result.buttonText = await harnessWaitFor(() => {
    const text = button.textContent;
    return text.startsWith('Sorted') || text.startsWith('Sort Failed') ? text : null;
  }, 'the Sort button');
  result.afterButton = await harnessSnapshot();
  const busyViewAfter = harnessView(busyTab.id);
  result.busyInUseAfter = !!busyViewAfter && busyViewAfter.newTabPage.isInUse();

  // Do Sort's moves change Firefox's lastAccessed? Probes: an unloaded tab,
  // a loaded one (an error page, as the proxy is closed), and a tab that
  // seeds a new window the way Sort makes the group windows.
  const unloaded = await harnessWebTab(winA.id, 'https://example.org/unloaded', 'Unloaded');
  const loaded = await browserAPI.tabs.create({
    windowId: winA.id, url: 'https://example.org/loaded', active: false,
  });
  const seed = await harnessWebTab(winA.id, 'https://example.org/seed', 'Seed');
  await harnessWaitFor(async () => (await browserAPI.tabs.get(loaded.id)).status === 'complete',
    'the loaded probe');
  const probeWindow = await browserAPI.windows.create({ url: 'https://example.net/' });
  const probes = { unloaded: unloaded.id, loaded: loaded.id, seed: seed.id };
  const before = {};
  for (const [name, id] of Object.entries(probes)) before[name] = await harnessLastAccessed(id);
  await sleep(1500);
  await browserAPI.tabs.move([unloaded.id, loaded.id], { index: 0 });
  const sameWindow = {
    unloaded: await harnessLastAccessed(unloaded.id),
    loaded: await harnessLastAccessed(loaded.id),
  };
  await sleep(1500);
  await browserAPI.tabs.move([unloaded.id, loaded.id], { windowId: probeWindow.id, index: -1 });
  const seedWindow = await browserAPI.windows.create({ tabId: seed.id });
  const otherWindow = {};
  for (const [name, id] of Object.entries(probes)) otherWindow[name] = await harnessLastAccessed(id);
  result.lastAccessed = { before, sameWindow, otherWindow };
  await browserAPI.windows.remove(probeWindow.id);
  await browserAPI.windows.remove(seedWindow.id);

  // 2. Sort again as the toolbar button does, with Gmail the active tab.
  const [gmailTab] = await browserAPI.tabs.query({
    windowId: winA.id, url: 'https://mail.google.com/mail/u/0/*',
  });
  await browserAPI.tabs.update(gmailTab.id, { active: true });
  const idleTab2 = await browserAPI.tabs.create({ windowId: winA.id, active: false });
  await harnessLoadedView(idleTab2.id);
  await harnessWebTab(winA.id, 'https://www.youtube.com/watch?v=abc', 'Video - YouTube');
  await harnessWebTab(winA.id, 'https://claude.ai/chat/def', 'Pinned chat - Claude', true);
  result.ids.gmailTab = gmailTab.id;
  result.ids.idleTab2 = idleTab2.id;
  result.toolbarResponse = await sortTabsAlphabetically(
    ['youtube.com'], await browserAPI.tabs.get(gmailTab.id));
  result.afterToolbar = await harnessSnapshot();
  return result;
}

setTimeout(async () => {
  let result;
  try {
    result = await harnessRun();
  } catch (error) {
    result = { error: String(error), stack: error.stack };
  }
  await fetch(HARNESS_RESULT_URL, { method: 'POST', body: JSON.stringify(result) });
}, 2000);
