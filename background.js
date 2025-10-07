// background.js
// This file runs in the background with full extension privileges
// It does NOT have access to any DOM - it's not a web page

// Use the browser API
const browserAPI = browser || chrome;

// Function to sort tabs alphabetically by URL
async function sortTabsAlphabetically() {
  
  try {
    // Get all tabs in current window
    const tabs = await browserAPI.tabs.query({ currentWindow: true });
	
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

    // Sort tabs by URL alphabetically, with audio tabs prioritized within each section
    const sortedTabs = [...tabs].sort((a, b) => { 
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
  
	  // Both are regular tabs (no mega-priority)
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
    });
    
    // Move each tab to its new position
    for (let targetIndex = 0; targetIndex < sortedTabs.length; targetIndex++) {
      const tab = sortedTabs[targetIndex];
      if (tab.index !== targetIndex) {
        await browserAPI.tabs.move(tab.id, { index: targetIndex });
        // Small delay to let browser process the move
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    console.log('Sorting complete!');
    return { success: true, tabCount: tabs.length };
    
  } catch (error) {
    console.error('Error sorting tabs:', error);
    return { success: false, error: error.message };
  }
}

// IMPORTANT: Set up message listener to receive requests from newtab.js
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === 'sortTabs') {
    console.log('Sort tabs action requested');
    
    // Call the sort function and send response back
    sortTabsAlphabetically().then(result => {
      console.log('Sending result back:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('Error in message handler:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // IMPORTANT: Return true to indicate we'll send a response asynchronously
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