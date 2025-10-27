const browser = window.browser || window.chrome;

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

  timeElement.innerHTML = `
        ${time}
        <span class="time-date">
            ${day} ${month} ${date}
        </span>
    `;
}

// Links rendering functions
function createLinkCard(link) {
  return `<a href="${link.href}" class="link-btn"><i class="${link.emoji}"></i> ${link.name}</a>`;
}

function createCategorySection(category) {
  const linksHtml = category.links.map(createLinkCard).join('');
  return `<div class="category-section"><div class="category-header"><h2 class="h4"><i class="${category.emoji} me-2"></i>${category.name}</h2></div><div class="links-container">${linksHtml}</div></div>`;
}

// Load and render links
async function loadAndRenderLinks() {
  try {
    let data;
    
    // Try to load personal config first
    try {
      const personalConfigUrl = browser.runtime.getURL('personal-config.json');
      const personalResponse = await fetch(personalConfigUrl);
      if (personalResponse.ok) {
        data = await personalResponse.json();
        console.log('Loaded personal configuration');
      }
    } catch (error) {
      console.log('Personal config not found, loading default links');
    }
    
    // Fall back to default links.json if personal config not available
    if (!data) {
      const linksUrl = browser.runtime.getURL('links.json');
      const response = await fetch(linksUrl);
      data = await response.json();
      console.log('Loaded default configuration');
    }

    const sortedCategories = data.categories.sort((a, b) => a.order - b.order);
    const categoriesHtml = sortedCategories.map(createCategorySection).join('');
    document.getElementById('categories-container').innerHTML = categoriesHtml;
  } catch (error) {
    console.error('Error loading links:', error);
    document.getElementById('categories-container').innerHTML =
      '<div class="alert alert-danger">Error loading links. Please check the console for details.</div>';
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
      this.elements.controls.style.display = 'flex';
      this.elements.startBtn.style.display = 'none';
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
    this.elements.display.innerHTML = '<button class="btn btn-outline-primary" id="start-stopwatch">Start Stopwatch</button>';
    this.elements.controls.style.display = 'none';
    this.elements.startBtn = document.getElementById('start-stopwatch');
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
    
    console.log('Sending sort request to background script...');
    sortButton.textContent = 'Sorting...';
    sortButton.disabled = true;
    
    try {
      // Send message to background script which has full permissions
      const response = await browserAPI.runtime.sendMessage({ action: 'sortTabs' });
      
      if (response.success) {
        console.log(`Successfully sorted ${response.tabCount} tabs`);
        sortButton.textContent = 'Sorted!';
        setTimeout(() => {
          sortButton.textContent = 'Sort Open Tabs';
          sortButton.disabled = false;
        }, 1500);
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
      
      // Update datalist
      this.elements.suggestions.innerHTML = Array.from(domains)
        .sort()
        .map(domain => `<option value="${domain}">`)
        .join('');
        
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
      
      // Replace content with undo button
      domainItem.innerHTML = `
        <button class="undo-entertainment-btn" data-domain="${domain}">Undo</button>
        <span class="entertainment-domain-text">${domain}</span>
      `;
      
      // Set up undo listener
      const undoBtn = domainItem.querySelector('.undo-entertainment-btn');
      undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelRemoval(domain);
      });
      
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
    if (this.entertainmentDomains.length === 0) {
      this.elements.list.innerHTML = '<p class="text-muted small">No entertainment domains added yet.</p>';
      return;
    }
    
    this.elements.list.innerHTML = this.entertainmentDomains
      .sort()
      .map(domain => `
        <div class="entertainment-domain-item" data-domain="${domain}">
          <button class="remove-entertainment-btn" data-domain="${domain}">&times;</button>
          <span class="entertainment-domain-text">${domain}</span>
        </div>
      `).join('');
    
    // Attach listeners to entire domain item (not just the button)
    this.elements.list.querySelectorAll('.entertainment-domain-item').forEach(item => {
      item.addEventListener('click', () => {
        // Don't remove if it's already in "removing" state
        if (!item.classList.contains('removing')) {
          this.removeEntertainmentDomain(item.dataset.domain, false);
        }
      });
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
        if (response.tabCount > 0) {
          console.log(`Successfully moved ${response.tabCount} entertainment tabs`);
          moveButton.textContent = `Moved ${response.tabCount}!`;
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
  updateTime();
  setInterval(updateTime, 1000);
  loadAndRenderLinks();
  new Stopwatch();
  initializeTabSorting();
  initializeChordifyExtraction();
  entertainmentDomainManager = new EntertainmentDomainManager();
  initializeEntertainmentMoving();
});
