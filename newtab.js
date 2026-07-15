const browser = window.browser || window.chrome;

function setAppVersion() {
  const versionEl = document.getElementById('app-version');
  if (!versionEl) return;

  try {
    const manifest =
      browser &&
      browser.runtime &&
      typeof browser.runtime.getManifest === 'function'
        ? browser.runtime.getManifest()
        : null;

    versionEl.textContent = manifest && manifest.version ? `(v${manifest.version})` : '';
  } catch (e) {
    versionEl.textContent = '';
  }
}

// ============================================================================
// CONFIG MANAGER - Handles localStorage-based config with edit capabilities
// ============================================================================
class ConfigManager {
  constructor() {
    this.browserAPI = window.browser || window.chrome;
    this.storageKey = 'pageConfig';
    this.config = null;
    this.editMode = false;
    this.onConfigChange = null; // callback when config changes
  }

  async init() {
    await this.loadConfig();
    this.setupEditToggle();
    this.setupExportButton();
    this.setupImportButton();
  }

  async loadConfig() {
    try {
      // Try localStorage first (user customizations take priority)
      const result = await this.browserAPI.storage.local.get(this.storageKey);
      if (result[this.storageKey]) {
        this.config = result[this.storageKey];
        console.log('Loaded config from localStorage');
        return;
      }
    } catch (e) {
      console.log('localStorage not available, falling back to file');
    }

    // Fall back to file-based config
    try {
      const personalConfigUrl = this.browserAPI.runtime.getURL('personal-config.json');
      const response = await fetch(personalConfigUrl);
      if (response.ok) {
        this.config = await response.json();
        console.log('Loaded personal-config.json');
        return;
      }
    } catch (e) {
      console.log('personal-config.json not found');
    }

    try {
      const linksUrl = this.browserAPI.runtime.getURL('links.json');
      const response = await fetch(linksUrl);
      this.config = await response.json();
      console.log('Loaded links.json');
    } catch (e) {
      console.error('Failed to load any config');
      this.config = { categories: [] };
    }
  }

  async saveConfig() {
    try {
      await this.browserAPI.storage.local.set({ [this.storageKey]: this.config });
      console.log('Config saved to localStorage');
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  getCategories() {
    return (this.config.categories || []).sort((a, b) => a.order - b.order);
  }

  // Category operations
  addCategory(name, emoji = '') {
    const maxOrder = Math.max(0, ...this.config.categories.map(c => c.order || 0));
    this.config.categories.push({
      name,
      emoji,
      order: maxOrder + 1,
      links: []
    });
    this.saveConfig();
    if (this.onConfigChange) this.onConfigChange();
  }

  removeCategory(categoryName) {
    this.config.categories = this.config.categories.filter(c => c.name !== categoryName);
    this.saveConfig();
    if (this.onConfigChange) this.onConfigChange();
  }

  renameCategory(oldName, newName) {
    const cat = this.config.categories.find(c => c.name === oldName);
    if (cat) {
      cat.name = newName;
      cat.links.forEach(link => link.category = newName);
      this.saveConfig();
      if (this.onConfigChange) this.onConfigChange();
    }
  }

  // Link operations
  addLink(categoryName, linkName, href, emoji = '') {
    const cat = this.config.categories.find(c => c.name === categoryName);
    if (cat) {
      cat.links.push({ name: linkName, href, category: categoryName, emoji });
      this.saveConfig();
      if (this.onConfigChange) this.onConfigChange();
    }
  }

  removeLink(categoryName, linkName) {
    const cat = this.config.categories.find(c => c.name === categoryName);
    if (cat) {
      cat.links = cat.links.filter(l => l.name !== linkName);
      this.saveConfig();
      if (this.onConfigChange) this.onConfigChange();
    }
  }

  // Edit mode
  setupEditToggle() {
    const editBtn = document.getElementById('edit-config-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.toggleEditMode());
    }
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    document.body.classList.toggle('edit-mode', this.editMode);
    const editBtn = document.getElementById('edit-config-btn');
    if (editBtn) {
      editBtn.textContent = this.editMode ? 'Done Editing' : 'Edit';
      editBtn.classList.toggle('btn-warning', this.editMode);
      editBtn.classList.toggle('btn-outline-secondary', !this.editMode);
    }
    if (this.onConfigChange) this.onConfigChange();
  }

  // Export
  setupExportButton() {
    const exportBtn = document.getElementById('export-config-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportConfig());
    }
  }

  setupImportButton() {
    const importBtn = document.getElementById('import-config-btn');
    const modalEl = document.getElementById('import-config-modal');
    const textarea = document.getElementById('import-config-json');
    const confirmBtn = document.getElementById('import-config-confirm-btn');
    if (!importBtn || !modalEl || !textarea || !confirmBtn) return;

    const modal = new bootstrap.Modal(modalEl);
    modalEl.addEventListener('shown.bs.modal', () => textarea.focus());

    importBtn.addEventListener('click', () => {
      textarea.value = '';
      modal.show();
    });

    confirmBtn.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) return;
      const success = await this.importConfig(text);
      if (success) {
        modal.hide();
        alert('Configuration imported successfully!');
      }
    });
  }

  getExportData() {
    // Combine config with entertainment domains for full export
    const entertainmentDomains = entertainmentDomainManager 
      ? entertainmentDomainManager.getEntertainmentDomains() 
      : [];
    
    return {
      ...this.config,
      entertainmentDomains,
      githubWatch: githubWatchList
    };
  }

  exportConfig() {
    const jsonStr = JSON.stringify(this.getExportData(), null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meh-tabs-config_${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importConfig(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.categories) {
        this.config = { categories: data.categories, megaPriority: data.megaPriority || [] };
        await this.saveConfig();
        
        // Also import entertainment domains if present
        if (data.entertainmentDomains && entertainmentDomainManager) {
          entertainmentDomainManager.entertainmentDomains = data.entertainmentDomains;
          await entertainmentDomainManager.saveEntertainmentDomains();
          entertainmentDomainManager.renderEntertainmentList();
        }

        // Also import the GitHub watch list if present
        if (Array.isArray(data.githubWatch)) {
          await saveGithubWatchList(data.githubWatch);
          await renderGithubCard(await readGithubCache());
          requestGithubRefresh(false); // fetch any newly-imported users
        }

        if (this.onConfigChange) this.onConfigChange();
        return true;
      }
    } catch (e) {
      console.error('Failed to import config:', e);
      alert('Invalid JSON format');
    }
    return false;
  }
}

// Global config manager instance
let configManager;

// Time update function
function updateTime() {
  const timeElement = document.getElementById('time');
  const now = new Date();

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}${ampm}`;

  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const date = now.getDate();

  // Clear and rebuild using DOM methods
  timeElement.textContent = '';
  timeElement.appendChild(document.createTextNode(time + ' '));
  const dateSpan = document.createElement('span');
  dateSpan.className = 'time-date';
  dateSpan.textContent = `${day} ${month} ${date}`;
  timeElement.appendChild(dateSpan);
}

// Links rendering functions using DOM methods (AMO-safe)
function createLinkCardElement(link, categoryName) {
  const wrapper = document.createElement('span');
  wrapper.className = 'link-wrapper';
  
  const a = document.createElement('a');
  a.href = link.href;
  a.className = 'link-btn';
  
  if (link.emoji) {
    const icon = document.createElement('i');
    icon.className = link.emoji;
    a.appendChild(icon);
    a.appendChild(document.createTextNode(' '));
  }
  a.appendChild(document.createTextNode(link.name));
  wrapper.appendChild(a);
  
  // Edit mode: remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'link-remove-btn edit-only';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remove link';
  removeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Remove "${link.name}"?`)) {
      configManager.removeLink(categoryName, link.name);
    }
  });
  wrapper.appendChild(removeBtn);
  
  return wrapper;
}

function createAddLinkButton(categoryName) {
  const btn = document.createElement('button');
  btn.className = 'link-add-btn edit-only';
  btn.textContent = '+ Add Link';
  btn.addEventListener('click', () => {
    showAddLinkDialog(categoryName);
  });
  return btn;
}

function showAddLinkDialog(categoryName) {
  const name = prompt('Link name:');
  if (!name) return;
  const href = prompt('URL:', 'https://');
  if (!href) return;
  const emoji = prompt('Emoji class (optional, e.g. "fa-solid fa-star"):', '');
  configManager.addLink(categoryName, name, href, emoji || '');
}

function createCategorySectionElement(category) {
  const section = document.createElement('div');
  section.className = 'category-section';
  section.dataset.category = category.name;
  
  const header = document.createElement('div');
  header.className = 'category-header';
  
  const h2 = document.createElement('h2');
  h2.className = 'h4';
  
  if (category.emoji) {
    const icon = document.createElement('i');
    icon.className = category.emoji + ' me-2';
    h2.appendChild(icon);
  }
  h2.appendChild(document.createTextNode(category.name));
  
  // Edit mode: remove category button
  const removeCatBtn = document.createElement('button');
  removeCatBtn.className = 'category-remove-btn edit-only ms-2';
  removeCatBtn.textContent = '×';
  removeCatBtn.title = 'Remove category';
  removeCatBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm(`Remove category "${category.name}" and all its links?`)) {
      configManager.removeCategory(category.name);
    }
  });
  h2.appendChild(removeCatBtn);
  
  header.appendChild(h2);
  
  const linksContainer = document.createElement('div');
  linksContainer.className = 'links-container';
  category.links.forEach(link => {
    linksContainer.appendChild(createLinkCardElement(link, category.name));
  });
  
  // Edit mode: add link button
  linksContainer.appendChild(createAddLinkButton(category.name));
  
  section.appendChild(header);
  section.appendChild(linksContainer);
  
  return section;
}

function createAddCategoryButton() {
  const wrapper = document.createElement('div');
  wrapper.className = 'add-category-wrapper edit-only';
  
  const btn = document.createElement('button');
  btn.className = 'btn btn-outline-secondary btn-sm';
  btn.textContent = '+ Add Category';
  btn.addEventListener('click', () => {
    const name = prompt('Category name:');
    if (!name) return;
    const emoji = prompt('Emoji class (optional):', '');
    configManager.addCategory(name, emoji || '');
  });
  
  wrapper.appendChild(btn);
  return wrapper;
}

// --- Local Services: read from the Caddy dashboard's service list ---
// Source is http://home.localhost/projects.json, served by the same Caddy that
// runs the dashboard. (Caddy's admin API on :2019 blocks browser origins by
// design, so we read this normal, browser-fetchable route instead.) Same list
// the dashboard shows; nothing here is stored in the Custom New Tab config.
const LOCAL_SERVICES_URL = 'http://home.localhost/projects.json';

async function fetchCaddyServices() {
  const res = await fetch(LOCAL_SERVICES_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('services list ' + res.status);
  const list = await res.json();
  return (list || [])
    .map(s => ({
      name: s.label || s.hostname || s.url,
      href: s.url || (s.hostname ? 'http://' + s.hostname : '#'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Link card without the edit-mode remove button (this section isn't user-editable).
function createLocalServiceCard(link) {
  const wrapper = document.createElement('span');
  wrapper.className = 'link-wrapper';
  const a = document.createElement('a');
  a.href = link.href;
  a.className = 'link-btn';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-server';
  a.appendChild(icon);
  a.appendChild(document.createTextNode(' ' + link.name));
  wrapper.appendChild(a);
  return wrapper;
}

// Builds the section shell synchronously (so ordering is stable), then fills it in.
function renderLocalServices(container) {
  const section = document.createElement('div');
  section.className = 'category-section';
  section.dataset.category = 'Local Services';

  const header = document.createElement('div');
  header.className = 'category-header';
  const h2 = document.createElement('h2');
  const hicon = document.createElement('i');
  hicon.className = 'fa-solid fa-server me-2';
  h2.appendChild(hicon);
  h2.appendChild(document.createTextNode('Local Services'));
  header.appendChild(h2);
  section.appendChild(header);

  const linksContainer = document.createElement('div');
  linksContainer.className = 'links-container';
  const loading = document.createElement('span');
  loading.className = 'text-muted';
  loading.textContent = 'Loading from Caddy…';
  linksContainer.appendChild(loading);
  section.appendChild(linksContainer);

  container.appendChild(section);

  fetchCaddyServices().then(services => {
    linksContainer.textContent = '';
    if (!services.length) {
      const none = document.createElement('span');
      none.className = 'text-muted';
      none.textContent = 'No Caddy services found.';
      linksContainer.appendChild(none);
      return;
    }
    services.forEach(svc => linksContainer.appendChild(createLocalServiceCard(svc)));
  }).catch(err => {
    linksContainer.textContent = '';
    const msg = document.createElement('span');
    msg.className = 'text-muted';
    msg.textContent = 'Local services list not reachable (home.localhost).';
    linksContainer.appendChild(msg);
    console.warn('Local Services fetch failed:', err);
  });
}

// Load and render links
function renderLinks() {
  const container = document.getElementById('categories-container');
  if (!container || !configManager) return;

  const categories = configManager.getCategories();

  // Clear and rebuild using DOM methods
  container.textContent = '';

  // Auto-synced Local Services section (from Caddy), shown first.
  renderLocalServices(container);

  categories.forEach(category => {
    container.appendChild(createCategorySectionElement(category));
  });

  // Add "Add Category" button for edit mode
  container.appendChild(createAddCategoryButton());
}

async function loadAndRenderLinks() {
  const container = document.getElementById('categories-container');
  
  try {
    // Initialize config manager if not done
    if (!configManager) {
      configManager = new ConfigManager();
      await configManager.init();
      configManager.onConfigChange = renderLinks;
    }
    
    renderLinks();
  } catch (error) {
    console.error('Error loading links:', error);
    container.textContent = '';
    const alertEl = document.createElement('div');
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = 'Error loading links. Please check the console for details.';
    container.appendChild(alertEl);
  }
}

// ============================================================================
// GITHUB CONTRIBUTION MONITOR (view + live-editable watch list)
// This page NEVER calls the GitHub API -- the background script is the single
// fetch path (see background.js for why). Here we render the cached counts and
// let the user add/remove watched usernames right in the tab.
//
// The watch list lives in storage.local under `githubWatch`, exactly like the
// entertainment domain list -- so it survives without any per-machine file and
// rides along in the Export/Import config JSON. On a fresh machine the list is
// seeded once from the committed config file (personal-config.json/links.json),
// after which the live store is authoritative.
// ============================================================================
const GH_CACHE_KEY = 'githubContrib';
const GH_WATCH_KEY = 'githubWatch';

// In-memory mirror of the watch list so the (synchronous) config export can
// include it, matching how entertainmentDomainManager exposes its list.
let githubWatchList = [];

async function readGithubCache() {
  try {
    const result = await (window.browser || window.chrome).storage.local.get(GH_CACHE_KEY);
    return result[GH_CACHE_KEY] || null;
  } catch (e) {
    return null;
  }
}

// Load the live watch list, seeding it once from the committed config file if
// this machine has never stored one.
async function loadGithubWatchList() {
  const api = window.browser || window.chrome;
  try {
    const result = await api.storage.local.get(GH_WATCH_KEY);
    if (Array.isArray(result[GH_WATCH_KEY])) {
      githubWatchList = result[GH_WATCH_KEY];
      return githubWatchList;
    }
  } catch (e) { /* storage unavailable */ }

  for (const file of ['personal-config.json', 'links.json']) {
    try {
      const res = await fetch(api.runtime.getURL(file));
      if (res.ok) {
        const cfg = await res.json();
        if (Array.isArray(cfg.githubWatch)) {
          githubWatchList = cfg.githubWatch;
          await saveGithubWatchList(githubWatchList); // seed the live store
          return githubWatchList;
        }
      }
    } catch (e) { /* file absent */ }
  }
  githubWatchList = [];
  return githubWatchList;
}

async function saveGithubWatchList(list) {
  githubWatchList = list;
  try {
    await (window.browser || window.chrome).storage.local.set({ [GH_WATCH_KEY]: list });
  } catch (e) {
    console.error('Failed to save github watch list:', e);
  }
}

function requestGithubRefresh(force = false) {
  const api = window.browser || window.chrome;
  return new Promise(resolve => {
    try {
      api.runtime.sendMessage({ action: 'refreshGithub', force }, resp => resolve(resp));
    } catch (e) {
      resolve(null);
    }
  });
}

function githubTimeAgo(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Normalize whatever the user pastes (a URL, @handle, or bare name) to a login.
function normalizeGithubUsername(raw) {
  let name = (raw || '').trim();
  const urlMatch = name.match(/github\.com\/([^/?#]+)/i);
  if (urlMatch) name = urlMatch[1];
  name = name.replace(/^@/, '').replace(/\/+$/, '');
  return name;
}

async function addGithubUser(raw) {
  const name = normalizeGithubUsername(raw);
  if (!name) return;
  if (githubWatchList.some(n => n.toLowerCase() === name.toLowerCase())) return; // dedupe
  await saveGithubWatchList([...githubWatchList, name]);
  await renderGithubCard(await readGithubCache());
  // Fetch just the new user (the background's staleness guard skips the rest).
  const resp = await requestGithubRefresh(false);
  await renderGithubCard(resp && resp.data ? resp.data : await readGithubCache());
}

async function removeGithubUser(name) {
  await saveGithubWatchList(githubWatchList.filter(n => n !== name));
  await renderGithubCard(await readGithubCache());
}

async function renderGithubCard(cache) {
  const container = document.getElementById('github-container');
  if (!container) return;
  container.textContent = '';

  const users = cache && cache.users ? cache.users : {};

  const card = document.createElement('div');
  card.className = 'card mb-4';

  const header = document.createElement('div');
  header.className = 'card-header d-flex justify-content-between align-items-center';
  const h5 = document.createElement('h5');
  h5.className = 'mb-0';
  h5.textContent = 'GitHub Activity';
  header.appendChild(h5);

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn btn-sm btn-outline-secondary';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.textContent = 'Refreshing...';
    refreshBtn.disabled = true;
    const resp = await requestGithubRefresh(true);
    await renderGithubCard(resp && resp.data ? resp.data : await readGithubCache());
  });
  header.appendChild(refreshBtn);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'card-body';
  const list = document.createElement('div');
  list.className = 'github-list';

  // Rows come from the watch list (not the cache), so a just-added user shows
  // immediately as "loading" before the first fetch lands. Most-active first.
  const names = [...githubWatchList].sort((a, b) => {
    const ay = (users[a] && users[a].lastYear) || 0;
    const by = (users[b] && users[b].lastYear) || 0;
    return by - ay;
  });

  names.forEach(name => {
    const info = users[name];
    const row = document.createElement('div');
    row.className = 'github-row';

    const dot = document.createElement('span');
    dot.className = 'svc-dot ' + (info && info.ok && info.lastYear > 0 ? 'up' : 'down');
    row.appendChild(dot);

    const link = document.createElement('a');
    link.className = 'github-user';
    link.href = `https://github.com/${encodeURIComponent(name)}`;
    link.textContent = name;
    row.appendChild(link);

    const count = document.createElement('span');
    count.className = 'github-count';
    if (!info) {
      count.textContent = 'loading…';
    } else if (!info.ok) {
      count.textContent = 'unavailable';
      count.classList.add('github-error');
    } else {
      count.textContent = `${info.lastYear} in last year`;
    }
    row.appendChild(count);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'github-remove-btn';
    removeBtn.textContent = '×'; // multiplication sign (x)
    removeBtn.title = `Stop watching ${name}`;
    removeBtn.addEventListener('click', () => removeGithubUser(name));
    row.appendChild(removeBtn);

    list.appendChild(row);
  });

  if (names.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted small mb-2';
    empty.textContent = 'No GitHub users watched yet. Add a username below.';
    list.appendChild(empty);
  }
  body.appendChild(list);

  // Add-username input.
  const addGroup = document.createElement('div');
  addGroup.className = 'input-group input-group-sm github-add mt-2';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control';
  input.placeholder = 'Add GitHub username or profile URL…';
  input.autocomplete = 'off';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = 'Add';
  const submit = () => {
    const val = input.value;
    input.value = '';
    if (val.trim()) addGithubUser(val);
  };
  addBtn.addEventListener('click', submit);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') submit(); });
  addGroup.appendChild(input);
  addGroup.appendChild(addBtn);
  body.appendChild(addGroup);

  const note = document.createElement('div');
  note.className = 'svc-note';
  note.textContent = cache && cache.updatedAt ? `Updated ${githubTimeAgo(cache.updatedAt)}` : '';
  body.appendChild(note);

  card.appendChild(body);
  container.appendChild(card);
}

async function loadAndRenderGithub() {
  const container = document.getElementById('github-container');
  if (!container) return;

  await loadGithubWatchList();
  const cache = await readGithubCache();
  await renderGithubCard(cache);

  // Ask the background to fill any watched users missing from the cache (cold
  // cache, or newly seeded list), then re-render. The background coalesces
  // concurrent requests, so opening several tabs at once yields one fetch each.
  const cachedNames = cache && cache.users ? Object.keys(cache.users) : [];
  const missing = githubWatchList.some(n => !cachedNames.includes(n));
  if (missing) {
    const resp = await requestGithubRefresh(false);
    await renderGithubCard(resp && resp.data ? resp.data : await readGithubCache());
  }
}

class Stopwatch {
  constructor() {
    this.startTime = 0;
    this.isRunning = false;
    this.interval = null;
    this.elapsedTime = 0;

    this.elements = {
      display: document.getElementById('stopwatch'),
      controls: document.getElementById('stopwatch-controls'),
      startBtn: document.getElementById('start-stopwatch'),
      pauseBtn: document.getElementById('pause-stopwatch'),
      stopBtn: document.getElementById('stop-stopwatch')
    };

    this.attachEventListeners();
  }

  attachEventListeners() {
    this.elements.startBtn.addEventListener('click', () => this.start());
    this.elements.pauseBtn.addEventListener('click', () => this.pause());
    this.elements.stopBtn.addEventListener('click', () => this.stop());
  }

  formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  start() {
    if (!this.isRunning) {
      this.startTime = Date.now() - this.elapsedTime;
      this.interval = setInterval(() => this.updateDisplay(), 100);
      this.isRunning = true;
      this.elements.display.classList.add('running');
      this.elements.controls.classList.remove('hidden');
      this.elements.startBtn.classList.add('hidden');
    }
  }

  pause() {
    if (this.isRunning) {
      clearInterval(this.interval);
      this.isRunning = false;
      this.elapsedTime = Date.now() - this.startTime;
      this.elements.pauseBtn.textContent = 'Resume';
    } else {
      this.start();
      this.elements.pauseBtn.textContent = 'Pause';
    }
  }

  stop() {
    clearInterval(this.interval);
    this.isRunning = false;
    this.elapsedTime = 0;
    this.elements.display.classList.remove('running');
    
    // Rebuild button using DOM methods (AMO-safe)
    this.elements.display.textContent = '';
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline-primary';
    btn.id = 'start-stopwatch';
    btn.textContent = 'Start Stopwatch';
    this.elements.display.appendChild(btn);
    
    this.elements.controls.classList.add('hidden');
    this.elements.startBtn = btn;
    this.elements.startBtn.addEventListener('click', () => this.start());
  }

  updateDisplay() {
    const currentTime = Date.now() - this.startTime;
    this.elements.display.textContent = this.formatTime(currentTime);
  }
}


// Tab sorting button handler - uses background script for full permissions
function initializeTabSorting() {
  const sortButton = document.getElementById('sort-tabs');
  
  if (!sortButton) {
    console.error('Sort tabs button not found');
    return;
  }
  
  console.log('Initializing tab sorting via background script');
  
  sortButton.addEventListener('click', async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const browserAPI = window.browser || window.chrome;
    
    // Get entertainment domains to separate them during sort
    const entertainmentDomains = entertainmentDomainManager 
      ? entertainmentDomainManager.getEntertainmentDomains() 
      : [];
    
    console.log('Sending sort request to background script with entertainment domains:', entertainmentDomains);
    sortButton.textContent = 'Sorting...';
    sortButton.disabled = true;
    
    try {
      // Send message to background script which has full permissions
      const response = await browserAPI.runtime.sendMessage({ 
        action: 'sortTabs',
        entertainmentDomains: entertainmentDomains
      });
      
      if (response.success) {
        const parts = [];
        if (response.duplicatesClosed > 0) {
          parts.push(`${response.duplicatesClosed} dupes closed`);
        }
        if (response.entertainmentCount > 0) {
          parts.push(`${response.entertainmentCount} entertainment`);
        }
        
        console.log(`Sorted: ${response.regularCount} regular, ${response.entertainmentCount} entertainment, ${response.duplicatesClosed} dupes closed`);
        sortButton.textContent = parts.length > 0 
          ? `Sorted! ${parts.join(', ')}`
          : 'Sorted!';
        setTimeout(() => {
          sortButton.textContent = 'Sort Open Tabs';
          sortButton.disabled = false;
        }, 2000);
      } else {
        throw new Error(response.error || 'Unknown error');
      }
      
    } catch (error) {
      console.error('Failed to sort tabs:', error);
      sortButton.textContent = 'Sort Failed';
      setTimeout(() => {
        sortButton.textContent = 'Sort Open Tabs';
        sortButton.disabled = false;
      }, 2000);
      alert(`Failed to sort tabs: ${error.message}`);
    }
  });
}

// Entertainment domain list management
class EntertainmentDomainManager {
  constructor() {
    this.entertainmentDomains = [];
    this.browserAPI = window.browser || window.chrome;
    this.storageKey = 'entertainmentDomains';
    this.removalTimeouts = new Map(); // Track pending removals
    
    this.elements = {
      input: document.getElementById('add-entertainment-domain'),
      addBtn: document.getElementById('add-entertainment-btn'),
      list: document.getElementById('entertainment-domains-list'),
      suggestions: document.getElementById('domain-suggestions')
    };
    
    this.init();
  }
  
  async init() {
    await this.loadEntertainmentDomains();
    this.renderEntertainmentList();
    this.attachEventListeners();
    await this.updateDomainSuggestions();
  }
  
  async loadEntertainmentDomains() {
    try {
      const result = await this.browserAPI.storage.local.get(this.storageKey);
      this.entertainmentDomains = result[this.storageKey] || [];
      console.log('Loaded entertainment domains:', this.entertainmentDomains);
    } catch (error) {
      console.error('Error loading entertainment domains:', error);
      this.entertainmentDomains = [];
    }
  }
  
  async saveEntertainmentDomains() {
    try {
      await this.browserAPI.storage.local.set({ [this.storageKey]: this.entertainmentDomains });
      console.log('Saved entertainment domains:', this.entertainmentDomains);
    } catch (error) {
      console.error('Error saving entertainment domains:', error);
    }
  }
  
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      return null;
    }
  }
  
  async updateDomainSuggestions() {
    try {
      // Get all currently open tabs
      const tabs = await this.browserAPI.tabs.query({});
      
      // Extract unique domains
      const domains = new Set();
      tabs.forEach(tab => {
        const domain = this.extractDomain(tab.url);
        if (domain && !this.entertainmentDomains.includes(domain)) {
          domains.add(domain);
        }
      });
      
      // Update datalist using DOM methods (AMO-safe)
      this.elements.suggestions.textContent = '';
      Array.from(domains).sort().forEach(domain => {
        const option = document.createElement('option');
        option.value = domain;
        this.elements.suggestions.appendChild(option);
      });
        
    } catch (error) {
      console.error('Error updating domain suggestions:', error);
    }
  }
  
  attachEventListeners() {
    this.elements.addBtn.addEventListener('click', () => this.addEntertainmentDomain());
    this.elements.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addEntertainmentDomain();
      }
    });
    
    // Update suggestions when input is focused
    this.elements.input.addEventListener('focus', () => this.updateDomainSuggestions());
  }
  
  async addEntertainmentDomain() {
    const domain = this.elements.input.value.trim().toLowerCase();
    
    if (!domain) {
      return;
    }
    
    // Clean up domain (remove protocol, www, trailing slashes)
    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    
    if (this.entertainmentDomains.includes(cleanDomain)) {
      alert('This domain is already in the entertainment list!');
      return;
    }
    
    this.entertainmentDomains.push(cleanDomain);
    await this.saveEntertainmentDomains();
    this.renderEntertainmentList();
    this.elements.input.value = '';
    await this.updateDomainSuggestions();
  }
  
  async removeEntertainmentDomain(domain, immediate = false) {
    if (immediate) {
      // Actually remove from storage
      this.entertainmentDomains = this.entertainmentDomains.filter(d => d !== domain);
      await this.saveEntertainmentDomains();
      this.renderEntertainmentList();
      await this.updateDomainSuggestions();
    } else {
      // Start fade-out with undo option
      const domainItem = this.elements.list.querySelector(`[data-domain="${domain}"]`);
      if (!domainItem) return;
      
      domainItem.classList.add('removing');
      
      // Replace content with undo button using DOM methods (AMO-safe)
      domainItem.textContent = '';
      
      const undoBtn = document.createElement('button');
      undoBtn.className = 'undo-entertainment-btn';
      undoBtn.dataset.domain = domain;
      undoBtn.textContent = 'Undo';
      undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelRemoval(domain);
      });
      
      const domainText = document.createElement('span');
      domainText.className = 'entertainment-domain-text';
      domainText.textContent = domain;
      
      domainItem.appendChild(undoBtn);
      domainItem.appendChild(domainText);
      
      // Schedule actual removal after 5 seconds
      const timeoutId = setTimeout(() => {
        this.removeEntertainmentDomain(domain, true);
        this.removalTimeouts.delete(domain);
      }, 5000);
      
      this.removalTimeouts.set(domain, timeoutId);
    }
  }
  
  cancelRemoval(domain) {
    // Cancel the scheduled removal
    const timeoutId = this.removalTimeouts.get(domain);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.removalTimeouts.delete(domain);
    }
    
    // Re-render to restore normal state
    this.renderEntertainmentList();
  }
  
  renderEntertainmentList() {
    // Clear list using DOM methods (AMO-safe)
    this.elements.list.textContent = '';
    
    if (this.entertainmentDomains.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'text-muted small';
      emptyMsg.textContent = 'No entertainment domains added yet.';
      this.elements.list.appendChild(emptyMsg);
      return;
    }
    
    this.entertainmentDomains.sort().forEach(domain => {
      const item = document.createElement('div');
      item.className = 'entertainment-domain-item';
      item.dataset.domain = domain;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-entertainment-btn';
      removeBtn.dataset.domain = domain;
      removeBtn.textContent = '\u00D7'; // multiplication sign (x)
      
      const domainText = document.createElement('span');
      domainText.className = 'entertainment-domain-text';
      domainText.textContent = domain;
      
      item.appendChild(removeBtn);
      item.appendChild(domainText);
      
      // Attach listener to entire domain item
      item.addEventListener('click', () => {
        if (!item.classList.contains('removing')) {
          this.removeEntertainmentDomain(domain, false);
        }
      });
      
      this.elements.list.appendChild(item);
    });
  }
  
  getEntertainmentDomains() {
    return this.entertainmentDomains;
  }
}

// Global entertainment domain manager instance
let entertainmentDomainManager;

// Move entertainment tabs button handler - uses background script
function initializeEntertainmentMoving() {
  const moveButton = document.getElementById('move-entertainment');
  
  if (!moveButton) {
    console.error('Move entertainment button not found');
    return;
  }
  
  console.log('Initializing entertainment moving via background script');
  
  moveButton.addEventListener('click', async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const browserAPI = window.browser || window.chrome;
    const entertainmentDomains = entertainmentDomainManager.getEntertainmentDomains();
    
    if (entertainmentDomains.length === 0) {
      alert('No entertainment domains in your list! Add some domains first.');
      return;
    }
    
    console.log('Sending move entertainment request to background script...');
    moveButton.textContent = 'Moving...';
    moveButton.disabled = true;
    
    try {
      // Send message to background script which has full permissions
      const response = await browserAPI.runtime.sendMessage({ 
        action: 'moveEntertainment',
        entertainmentDomains: entertainmentDomains
      });
      
      if (response.success) {
        const dupeMsg = response.duplicatesClosed > 0 ? `, ${response.duplicatesClosed} dupes closed` : '';
        if (response.tabCount > 0) {
          console.log(`Successfully moved ${response.tabCount} entertainment tabs${dupeMsg}`);
          moveButton.textContent = response.duplicatesClosed > 0
            ? `Moved ${response.tabCount}! ${response.duplicatesClosed} dupes closed`
            : `Moved ${response.tabCount}!`;
        } else if (response.duplicatesClosed > 0) {
          console.log(`No unique entertainment tabs to move, but closed ${response.duplicatesClosed} duplicates`);
          moveButton.textContent = `${response.duplicatesClosed} dupes closed`;
        } else {
          console.log('No entertainment tabs found');
          moveButton.textContent = 'None Found';
        }
        setTimeout(() => {
          moveButton.textContent = 'Move Entertainment URLs to Different Window';
          moveButton.disabled = false;
        }, 2000);
      } else {
        throw new Error(response.error || 'Unknown error');
      }
      
    } catch (error) {
      console.error('Failed to move entertainment tabs:', error);
      moveButton.textContent = 'Failed';
      setTimeout(() => {
        moveButton.textContent = 'Move Entertainment URLs to Different Window';
        moveButton.disabled = false;
      }, 2000);
      alert(`Failed to move entertainment tabs: ${error.message}`);
    }
  });
}

// Extract Chordify tabs button handler - uses background script
function initializeChordifyExtraction() {
  const extractButton = document.getElementById('extract-chordify');
  
  if (!extractButton) {
    console.error('Extract chordify button not found');
    return;
  }
  
  console.log('Initializing chordify extraction via background script');
  
  extractButton.addEventListener('click', async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const browserAPI = window.browser || window.chrome;
    
    console.log('Sending extract chordify request to background script...');
    extractButton.textContent = 'Extracting...';
    extractButton.disabled = true;
    
    try {
      // Send message to background script which has full permissions
      const response = await browserAPI.runtime.sendMessage({ action: 'extractChordify' });
      
      if (response.success) {
        if (response.tabCount > 0) {
          console.log(`Successfully extracted ${response.tabCount} Chordify tabs`);
          extractButton.textContent = `Extracted ${response.tabCount}!`;
        } else {
          console.log('No Chordify tabs found');
          extractButton.textContent = 'None Found';
        }
        setTimeout(() => {
          extractButton.textContent = 'Extract Chordify';
          extractButton.disabled = false;
        }, 2000);
      } else {
        throw new Error(response.error || 'Unknown error');
      }
      
    } catch (error) {
      console.error('Failed to extract chordify tabs:', error);
      extractButton.textContent = 'Failed';
      setTimeout(() => {
        extractButton.textContent = 'Extract Chordify';
        extractButton.disabled = false;
      }, 2000);
      alert(`Failed to extract Chordify tabs: ${error.message}`);
    }
  });
}

// Initialize all components when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setAppVersion();
  updateTime();
  setInterval(updateTime, 1000);
  loadAndRenderLinks();
  loadAndRenderGithub();
  new Stopwatch();
  initializeTabSorting();
  initializeChordifyExtraction();
  entertainmentDomainManager = new EntertainmentDomainManager();
  initializeEntertainmentMoving();
});
