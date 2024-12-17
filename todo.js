class TodoList {
    constructor() {
        this.tabId = this.generateTabId();
        this.todos = this.loadTodos();
        this.initializeElements();
        this.attachEventListeners();
        this.initializeTabs();
        this.render();

        // Debounce storage events
        this.handleStorageChange = this.debounce((e) => {
            if (e.key === 'todos') {
                this.mergeTodos(JSON.parse(e.newValue || '[]'));
                this.render();
            }
        }, 50);

        window.addEventListener('storage', this.handleStorageChange);
    }

    generateTabId() {
        return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    loadTodos() {
        try {
            return JSON.parse(localStorage.getItem('todos')) || [];
        } catch (e) {
            console.error('Error loading todos:', e);
            return [];
        }
    }

    mergeTodos(otherTodos) {
        const todoMap = new Map(this.todos.map(todo => [todo.id, todo]));

        otherTodos.forEach(otherTodo => {
            const existingTodo = todoMap.get(otherTodo.id);

            if (!existingTodo) {
                todoMap.set(otherTodo.id, otherTodo);
            } else {
                const isNewer =
                    otherTodo.lastModified > existingTodo.lastModified ||
                    (otherTodo.lastModified === existingTodo.lastModified &&
                        otherTodo.sequence > existingTodo.sequence);

                if (isNewer) {
                    todoMap.set(otherTodo.id, otherTodo);
                }
            }
        });

        this.todos = Array.from(todoMap.values())
            .sort((a, b) => a.order - b.order);
    }

    initializeElements() {
        this.elements = {
            addButton: document.getElementById('add-todo'),
            newTodoInput: document.getElementById('new-todo'),
            activeList: document.getElementById('active-todos'),
            archiveList: document.getElementById('archive-todos'),
            exportButton: document.getElementById('export-todos'),
            importButton: document.getElementById('import-todos'),
            importFileInput: document.getElementById('import-file-input')
        };
    }

    attachEventListeners() {
        // Add todo events
        this.elements.addButton.addEventListener('click', () => this.addTodo());
        this.elements.newTodoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTodo();
        });

        // Delegate events for the todo lists
        ['activeList', 'archiveList'].forEach(listName => {
            this.elements[listName].addEventListener('click', (e) => {
                const todoItem = e.target.closest('.todo-item');
                if (!todoItem) return;
                const todoId = todoItem.dataset.id; // Use directly, don't parse

                if (e.target.matches('.complete-btn')) {
                    this.toggleComplete(todoId);
                } else if (e.target.matches('.archive-btn')) {
                    this.toggleArchive(todoId);
                } else if (e.target.matches('.todo-text')) {
                    this.startEdit(todoId);
                }
            });
        });

        // Sortable initialization
        this.initializeSortable();

        // Export/Import event listeners
        this.elements.exportButton.addEventListener('click', () => this.exportTodos());
        this.elements.importButton.addEventListener('click', () => this.elements.importFileInput.click());
        this.elements.importFileInput.addEventListener('change', (e) => this.handleImportFile(e));
    }

    initializeSortable() {
        const sortableOptions = {
            group: 'todos',
            animation: 150,
            onEnd: () => {
                const activeOrder = Array.from(this.elements.activeList.children).map(el => el.dataset.id);
                const archiveOrder = Array.from(this.elements.archiveList.children).map(el => el.dataset.id);

                [...activeOrder, ...archiveOrder].forEach((id, index) => {
                    const todo = this.todos.find(t => t.id === id);
                    if (todo) {
                        todo.order = index;
                    }
                });

                this.save();
                this.render();
            }
        };

        ['activeList', 'archiveList'].forEach(listName => {
            Sortable.create(this.elements[listName], sortableOptions);
        });
    }

    addTodo() {
        const text = this.elements.newTodoInput.value.trim();
        if (!text) return;

        const seq = parseInt(localStorage.getItem('todoSequence') || '0');
        localStorage.setItem('todoSequence', (seq + 1).toString());

        const todo = {
            id: `${this.tabId}_${Date.now()}`,
            text,
            completed: false,
            archived: false,
            createdAt: new Date().toISOString(),
            archivedAt: null,
            order: this.todos.length,
            lastModified: Date.now(),
            sequence: seq + 1
        };

        this.todos.push(todo);
        this.elements.newTodoInput.value = '';
        this.save();
        this.render();
    }

    toggleComplete(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            todo.lastModified = Date.now();
            this.save();
            this.render();
        }
    }

    toggleArchive(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.archived = !todo.archived;
            todo.archivedAt = todo.archived ? new Date().toISOString() : null;
            todo.lastModified = Date.now();
            this.save();
            this.render();
        }
    }

    startEdit(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        const element = document.querySelector(`[data-id="${id}"] .todo-text`);
        const currentText = todo.text;
        element.innerHTML = `<input type="text" class="form-control edit-todo" value="${currentText}">`;

        const input = element.querySelector('input');
        input.focus();

        input.addEventListener('blur', () => {
            this.editTodo(id, input.value);
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.editTodo(id, input.value);
            }
        });
    }

    editTodo(id, newText) {
        const todo = this.todos.find(t => t.id === id);
        if (todo && newText.trim()) {
            todo.text = newText.trim();
            todo.lastModified = Date.now();
            this.save();
            this.render();
        } else {
            this.render();
        }
    }

    save() {
        try {
            const seq = parseInt(localStorage.getItem('todoSequence') || '0');

            // Ensure sequence and lastModified are set
            this.todos.forEach(todo => {
                if (typeof todo.sequence === 'undefined') {
                    todo.sequence = seq;
                }
                if (!todo.lastModified) {
                    todo.lastModified = Date.now();
                }
            });

            localStorage.setItem('todos', JSON.stringify(this.todos));
        } catch (e) {
            console.error('Error saving todos:', e);
        }
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    render() {
        const activeTodos = this.todos
            .filter(t => !t.archived)
            .sort((a, b) => a.order - b.order);

        const archivedTodos = this.todos
            .filter(t => t.archived)
            .sort((a, b) => a.order - b.order);

        this.elements.activeList.innerHTML = activeTodos.map(todo => this.renderTodoItem(todo)).join('');
        this.elements.archiveList.innerHTML = archivedTodos.map(todo => this.renderTodoItem(todo)).join('');
    }

    renderTodoItem(todo) {
        return `
        <div class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
          <input type="checkbox" class="form-check-input complete-btn" ${todo.completed ? 'checked' : ''}>
          <span class="todo-text">${todo.text}</span>
          <span class="todo-date">
            ${this.formatDate(todo.createdAt)}
            ${todo.archivedAt ? `(Archived: ${this.formatDate(todo.archivedAt)})` : ''}
          </span>
          <div class="todo-actions">
            <button class="btn btn-sm btn-outline-secondary archive-btn">
              ${todo.archived ? 'Unarchive' : 'Archive'}
            </button>
          </div>
        </div>
      `;
    }

    initializeTabs() {
        const tabElements = document.querySelectorAll('[data-bs-toggle="tab"]');
        tabElements.forEach(tab => {
            new bootstrap.Tab(tab);
        });
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // -------------------------
    // Export/Import Methods
    // -------------------------

    exportTodos() {
        const data = {
            todos: this.todos,
            todoSequence: localStorage.getItem('todoSequence') || '0'
        };
        const jsonStr = JSON.stringify(data, null, 2);

        // Create a downloadable blob
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create a temporary link and trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = `todos_backup_${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleImportFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);

                if (!importedData.todos || !Array.isArray(importedData.todos)) {
                    alert('Invalid backup file: missing todos array.');
                    return;
                }

                // Replace local storage data
                localStorage.setItem('todos', JSON.stringify(importedData.todos));
                if (importedData.todoSequence) {
                    localStorage.setItem('todoSequence', importedData.todoSequence.toString());
                }

                // Reload the todos from storage
                this.todos = this.loadTodos();
                this.render();
                alert('Todos successfully imported!');
            } catch (error) {
                console.error('Error importing todos:', error);
                alert('Error reading or parsing the backup file.');
            }
        };

        reader.readAsText(file);
    }
}

let todoList;
document.addEventListener('DOMContentLoaded', () => {
    todoList = new TodoList();
});
