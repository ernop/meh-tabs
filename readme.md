# Firefox New Tab Extension

Replace your default Firefox new tab page with a custom implementation featuring:
- Quick access to favorite links organized by category
- Real-time clock and date display
- Built-in stopwatch
- Todo list with task management
- Tab sorting functionality
- Google search integration

## Installation

1. **Clone or download this repository**

2. **Set up your personal configuration** (first-time setup):
   ```bash
   # Copy the example files to create your personal config
   cp links.json.example personal-config.json
   # OR for Chrome extension directory:
   cp chrome-extension/links.json.example chrome-extension/personal-config.json
   ```

3. **Customize your links**:
   - Edit `personal-config.json` with your favorite links, categories, and personal URLs
   - The file is gitignored so your personal data won't be committed
   - See the example files for the structure

4. **Load the extension in Firefox**:
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Navigate to the extension directory and select `manifest.json`

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
