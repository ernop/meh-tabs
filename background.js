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
    // Process in batches to avoid race conditions
    for (let targetIndex = 0; targetIndex < sortedTabs.length; targetIndex++) {
      const tab = sortedTabs[targetIndex];
      if (tab.index !== targetIndex) {
        try {
          await browserAPI.tabs.move(tab.id, { index: targetIndex });
          // Small delay to let browser process the move (increased from 10ms for stability)
          await new Promise(resolve => setTimeout(resolve, 15));
        } catch (error) {
          console.error(`Error moving tab ${tab.id} to index ${targetIndex}:`, error);
          // Continue with other tabs even if one fails
        }
      }
    }
    
    console.log('Sorting complete!');
    return { success: true, tabCount: tabs.length };
    
  } catch (error) {
    console.error('Error sorting tabs:', error);
    return { success: false, error: error.message };
  }
}

// Function to move entertainment tabs to a new window
async function moveEntertainmentTabs(entertainmentDomains) {
  try {
    // Get all tabs from all windows
    const allTabs = await browserAPI.tabs.query({});
    
    // Helper function to extract domain from URL
    const extractDomain = (url) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
      } catch (error) {
        return null;
      }
    };
    
    // Filter for entertainment tabs
    const entertainmentTabs = allTabs.filter(tab => {
      const domain = extractDomain(tab.url);
      if (!domain) return false;
      
      return entertainmentDomains.some(entertainmentDomain => {
        // Exact match
        if (domain === entertainmentDomain) return true;
        // Subdomain match (*.entertainmentDomain)
        if (domain.endsWith('.' + entertainmentDomain)) return true;
        return false;
      });
    });
    
    console.log(`Found ${entertainmentTabs.length} entertainment tabs matching domains:`, entertainmentDomains);
    
    if (entertainmentTabs.length === 0) {
      return { success: true, tabCount: 0 };
    }
    
    // Sort entertainment tabs alphabetically by URL
    entertainmentTabs.sort((a, b) => {
      const urlA = (a.url || '').toLowerCase();
      const urlB = (b.url || '').toLowerCase();
      return urlA.localeCompare(urlB);
    });
    
    // Create a new window with the first entertainment tab
    const newWindow = await browserAPI.windows.create({
      tabId: entertainmentTabs[0].id
    });
    
    console.log(`Created new window with ID ${newWindow.id} for entertainment tabs`);
    
    // Move the rest of the entertainment tabs to the new window
    for (let i = 1; i < entertainmentTabs.length; i++) {
      try {
        await browserAPI.tabs.move(entertainmentTabs[i].id, {
          windowId: newWindow.id,
          index: -1  // -1 means append to the end
        });
        // Small delay to avoid race conditions
        await new Promise(resolve => setTimeout(resolve, 15));
      } catch (error) {
        console.error(`Error moving tab ${entertainmentTabs[i].id}:`, error);
        // Continue with other tabs even if one fails
      }
    }
    
    console.log('Entertainment moving and sorting complete!');
    return { success: true, tabCount: entertainmentTabs.length };
    
  } catch (error) {
    console.error('Error moving entertainment tabs:', error);
    return { success: false, error: error.message };
  }
}

// Function to extract all Chordify tabs to a new window
async function extractChordifyTabs() {
  try {
    // Get all tabs from all windows
    const allTabs = await browserAPI.tabs.query({});
    
    // Helper function to extract domain from URL
    const extractDomain = (url) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
      } catch (error) {
        return null;
      }
    };
    
    // Filter for Chordify tabs with precise domain matching
    const chordifyTabs = allTabs.filter(tab => {
      const domain = extractDomain(tab.url);
      if (!domain) return false;
      
      // Match chordify.net and *.chordify.net
      return domain === 'chordify.net' || domain.endsWith('.chordify.net');
    });
    
    console.log(`Found ${chordifyTabs.length} Chordify tabs`);
    
    if (chordifyTabs.length === 0) {
      return { success: true, tabCount: 0 };
    }
    
    // Sort Chordify tabs alphabetically by URL
    chordifyTabs.sort((a, b) => {
      const urlA = (a.url || '').toLowerCase();
      const urlB = (b.url || '').toLowerCase();
      return urlA.localeCompare(urlB);
    });
    
    // Create a new window with the first Chordify tab
    const newWindow = await browserAPI.windows.create({
      tabId: chordifyTabs[0].id
    });
    
    console.log(`Created new window with ID ${newWindow.id}`);
    
    // Move the rest of the Chordify tabs to the new window in sorted order
    for (let i = 1; i < chordifyTabs.length; i++) {
      try {
        await browserAPI.tabs.move(chordifyTabs[i].id, {
          windowId: newWindow.id,
          index: -1  // -1 means append to the end
        });
        // Small delay to avoid race conditions
        await new Promise(resolve => setTimeout(resolve, 15));
      } catch (error) {
        console.error(`Error moving tab ${chordifyTabs[i].id}:`, error);
        // Continue with other tabs even if one fails
      }
    }
    
    console.log('Chordify extraction and sorting complete!');
    return { success: true, tabCount: chordifyTabs.length };
    
  } catch (error) {
    console.error('Error extracting Chordify tabs:', error);
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
  
  if (request.action === 'extractChordify') {
    console.log('Extract Chordify action requested');
    
    // Call the extract function and send response back
    extractChordifyTabs().then(result => {
      console.log('Sending result back:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('Error in message handler:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // IMPORTANT: Return true to indicate we'll send a response asynchronously
    return true;
  }
  
  if (request.action === 'moveEntertainment') {
    console.log('Move entertainment action requested with domains:', request.entertainmentDomains);
    
    // Call the move entertainment function and send response back
    moveEntertainmentTabs(request.entertainmentDomains).then(result => {
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