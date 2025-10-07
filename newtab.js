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
  return `
    <div class="col">
      <a href="${link.href}" class="card h-100 text-decoration-none text-dark">
        <div class="card-body text-center">
          <i class="${link.emoji} icon"></i><br>
          ${link.name}
        </div>
      </a>
    </div>
  `;
}

function createCategorySection(category) {
  const linksHtml = category.links.map(createLinkCard).join('');
  return `
    <div class="category-section">
      <div class="category-header">
        <h2 class="h4">
          <i class="${category.emoji} me-2"></i>
          ${category.name}
        </h2>
      </div>
      <div class="row row-cols-2 row-cols-md-4 g-3">
        ${linksHtml}
      </div>
    </div>
  `;
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


// Update the sort button handler in newtab.js to use the background script
// Replace the existing sort button click handler with this:

function initializeTabSortingViaBackground() {
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTabSortingViaBackground);
} else {
  initializeTabSortingViaBackground();
}


// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  updateTime();
  setInterval(updateTime, 1000);
  loadAndRenderLinks();
  new Stopwatch();
});
