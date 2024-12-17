class TodoList {
    constructor() {
        this.todos = JSON.parse(localStorage.getItem('todos')) || [];
        this.initializeElements();
        this.attachEventListeners();
        this.initializeTabs();
        this.render();
    }

    // Cache DOM elements for better performance and organization
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

                // Handle different button clicks
                if (e.target.matches('.complete-btn')) {
                    this.toggleComplete(todoId);
                } else if (e.target.matches('.archive-btn')) {
                    this.toggleArchive(todoId);
                } else if (e.target.matches('.todo-text')) {
                    this.startEdit(todoId);
                }
            });
        });

        // Make lists sortable
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
            id: Date.now(),
            text,
            completed: false,
            archived: false,
            createdAt: new Date().toISOString(),
            archivedAt: null,
            order: this.todos.length
        };

        this.todos.push(todo);
        this.elements.newTodoInput.value = '';
        this.save();
    }

    toggleComplete(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.save();
        }
    }

    toggleArchive(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.archived = !todo.archived;
            todo.archivedAt = todo.archived ? new Date().toISOString() : null;
            this.save();
            this.render();
        }
    }

    startEdit(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        const element = document.querySelector(`[data-id="${id}"] .todo-text`);
        const currentText = todo.text;
        element.innerHTML = `
        <input type="text" class="form-control edit-todo" value="${currentText}">
      `;

        const input = element.querySelector('input');
        input.focus();

        input.addEventListener('blur keypress', (e) => {
            if (e.type === 'blur' || e.which === 13) {
                this.editTodo(id, input.value);
            }
        });
    }

    editTodo(id, newText) {
        const todo = this.todos.find(t => t.id === id);
        if (todo && newText.trim()) {
            todo.text = newText.trim();
            this.save();
        }
    }

    updateOrder() {
        const activeOrder = document.getElementById('active-todos').sortable('toArray', { attribute: 'data-id' });
        const archiveOrder = document.getElementById('archive-todos').sortable('toArray', { attribute: 'data-id' });

        [...activeOrder, ...archiveOrder].forEach((id, index) => {
            const todo = this.todos.find(t => t.id === parseInt(id));
            if (todo) todo.order = index;
        });

        this.save();
    }

    save() {
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
        // Sort todos by order
        const activeTodos = this.todos
            .filter(t => !t.archived)
            .sort((a, b) => a.order - b.order);

        const archivedTodos = this.todos
            .filter(t => t.archived)
            .sort((a, b) => a.order - b.order);

        // Render each list
        this.elements.activeList.innerHTML = activeTodos.map(todo => this.renderTodoItem(todo)).join('');
        this.elements.archiveList.innerHTML = archivedTodos.map(todo => this.renderTodoItem(todo)).join('');
    }

    renderTodoItem(todo) {
        return `
        <div class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
          <input type="checkbox" class="form-check-input" 
            ${todo.completed ? 'checked' : ''} 
            onchange="todoList.toggleComplete(${todo.id})">
          <span class="todo-text" onclick="todoList.startEdit(${todo.id})">${todo.text}</span>
          <span class="todo-date">
            ${this.formatDate(todo.createdAt)}
            ${todo.archivedAt ? `(Archived: ${this.formatDate(todo.archivedAt)})` : ''}
          </span>
          <div class="todo-actions">
            <button class="btn btn-sm btn-outline-secondary" onclick="todoList.toggleArchive(${todo.id})">
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

// Initialize TodoList
let todoList;
document.addEventListener('DOMContentLoaded', () => {
    todoList = new TodoList();
});