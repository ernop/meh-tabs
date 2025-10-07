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

### User Interface
- Clean, modern Bootstrap-based design
- Separate tabs for active and archived todos
- Responsive layout
- Real-time clock and date display
- Quick Google search integration
- Organized category-based bookmarks

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
1. Todo Management (todo.js)
2. New Tab Interface (newtab.js)
3. Link Categories (links.json)
4. Styling (styles.css)

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
   ```

2. **Fallback Behavior**:
   - If `personal-config.json` exists, it will be used for both links and tab sorting priorities
   - If not found, the extension falls back to the default `links.json` configuration
   - This allows sharing the extension publicly while keeping personal data private

3. **Git Integration**:
   - `personal-config.json` is automatically ignored by git (added to `.gitignore`)
   - The default `links.json` contains example links safe for public sharing

## Technical Requirements
- Modern browser with localStorage support
- Bootstrap 5.x
- SortableJS library
- FontAwesome icons

## Browser Support
- Firefox (primary)
- Chrome/Chromium-based browsers