# Firefox Extension Installation Guide

## Installing Your Custom New Tab Extension

### Method 1: Temporary Installation (For Development/Testing)

1. **Open Firefox** and navigate to `about:debugging`

2. **Click "This Firefox"** in the left sidebar

3. **Click "Load Temporary Add-on"** button

4. **Navigate to your extension folder** (`D:\proj\mynewtab`)

5. **Select the `manifest.json` file** and click "Open"

6. **Your extension is now loaded!** Open a new tab to see your custom new tab page.

**Note:** Temporary installations are removed when Firefox is closed.

### Method 2: Permanent Installation (Unsigned - Firefox Developer Edition/Nightly)

1. **Install Firefox Developer Edition** or Firefox Nightly (these allow unsigned extensions)

2. **Open Firefox** and go to `about:config`

3. **Search for** `xpinstall.signatures.required`

4. **Set it to `false`** (double-click to toggle)

5. **Package your extension:**
   - Open PowerShell in your extension directory
   - Run: `Compress-Archive -Path * -DestinationPath custom-newtab.zip`

6. **Install the extension:**
   - Go to `about:addons`
   - Click the gear icon and select "Install Add-on From File"
   - Select your `custom-newtab.zip` file

### Method 3: Using web-ext Tool (Recommended for Development)

1. **Install Node.js** from [nodejs.org](https://nodejs.org/)

2. **Install web-ext globally:**
   ```powershell
   npm install --global web-ext
   ```

3. **Run the extension in development mode:**
   ```powershell
   web-ext run
   ```
   This opens a new Firefox window with your extension loaded.

4. **Build the extension:**
   ```powershell
   web-ext build
   ```
   This creates a `.zip` file in the `web-ext-artifacts` folder.

## Features

Your custom new tab extension includes:

- ✅ **Custom New Tab Page** - Replaces Firefox's default new tab
- ✅ **Quick Links** - Organized categories with your favorite sites (Unicode emojis)
- ✅ **Todo List** - Local todo management with drag-and-drop, export/import backup functionality
- ✅ **Time Display** - Real-time clock and date in 24-hour format
- ✅ **Stopwatch** - Built-in timing functionality with pause/resume
- ✅ **Smart Tab Sorting** - Prioritizes tabs with audio, then custom domains, then alphabetically
- ✅ **Google Search** - Quick search integration
- ✅ **Local Storage** - All data stored locally (localStorage)
- ✅ **Dual Configuration** - Supports both `links.json` (default) and `personal-config.json` (preferred)
- ✅ **CDN Dependencies** - jQuery, jQuery-UI, Bootstrap, and Sortable loaded from CDNs

## Troubleshooting

### Extension Not Loading
- Ensure all files are in the correct directory
- Check Firefox Developer Console (F12) for errors
- Verify `manifest.json` is valid JSON

### Icons Not Showing
- Icons use Unicode emojis (🤖, 💬, ⭐, etc.)
- Emojis should work automatically with system fonts
- If emojis don't display properly, check your operating system's font support

### Tab Sorting Not Working
- Verify the extension has "tabs" permission in `manifest.json`
- Check that the background script is loaded properly
- Tab sorting prioritizes: 1) Tabs with audio, 2) MegaPriority domains, 3) Alphabetically by URL
- MegaPriority domains are configured in `background.js` (hardcoded) and optionally in `personal-config.json`

### Todo List Not Saving
- Ensure localStorage is enabled in Firefox
- Check browser console for JavaScript errors
- Use Export/Import buttons at the bottom of the todo section to backup/restore todos
- Export creates a timestamped JSON backup file
- Import allows you to restore from a previously exported backup file

## Development

To modify the extension:

1. **Edit files** in the extension directory
2. **Reload the extension** in `about:debugging` (click "Reload")
3. **Test changes** by opening a new tab

## File Structure

```
mynewtab/
├── manifest.json          # Extension configuration
├── newtab.html           # Main new tab page
├── newtab.js             # Core functionality
├── todo.js               # Todo list functionality
├── background.js         # Background script for tab sorting
├── styles.css            # Custom styles
├── bootstrap.min.css     # Bootstrap CSS (local)
├── links.json            # Default link categories (Unicode emojis)
├── personal-config.json  # Personal link configuration (Unicode emojis)
├── mynewtab.xpi          # Packaged extension file
└── chrome-extension/     # Chrome variant (if applicable)
    ├── links.json
    └── personal-config.json
```

**Note:** JavaScript dependencies (jQuery, jQuery-UI, Bootstrap JS, Sortable) are loaded from CDNs in `newtab.html`, not stored locally.

## Customization

### Configuration Priority

The extension loads configuration files in the following order:
1. **`personal-config.json`** (if exists) - Your personal configuration (preferred)
2. **`links.json`** (fallback) - Default configuration

This allows you to keep your personal settings separate from the default configuration.

### Adding Links

Edit `links.json` or create/edit `personal-config.json` with your categories and links.

**Example configuration:**
```json
{
  "categories": [
    {
      "name": "Your Category",
      "order": 1,
      "emoji": "⭐",
      "links": [
        {
          "name": "Example",
          "href": "https://example.com",
          "category": "Your Category",
          "emoji": "🔗"
        }
      ]
    }
  ]
}
```

All icons use simple Unicode emojis - no external icon libraries needed!

**Priority Tab Sorting** (in `personal-config.json`):
You can also add a `megaPriority` array to prioritize certain domains when sorting tabs:
```json
{
  "megaPriority": [
    "mail.google.com",
    "calendar.google.com",
    "chatgpt.com"
  ],
  "categories": [ ... ]
}
```

### Tab Sorting Priority

To customize which domains get priority when sorting tabs, you have two options:

**Option 1: Edit `background.js` (Hardcoded Priority)**
Modify the `megaPriority` array around line 15:
```javascript
const megaPriority = [
  'mail.google.com',
  'calendar.google.com',
  'chatgpt.com',
  // Add your preferred domains here
];
```

**Option 2: Use `personal-config.json` (Optional, Not Currently Implemented)**
Add a `megaPriority` array to your config file (note: this requires the background script to load and use this config, which is not currently implemented):
```json
{
  "megaPriority": [
    "mail.google.com",
    "chatgpt.com"
  ],
  "categories": [ ... ]
}
```

**Tab Sorting Order:**
1. Tabs with audio playing (highest priority)
2. MegaPriority domains (in order specified)
3. All other tabs alphabetically by URL

### Styling
Modify `styles.css` to customize the appearance of your new tab page.

### Stopwatch Usage
- Click "Start Stopwatch" to begin timing
- Use "Pause" to pause/resume
- Use "Stop" to reset the stopwatch
- Stopwatch displays time in `Xm XXs` format

### Todo List Features
- Add tasks with the input field at the bottom
- Click on task text to edit inline
- Drag and drop to reorder tasks
- Archive completed tasks to keep active list clean
- Export todos to JSON backup file (includes timestamp)
- Import previously exported todos
- All changes sync across open tabs via localStorage events

## Support

If you encounter issues:
1. Check the Firefox Developer Console (F12) for errors
2. Verify all files are present and correctly named
3. Ensure Firefox allows the required permissions
