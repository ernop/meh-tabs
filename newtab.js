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
      exportBtn.addEventListener('click', () => this.showExportModal());
    }
  }

  getExportData() {
    // Combine config with entertainment domains for full export
    const entertainmentDomains = entertainmentDomainManager 
      ? entertainmentDomainManager.getEntertainmentDomains() 
      : [];
    
    return {
      ...this.config,
      entertainmentDomains
    };
  }

  showExportModal() {
    const modal = document.getElementById('export-config-modal');
    const textarea = document.getElementById('export-config-json');
    if (modal && textarea) {
      textarea.value = JSON.stringify(this.getExportData(), null, 2);
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
      
      // Setup copy button
      const copyBtn = document.getElementById('copy-config-btn');
      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(textarea.value);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = 'Copy to Clipboard', 2000);
          } catch (e) {
            textarea.select();
            document.execCommand('copy');
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = 'Copy to Clipboard', 2000);
          }
        };
      }
      
      // Setup import button
      const importBtn = document.getElementById('import-config-btn');
      if (importBtn) {
        importBtn.onclick = async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text && confirm('Import configuration from clipboard? This will overwrite your current settings.')) {
              const success = await this.importConfig(text);
              if (success) {
                bsModal.hide();
                alert('Configuration imported successfully!');
              }
            }
          } catch (e) {
            const text = prompt('Paste your JSON configuration:');
            if (text) {
              const success = await this.importConfig(text);
              if (success) {
                bsModal.hide();
                alert('Configuration imported successfully!');
              }
            }
          }
        };
      }
    }
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

// Load and render links
function renderLinks() {
  const container = document.getElementById('categories-container');
  if (!container || !configManager) return;
  
  const categories = configManager.getCategories();
  
  // Clear and rebuild using DOM methods
  container.textContent = '';
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
  new Stopwatch();
  initializeTabSorting();
  initializeChordifyExtraction();
  entertainmentDomainManager = new EntertainmentDomainManager();
  initializeEntertainmentMoving();
});
