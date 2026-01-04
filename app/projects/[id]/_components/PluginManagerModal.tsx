'use client';

import { useEffect, useState } from 'react';
import { X, Puzzle, Power, PowerOff, Trash2 } from 'lucide-react';
import { pluginRegistry } from '@/components/editor/plugins/registry';
import { EditorPlugin } from '@/components/editor/plugins/types';

interface PluginManagerModalProps {
    show: boolean;
    onClose: () => void;
}

export function PluginManagerModal({ show, onClose }: PluginManagerModalProps) {
    const [plugins, setPlugins] = useState<EditorPlugin[]>([]);
    const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());
    const [lastUpdate, setLastUpdate] = useState(Date.now());

    // Load initial state
    useEffect(() => {
        // Sync with registry
        const updatePlugins = () => {
            setPlugins(pluginRegistry.getAll());
        };
        updatePlugins();
        const unsubscribe = pluginRegistry.subscribe(updatePlugins);

        // Load enabled state from localStorage
        try {
            const saved = localStorage.getItem('labflow_enabled_plugins');
            if (saved) {
                setEnabledPlugins(new Set(JSON.parse(saved)));
            } else {
                // Default all enabled if no config found
                setEnabledPlugins(new Set(pluginRegistry.getAll().map(p => p.id)));
            }
        } catch (e) {
            console.error('Failed to load plugin config', e);
        }

        return unsubscribe;
    }, []);

    // Save effect
    useEffect(() => {
        if (plugins.length > 0) {
            localStorage.setItem('labflow_enabled_plugins', JSON.stringify(Array.from(enabledPlugins)));
            // Dispatch a custom event so other components (Toolbar) can react immediately
            window.dispatchEvent(new Event('plugin-config-changed'));
        }
    }, [enabledPlugins, plugins.length]);

    const togglePlugin = (id: string) => {
        const next = new Set(enabledPlugins);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setEnabledPlugins(next);
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] border border-zinc-200 dark:border-zinc-800">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <Puzzle size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">插件管理</h2>
                            <p className="text-xs text-zinc-500">管理你的编辑器扩展插件</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 gap-4">
                        {plugins.length === 0 ? (
                            <div className="text-center py-12 text-zinc-400">
                                <Puzzle size={48} className="mx-auto mb-4 opacity-20" />
                                <p>这里空空如也...</p>
                                <p className="text-sm mt-2">暂无已安装的插件</p>
                            </div>
                        ) : (
                            plugins.map(plugin => {
                                const isEnabled = enabledPlugins.has(plugin.id);
                                return (
                                    <div
                                        key={plugin.id}
                                        className={`
                                            flex items-start gap-4 p-4 rounded-xl border transition-all duration-200
                                            ${isEnabled
                                                ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 shadow-sm'
                                                : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800 opacity-60 grayscale-[0.5]'
                                            }
                                        `}
                                    >
                                        <div className={`
                                            p-3 rounded-xl shrink-0
                                            ${isEnabled
                                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                            }
                                        `}>
                                            <plugin.icon size={24} />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
                                                    {plugin.name}
                                                </h3>
                                                <span className="text-[10px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                                                    v1.0.0
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">
                                                {plugin.description || '暂无描述'}
                                            </p>
                                            <div className="mt-2 text-[10px] text-zinc-400 flex items-center gap-2">
                                                <span>ID: {plugin.id}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-center ml-2">
                                            <button
                                                onClick={() => togglePlugin(plugin.id)}
                                                className={`
                                                    relative h-6 w-11 flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                                                    ${isEnabled ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'}
                                                `}
                                            >
                                                <span
                                                    className={`
                                                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                                                        ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
                                                    `}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 rounded-b-xl flex items-center justify-between text-xs text-zinc-500">
                    <p>提示：禁用插件后需要刷新页面才能完全释放资源（对于远程脚本插件）</p>
                </div>
            </div>
        </div>
    );
}
