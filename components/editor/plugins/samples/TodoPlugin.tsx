import React, { useState, useEffect } from 'react';
import { EditorPlugin, EditorPluginProps } from '../types';
import { pluginRegistry } from '../registry';
import { CheckSquare, Plus, Trash2, X } from 'lucide-react';

interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
}

const STORAGE_KEY_PREFIX = 'labflow_todo_';

export function TodoPlugin({ projectId, onClose }: EditorPluginProps) {
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [inputValue, setInputValue] = useState('');

    // Load from local storage on mount (simulating persistence)
    useEffect(() => {
        const key = STORAGE_KEY_PREFIX + projectId;
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setTimeout(() => setTodos(parsed), 0);
            } catch (e) {
                console.error('Failed to parse todos', e);
            }
        }
    }, [projectId]);

    // Save to local storage on change
    useEffect(() => {
        const key = STORAGE_KEY_PREFIX + projectId;
        localStorage.setItem(key, JSON.stringify(todos));
    }, [todos, projectId]);

    const addTodo = () => {
        if (!inputValue.trim()) return;
        setTodos([
            ...todos,
            { id: Date.now().toString(), text: inputValue.trim(), completed: false },
        ]);
        setInputValue('');
    };

    const toggleTodo = (id: string) => {
        setTodos(
            todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
        );
    };

    const deleteTodo = (id: string) => {
        setTodos(todos.filter((t) => t.id !== id));
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-medium">
                    <CheckSquare className="w-4 h-4 text-green-500" />
                    待办事项
                </div>
                <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                    <X size={18} />
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {todos.map((todo) => (
                    <div
                        key={todo.id}
                        className="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                    >
                        <input
                            type="checkbox"
                            checked={todo.completed}
                            onChange={() => toggleTodo(todo.id)}
                            className="rounded border-zinc-300 text-green-600 focus:ring-green-500"
                        />
                        <span
                            className={`flex-1 text-sm ${todo.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-300'
                                }`}
                        >
                            {todo.text}
                        </span>
                        <button
                            onClick={() => deleteTodo(todo.id)}
                            className="text-zinc-400 hover:text-red-500 transition-colors"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                {todos.length === 0 && (
                    <div className="text-center text-zinc-400 text-xs py-10">
                        没有待办事项
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                        placeholder="添加新任务..."
                        className="flex-1 text-sm px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <button
                        onClick={addTodo}
                        className="p-2 bg-green-600 hover:bg-green-700 text-white rounded shadow-sm transition-colors"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

export const todoPluginDefinition: EditorPlugin = {
    id: 'todo-list',
    name: '待办事项',
    icon: CheckSquare,
    component: TodoPlugin,
    description: '一个简单的待办事项列表',
};

pluginRegistry.register(todoPluginDefinition);
