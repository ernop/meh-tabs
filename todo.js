class TodoList {
    constructor() {
        this.tabId = this.generateTabId();
        this.todos = this.loadTodos();
        this.initializeElements();
        this.attachEventListeners();
        this.initializeTabs();
        this.render();
        
        // Listen for changes from other tabs
        window.addEventListener('storage', (e) => {
            if (e.key === 'todos') {
                this.mergeTodos(JSON.parse(e.newValue || '[]'));
                this.render();
            }
        });
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
        // Create a map of existing todos for quick lookup
        const todoMap = new Map(this.todos.map(todo => [todo.id, todo]));
        
        // Merge or update todos
        otherTodos.forEach(otherTodo => {
            const existingTodo = todoMap.get(otherTodo.id);
            
            if (!existingTodo) {
                // New todo from another tab
                todoMap.set(otherTodo.id, otherTodo);
            } else {
                // Update existing todo if the other version is newer
                if (otherTodo.lastModified > (existingTodo.lastModified || 0)) {
                    todoMap.set(otherTodo.id, otherTodo);
                }
            }
        });

        this.todos = Array.from(todoMap.values())
            .sort((a, b) => a.order - b.order);
    }

    // Cache DOM elements
    initializeElements() {
        this.elements = {
            addButton: document.getElementById('add-todo'),
            newTodoInput: document.getElementById('new-todo'),
            activeList: document.getElementById('active-todos'),
            archiveList: document.getElementById('archive-todos')
        };
    }

    // Central place for all event listeners
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
                const todoId = parseInt(todoItem.dataset.id);

                if (e.target.matches('.complete-btn')) {
                    this.toggleComplete(todoId);
                } else if (e.target.matches('.archive-btn')) {
                    this.toggleArchive(todoId);
                } else if (e.target.matches('.todo-text')) {
                    this.startEdit(todoId);
                }
            });
        });

        this.initializeSortable();
    }

    initializeSortable() {
        const sortableOptions = {
            group: 'todos',
            animation: 150,
            onEnd: () => {
                const activeOrder = Array.from(this.elements.activeList.children).map(el => el.dataset.id);
                const archiveOrder = Array.from(this.elements.archiveList.children).map(el => el.dataset.id);

                [...activeOrder, ...archiveOrder].forEach((id, index) => {
                    const todo = this.todos.find(t => t.id === parseInt(id));
                    if (todo) todo.order = index;
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

        const todo = {
            id: `${this.tabId}_${Date.now()}`,
            text,
            completed: false,
            archived: false,
            createdAt: new Date().toISOString(),
            archivedAt: null,
            order: this.todos.length,
            lastModified: Date.now()
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
        // Update lastModified when saving
        this.todos.forEach(todo => {
            if (!todo.lastModified) {
                todo.lastModified = Date.now();
            }
        });
        
        localStorage.setItem('todos', JSON.stringify(this.todos));
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
}

let todoList;
document.addEventListener('DOMContentLoaded', () => {
    todoList = new TodoList();
});
