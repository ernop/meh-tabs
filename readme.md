# Todo List Extension for New Tab



## Overview
This is a Firefox/Chrome extension that replaces the default new tab page with a custom implementation featuring a sophisticated todo list manager, clock display, and quick links organization.

## Core Features

### Todo List Management
- Create, edit, and delete todo items
- Mark todos as complete/incomplete
- Archive/unarchive functionality
- Drag-and-drop reordering of items
- Persistent storage using localStorage
- Real-time synchronization across browser tabs
- Export todos to JSON backup file (with timestamps)
- Import todos from previously exported backups

### User Interface
- Clean, modern Bootstrap-based design
- Separate tabs for active and archived todos
- Responsive layout
- Real-time clock and date display (24-hour format)
- Built-in stopwatch with pause/resume functionality
- Quick Google search integration
- Organized category-based bookmarks with Unicode emojis
- Smart tab sorting (audio tabs, priority domains, then alphabetical)

## Technical Implementation

### Data Storage
- Uses browser's localStorage for todo persistence
- Implements conflict resolution for multi-tab editing
- Maintains item ordering through sequence numbers
- Stores metadata including:
  - Creation timestamps
  - Last modified dates
  - Archive dates
  - Completion status

### Synchronization
The program handles multi-tab synchronization through:
- Storage event listeners
- Debounced updates to prevent race conditions
- Timestamp-based conflict resolution
- Unique tab IDs for operation tracking

### Code Organization
The application is split into several key components:
1. **Todo Management** (`todo.js`) - TodoList class with drag-drop, export/import
2. **New Tab Interface** (`newtab.js`) - Clock, stopwatch, links, search
3. **Background Script** (`background.js`) - Tab sorting with priority handling
4. **Link Categories** (`links.json`) - Default configuration with Unicode emojis
5. **Personal Config** (`personal-config.json`) - Personal configuration with Unicode emojis
6. **Styling** (`styles.css` + `bootstrap.min.css`) - Custom and Bootstrap styles

## Key Methods

### Todo Management

### UI Components
- Sortable drag-and-drop interface
- Inline editing of todo items
- Tab-based navigation between active/archived items
- Category-based bookmark organization

## Usage

### Adding Todos
1. Type task in the input field
2. Press Enter or click "Add" button

### Managing Todos
- Click checkbox to complete
- Click text to edit
- Use Archive button to move to archive
- Drag and drop to reorder

### Categories and Bookmarks
- Organized in collapsible sections
- Quick access to frequently used links
- Customizable through links.json

### Personal Configuration

The extension supports personal configuration to keep your private links and tab sorting preferences separate from the public codebase:

1. **Create `personal-config.json`** (optional):
   ```json
   {
     "megaPriority": [
       "mail.google.com",
       "calendar.google.com",
       "your-favorite-sites.com"
     ],
     "categories": [
       {
         "name": "Your Category",
         "order": 1,
         "emoji": "⭐",
         "links": [
           {
             "name": "Your Link",
             "href": "https://your-site.com",
             "category": "Your Category",
             "emoji": "🔗"
           }
         ]
       }
     ]
   }

2. **Fallback Behavior**:
   - If `personal-config.json` exists, it will be used for both links and tab sorting priorities
   - If not found, the extension falls back to the default `links.json` configuration
   - This allows sharing the extension publicly while keeping personal data private

3. **Git Integration**:
   - `personal-config.json` is automatically ignored by git (added to `.gitignore`)
   - The default `links.json` contains example links safe for public sharing

## Technical Requirements
- Modern browser with localStorage support
- Firefox (primary) or Chrome/Chromium-based browsers
- Dependencies loaded from CDN:
  - jQuery 3.6.0
  - jQuery UI 1.12.1
  - Bootstrap 5.1.3 (JS and CSS)
  - SortableJS 1.15.0

## Browser Support
- Firefox (primary)
- Chrome/Chromium-based browsers