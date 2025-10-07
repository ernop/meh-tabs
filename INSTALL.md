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
- ✅ **Quick Links** - Organized categories with your favorite sites
- ✅ **Todo List** - Local todo management with drag-and-drop
- ✅ **Time Display** - Real-time clock and date
- ✅ **Stopwatch** - Built-in timing functionality
- ✅ **Tab Sorting** - Alphabetical tab organization
- ✅ **Google Search** - Quick search integration
- ✅ **Local Storage** - All data stored locally, no external dependencies

## Troubleshooting

### Extension Not Loading
- Ensure all files are in the correct directory
- Check Firefox Developer Console (F12) for errors
- Verify `manifest.json` is valid JSON

### Icons Not Showing
- Icons are now Unicode emojis (should work automatically)
- If emojis don't show, check your system font support

### Tab Sorting Not Working
- Verify the extension has "tabs" permission in `manifest.json`
- Check that the background script is loaded properly

### Todo List Not Saving
- Ensure localStorage is enabled in Firefox
- Check browser console for JavaScript errors

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
├── bootstrap.min.css     # Bootstrap CSS
├── links.json            # Default link categories
├── personal-config.json  # Personal link configuration
└── lib/                  # Local dependencies
    ├── jquery-3.6.0.min.js
    ├── jquery-ui.min.js
    ├── bootstrap.bundle.min.js
    ├── sortable.min.js
```

## Customization

### Adding Links
Edit `links.json` or create `personal-config.json` with your categories and links:

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

### Styling
Modify `styles.css` to customize the appearance of your new tab page.

## Support

If you encounter issues:
1. Check the Firefox Developer Console (F12) for errors
2. Verify all files are present and correctly named
3. Ensure Firefox allows the required permissions
