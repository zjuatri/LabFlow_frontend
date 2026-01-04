'use client';

import { useEffect, useState, useRef } from 'react';
import { Puzzle, Upload, Trash2, ExternalLink } from 'lucide-react';
import { pluginRegistry } from '@/components/editor/plugins/registry';
import { EditorPlugin } from '@/components/editor/plugins/types';
import SiteHeader from '@/components/common/SiteHeader';

export default function PluginsPage() {
    const [plugins, setPlugins] = useState<EditorPlugin[]>([]);
    const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load persisted plugins and state
    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            try {
                await pluginRegistry.loadPersistedPlugins();
            } catch (e) {
                console.error('Failed to load plugins', e);
            }
            setIsLoading(false);
        };
        init();

        const updatePlugins = () => {
            setPlugins(pluginRegistry.getAll());
        };
        updatePlugins();
        const unsubscribe = pluginRegistry.subscribe(updatePlugins);

        // Load enabled config
        try {
            const saved = localStorage.getItem('labflow_enabled_plugins');
            if (saved) {
                setEnabledPlugins(new Set(JSON.parse(saved)));
            } else {
                const allIds = pluginRegistry.getAll().map(p => p.id);
                if (allIds.length > 0) {
                    setEnabledPlugins(new Set(allIds));
                }
            }
        } catch (e) {
            console.error('Failed to load plugin config', e);
        }

        return unsubscribe;
    }, []);

    // Save enabled state
    useEffect(() => {
        if (plugins.length > 0) {
            localStorage.setItem('labflow_enabled_plugins', JSON.stringify(Array.from(enabledPlugins)));
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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        try {
            const pluginId = await pluginRegistry.loadFromFile(file);
            // Auto-enable the new plugin
            setEnabledPlugins((prev: Set<string>) => new Set([...prev, pluginId]));
            alert(`插件 "${pluginRegistry.get(pluginId)?.name || pluginId}" 安装成功！`);
        } catch (e) {
            alert('插件安装失败: ' + (e instanceof Error ? e.message : e));
        } finally {
            setIsLoading(false);
            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleInstallFromUrl = async () => {
        const url = window.prompt('请输入插件 JS 文件的 URL:', 'https://example.com/plugin.js');
        if (!url) return;

        setIsLoading(true);
        try {
            const pluginId = await pluginRegistry.loadRemote(url);
            setEnabledPlugins((prev: Set<string>) => new Set([...prev, pluginId]));
            alert(`插件 "${pluginRegistry.get(pluginId)?.name || pluginId}" 安装成功！`);
        } catch (e) {
            alert('插件安装失败: ' + (e instanceof Error ? e.message : e));
        } finally {
            setIsLoading(false);
        }
    };

    const handleUninstall = async (pluginId: string) => {
        if (!confirm('确定要卸载此插件吗？需要刷新页面才能完全移除。')) return;

        try {
            await pluginRegistry.uninstall(pluginId);
            setEnabledPlugins(prev => {
                const next = new Set(prev);
                next.delete(pluginId);
                return next;
            });
            alert('插件已卸载。请刷新页面以完全移除。');
        } catch (e) {
            alert('卸载失败: ' + (e instanceof Error ? e.message : e));
        }
    };

    const installedMetas = pluginRegistry.getInstalledPlugins();

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
            <SiteHeader />

            <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 mt-16">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
                            <Puzzle className="text-blue-500" />
                            插件中心
                        </h1>
                        <p className="text-zinc-500 mt-2">
                            管理 LabFlow 的扩展功能。上传或安装插件后，启用它们即可在编辑器中使用。
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".js"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50"
                        >
                            <Upload size={16} />
                            上传插件
                        </button>
                        <button
                            onClick={handleInstallFromUrl}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-blue-600 hover:border-blue-500 transition-all shadow-sm disabled:opacity-50"
                        >
                            <ExternalLink size={16} />
                            从 URL 安装
                        </button>
                    </div>
                </div>

                {isLoading && (
                    <div className="text-center py-8 text-zinc-500">
                        <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
                        <p>正在加载插件...</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {plugins.length === 0 && !isLoading ? (
                        <div className="col-span-full py-20 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 border-dashed">
                            <Puzzle size={48} className="mx-auto mb-4 text-zinc-300" />
                            <p className="text-zinc-500 mb-4">暂无已安装的插件</p>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all"
                            >
                                <Upload size={16} />
                                上传你的第一个插件
                            </button>
                        </div>
                    ) : (
                        plugins.map(plugin => {
                            const isEnabled = enabledPlugins.has(plugin.id);
                            const meta = installedMetas.find(m => m.id === plugin.id);
                            const isInstalled = !!meta;

                            return (
                                <div
                                    key={plugin.id}
                                    className={`
                                        group relative overflow-hidden rounded-xl border transition-all duration-300
                                        ${isEnabled
                                            ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800'
                                            : 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 opacity-70 grayscale-[0.8] hover:opacity-100'
                                        }
                                    `}
                                >
                                    <div className="p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`
                                                p-3 rounded-xl
                                                ${isEnabled
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                                }
                                            `}>
                                                <plugin.icon size={28} />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isInstalled && (
                                                    <button
                                                        onClick={() => handleUninstall(plugin.id)}
                                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                                                        title="卸载插件"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => togglePlugin(plugin.id)}
                                                    className={`
                                                        relative h-6 w-11 flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                                                        ${isEnabled ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'}
                                                    `}
                                                >
                                                    <span className={`
                                                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm
                                                        ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
                                                    `} />
                                                </button>
                                            </div>
                                        </div>

                                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                                            {plugin.name}
                                        </h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4 h-10 line-clamp-2">
                                            {plugin.description || '暂无描述信息'}
                                        </p>

                                        <div className="flex items-center justify-between text-xs text-zinc-400 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                                            <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                                                {plugin.id}
                                            </span>
                                            {meta && (
                                                <span className={`px-2 py-0.5 rounded ${meta.source === 'file'
                                                    ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                                                    : 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                                                    }`}>
                                                    {meta.source === 'file' ? '本地' : '远程'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {isEnabled && (
                                        <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-white dark:ring-zinc-900"></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Instructions */}
                <div className="mt-12 p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                        📦 如何创建插件
                    </h3>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-3">
                        <p>LabFlow 插件是标准的 JavaScript 文件 (UMD/IIFE 格式)，需要调用 <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">window.LabFlow.pluginRegistry.register()</code> 来注册。</p>
                        <p>插件可以访问以下全局变量：</p>
                        <ul className="list-disc list-inside ml-4 space-y-1">
                            <li><code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">window.React</code> - React 库</li>
                            <li><code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">window.Lucide</code> - Lucide 图标库</li>
                            <li><code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">window.LabFlow.pluginRegistry</code> - 插件注册表</li>
                        </ul>
                    </div>
                </div>
            </main>
        </div>
    );
}
