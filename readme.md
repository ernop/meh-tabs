# Firefox New Tab Extension

Replace your default Firefox new tab page with a custom implementation featuring:
- Quick access to favorite links organized by category
- Real-time clock and date display
- Built-in stopwatch
- Todo list with task management
- Tab sorting functionality
- Google search integration

## Installation

### Signed Extension (Recommended)
The extension is signed and unlisted on AMO. Download the XPI from your developer dashboard:
1. Go to https://addons.mozilla.org/developers/addons
2. Click "Custom New Tab" > "Manage Status & Versions"
3. Download the latest signed XPI
4. In Firefox: `about:addons` > gear icon > "Install Add-on From File"

### Personal Configuration
1. Copy `links.json.example` to `personal-config.json`
2. Edit with your links and categories
3. The file is gitignored (won't be committed)

## Updating the Extension

After making code changes:
```powershell
cd D:\proj\mybrowser\browser\mynewtab
.\build-and-sign.ps1 -BumpVersion patch   # 1.0.1 -> 1.0.2
```
Then in Firefox: `about:addons` > gear icon > "Check for Updates"

### Build Script Options
```powershell
.\build-and-sign.ps1                      # Build current version
.\build-and-sign.ps1 -BumpVersion patch   # Bump patch (1.0.0 -> 1.0.1)
.\build-and-sign.ps1 -BumpVersion minor   # Bump minor (1.0.0 -> 1.1.0)
```

### Requirements
- `npm install -g web-ext`
- `amo-credentials.local` file with AMO API keys (gitignored)

## Configuration

### Personal Configuration File

The extension looks for `personal-config.json` first, then falls back to `links.json` if not found. This allows you to:
- Keep your personal links and URLs private
- Share the extension code publicly without exposing personal data
- Have different configs for different environments

### Configuration Structure

```json
{
    "megaPriority": [
        "domain1.com",
        "domain2.com"
    ],
    "categories": [
        {
            "name": "Category Name",
            "order": 1,
            "emoji": "fa-solid fa-icon-name",
            "links": [
                {
                    "name": "Link Name",
                    "href": "https://example.com",
                    "category": "Category Name",
                    "emoji": "fa-solid fa-icon-name"
                }
            ]
        }
    ]
}
```

- **megaPriority**: List of domains for tab sorting (highest priority domains listed first)
- **categories**: Array of link categories
  - **order**: Determines display order (lower numbers appear first)
  - **emoji**: FontAwesome class or emoji character
  - **links**: Array of links within the category

## Features

### Quick Links
- Organized by customizable categories
- Visual emoji icons for easy recognition
- Card-based layout for clean appearance

### Time & Date
- Real-time clock with AM/PM indicator
- Current day, month, and date display

### Stopwatch
- Start, pause, resume, and stop functionality
- Displays time in minutes and seconds

### Todo List
- Add, complete, and archive tasks
- Drag-and-drop reordering
- Export/import functionality for backup
- Persistent storage using browser's local storage

### Tab Sorting
- Sort all open tabs alphabetically
- Prioritizes specific domains (from megaPriority list)

### Search
- Quick Google search directly from the new tab page

## Development

### File Structure
```
/
├── newtab.html           # Main page template
├── newtab.js             # Core functionality
├── todo.js               # Todo list implementation
├── background.js         # Background script for tab management
├── styles.css            # Custom styles
├── manifest.json         # Extension configuration
├── bootstrap.min.css     # Bootstrap framework
├── links.json.example    # Example configuration (public)
└── personal-config.json  # Your personal config (gitignored)
```

### Security
- Follows Firefox extension security policies
- No inline CSS or onclick handlers
- Content Security Policy compliant

## Browser Compatibility

- **Primary**: Firefox (manifest v2)
- **Note**: Chrome support available via `chrome-extension/` directory

## Privacy

- All data stored locally in your browser
- No external tracking or analytics
- Personal configuration files are gitignored
- Safe to fork and share publicly

## License

Free to use and modify for personal use.
