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

// Deduplicate tabs by URL - closes duplicates, keeps the first occurrence
// Returns array of remaining tabs after deduplication
async function deduplicateTabs(tabs) {
  const seen = new Map(); // canonical URL -> first tab with this URL
  const duplicatesToClose = [];
  
  for (const tab of tabs) {
    const canonical = getCanonicalUrl(tab.url);
    
    if (seen.has(canonical)) {
      // This is a duplicate - mark for closing
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

// Shared priority config used by sorting
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

// Check if URL is a file:// URL
const isFileUrl = (url) => {
  return url && url.toLowerCase().startsWith('file://');
};

// Sort comparator for tabs
// Priority order: mega-priority sites > file:// URLs > regular URLs
// Within each group: audio tabs first, then alphabetically
function tabSortComparator(a, b) {
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
  
  // Check for file:// URLs - they go after mega-priority but before regular URLs
  const fileA = isFileUrl(urlA);
  const fileB = isFileUrl(urlB);
  
  if (fileA !== fileB) {
    return fileA ? -1 : 1; // file:// URLs come first
  }
  
  // Both are regular tabs (no mega-priority, same file:// status)
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
}

// Function to sort tabs alphabetically by URL
// Consolidates ALL tabs from ALL windows into two windows:
// - Main window: non-entertainment tabs
// - Entertainment window: entertainment tabs (minimized)
async function sortTabsAlphabetically(entertainmentDomains = []) {
  
  try {
    // Get ALL tabs from ALL windows
    const allTabs = await browserAPI.tabs.query({});
    
    // Deduplicate tabs first
    const tabs = await deduplicateTabs(allTabs);
    const duplicatesClosed = allTabs.length - tabs.length;
    
    // Helper to check if a tab is entertainment
    const extractDomain = (url) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
      } catch (error) {
        return null;
      }
    };
    
    const isEntertainment = (tab) => {
      if (entertainmentDomains.length === 0) return false;
      const domain = extractDomain(tab.url);
      if (!domain) return false;
      return entertainmentDomains.some(entertainmentDomain => {
        if (domain === entertainmentDomain) return true;
        if (domain.endsWith('.' + entertainmentDomain)) return true;
        return false;
      });
    };
    
    // Separate entertainment from regular tabs
    const entertainmentTabs = tabs.filter(tab => isEntertainment(tab));
    const regularTabs = tabs.filter(tab => !isEntertainment(tab));
    
    // Sort both lists
    entertainmentTabs.sort(tabSortComparator);
    regularTabs.sort(tabSortComparator);
    
    console.log(`Sorting: ${regularTabs.length} regular tabs, ${entertainmentTabs.length} entertainment tabs`);
    
    // Get current window to use as main window
    const currentWindow = await browserAPI.windows.getCurrent();
    const mainWindowId = currentWindow.id;
    
    // Move all regular tabs to current window and sort them
    for (let targetIndex = 0; targetIndex < regularTabs.length; targetIndex++) {
      const tab = regularTabs[targetIndex];
      try {
        // Move to main window at the correct position
        await browserAPI.tabs.move(tab.id, { 
          windowId: mainWindowId, 
          index: targetIndex 
        });
        await new Promise(resolve => setTimeout(resolve, 15));
      } catch (error) {
        console.error(`Error moving tab ${tab.id} to main window:`, error);
      }
    }
    
    // Handle entertainment tabs - create new window or use existing one
    let entertainmentWindowId = null;
    if (entertainmentTabs.length > 0) {
      // Create new window with first entertainment tab
      const newWindow = await browserAPI.windows.create({
        tabId: entertainmentTabs[0].id
      });
      entertainmentWindowId = newWindow.id;
      
      // Move rest of entertainment tabs to the new window
      for (let i = 1; i < entertainmentTabs.length; i++) {
        try {
          await browserAPI.tabs.move(entertainmentTabs[i].id, {
            windowId: entertainmentWindowId,
            index: i
          });
          await new Promise(resolve => setTimeout(resolve, 15));
        } catch (error) {
          console.error(`Error moving entertainment tab ${entertainmentTabs[i].id}:`, error);
        }
      }
      
      // Minimize the entertainment window
      try {
        await browserAPI.windows.update(entertainmentWindowId, { state: 'minimized' });
        console.log(`Minimized entertainment window ${entertainmentWindowId}`);
      } catch (error) {
        console.error(`Error minimizing entertainment window:`, error);
      }
    }
    
    // Close any now-empty windows (except main and entertainment windows)
    const allWindows = await browserAPI.windows.getAll({ populate: true });
    for (const win of allWindows) {
      if (win.id !== mainWindowId && win.id !== entertainmentWindowId) {
        // Check if window has any tabs left
        if (win.tabs.length === 0) {
          try {
            await browserAPI.windows.remove(win.id);
            console.log(`Closed empty window ${win.id}`);
          } catch (error) {
            console.error(`Error closing empty window ${win.id}:`, error);
          }
        }
      }
    }
    
    console.log(`Sorting complete! ${duplicatesClosed} duplicates closed.`);
    return { 
      success: true, 
      tabCount: tabs.length, 
      duplicatesClosed: duplicatesClosed,
      regularCount: regularTabs.length,
      entertainmentCount: entertainmentTabs.length
    };
    
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
    let entertainmentTabs = allTabs.filter(tab => {
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
      return { success: true, tabCount: 0, duplicatesClosed: 0 };
    }
    
    // Deduplicate entertainment tabs before moving
    const originalCount = entertainmentTabs.length;
    entertainmentTabs = await deduplicateTabs(entertainmentTabs);
    const duplicatesClosed = originalCount - entertainmentTabs.length;
    
    if (entertainmentTabs.length === 0) {
      return { success: true, tabCount: 0, duplicatesClosed: duplicatesClosed };
    }
    
    // Sort entertainment tabs using the shared comparator
    entertainmentTabs.sort(tabSortComparator);
    
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
    
    // Minimize the new entertainment window
    try {
      await browserAPI.windows.update(newWindow.id, { state: 'minimized' });
      console.log(`Minimized entertainment window ${newWindow.id}`);
    } catch (error) {
      console.error(`Error minimizing window ${newWindow.id}:`, error);
      // Don't fail the whole operation if minimizing fails
    }
    
    console.log('Entertainment moving and sorting complete!');
    return { success: true, tabCount: entertainmentTabs.length, duplicatesClosed: duplicatesClosed };
    
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
    let chordifyTabs = allTabs.filter(tab => {
      const domain = extractDomain(tab.url);
      if (!domain) return false;
      
      // Match chordify.net and *.chordify.net
      return domain === 'chordify.net' || domain.endsWith('.chordify.net');
    });
    
    console.log(`Found ${chordifyTabs.length} Chordify tabs`);
    
    if (chordifyTabs.length === 0) {
      return { success: true, tabCount: 0, duplicatesClosed: 0 };
    }
    
    // Deduplicate Chordify tabs
    const originalCount = chordifyTabs.length;
    chordifyTabs = await deduplicateTabs(chordifyTabs);
    const duplicatesClosed = originalCount - chordifyTabs.length;
    
    if (chordifyTabs.length === 0) {
      return { success: true, tabCount: 0, duplicatesClosed: duplicatesClosed };
    }
    
    // Sort Chordify tabs alphabetically by URL
    chordifyTabs.sort(tabSortComparator);
    
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
    return { success: true, tabCount: chordifyTabs.length, duplicatesClosed: duplicatesClosed };
    
  } catch (error) {
    console.error('Error extracting Chordify tabs:', error);
    return { success: false, error: error.message };
  }
}

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