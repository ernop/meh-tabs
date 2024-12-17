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
    const linksUrl = browser.runtime.getURL('links.json');
    const response = await fetch(linksUrl);
    const data = await response.json();

    const sortedCategories = data.categories.sort((a, b) => a.order - b.order);
    const categoriesHtml = sortedCategories.map(createCategorySection).join('');
    document.getElementById('categories-container').innerHTML = categoriesHtml;
  } catch (error) {
    console.error('Error loading links:', error);
    document.getElementById('categories-container').innerHTML =
      '<div class="alert alert-danger">Error loading links. Please check the console for details.</div>';
  }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  updateTime();
  setInterval(updateTime, 1000);
  loadAndRenderLinks();
});
