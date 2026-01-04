import { useRef, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Undo2, Redo2, Settings, FilePlus2, Plus, DownloadCloud } from 'lucide-react';
import { pluginRegistry } from '@/components/editor/plugins/registry';

export type EditorMode = 'source' | 'visual';

interface EditorToolbarProps {
    mode: EditorMode;
    onModeSwitch: (mode: EditorMode) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void;
    onOpenCoverModal: () => void;
    projectType: 'report' | 'cover' | 'template';
    showSettings: boolean; // Now used to highlight the button if matching modal is open
    onToggleSettings: () => void;
    onCloseSettings: () => void;

    // Plugins
    activePluginId: string | null;
    onTogglePlugin: (id: string) => void;
}

export function EditorToolbar({
    mode,
    onModeSwitch,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onSave,
    onOpenCoverModal,
    projectType,
    showSettings,
    onToggleSettings,
    onCloseSettings,
    activePluginId,
    onTogglePlugin,
}: EditorToolbarProps) {
    const router = useRouter();
    const settingsRef = useRef<HTMLDivElement>(null);

    // Close settings dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                // onCloseSettings(); // No longer needed as modal handles its own outside click
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Force update when registry changes
    const [, forceUpdate] = useState({});
    useEffect(() => {
        return pluginRegistry.subscribe(() => forceUpdate({}));
    }, []);

    const handleInstallPlugin = async () => {
        const url = window.prompt('请输入插件 JS 文件的 URL (UMD格式):', 'http://localhost:3000/plugins/demo-plugin.js');
        if (url) {
            try {
                await pluginRegistry.loadRemote(url);
                alert('插件安装成功！');
            } catch (e) {
                alert('插件加载失败: ' + e);
            }
        }
    };

    return (
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700 gap-3 flex-wrap relative z-20">
            <div className="flex items-center gap-3 min-w-0">
                <button
                    onClick={() => {
                        if (typeof window !== 'undefined' && window.history.length > 1) {
                            router.back();
                            return;
                        }
                        router.push('/workspace');
                    }}
                    className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                    title="返回主页"
                >
                    <ArrowLeft size={16} />
                </button>
                <div className="flex bg-white dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-600 overflow-hidden shrink-0">
                    <button
                        onClick={() => onModeSwitch('visual')}
                        className={`px-3 py-1 text-sm transition-colors ${mode === 'visual'
                            ? 'bg-blue-500 text-white'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        可视化
                    </button>
                    <button
                        onClick={() => onModeSwitch('source')}
                        className={`px-3 py-1 text-sm transition-colors ${mode === 'source'
                            ? 'bg-blue-500 text-white'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        源代码
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
                {(projectType === 'report' || projectType === 'template') && (
                    <button
                        onClick={onOpenCoverModal}
                        className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="插入封面"
                    >
                        <FilePlus2 size={16} />
                    </button>
                )}
                <button
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
                    title="撤销 (Ctrl+Z)"
                >
                    <Undo2 size={16} />
                </button>
                <button
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
                    title="重做 (Ctrl+Y)"
                >
                    <Redo2 size={16} />
                </button>

                <button
                    onClick={onSave}
                    className="p-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
                    title="保存 (Ctrl+S)"
                >
                    <Save size={16} />
                </button>

                <button
                    onClick={onToggleSettings}
                    className={`p-2 rounded border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${showSettings ? 'bg-zinc-200 dark:bg-zinc-700' : 'bg-white dark:bg-zinc-900'}`}
                    title="设置"
                >
                    <Settings size={16} />
                </button>
            </div>

            {/* Plugin Divider */}
            <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1 hidden sm:block"></div>

            <div className="flex items-center gap-3 shrink-0">
                {pluginRegistry.getAll().map(plugin => (
                    <button
                        key={plugin.id}
                        onClick={() => onTogglePlugin(plugin.id)}
                        className={`
                            flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium border transition-colors
                            ${activePluginId === plugin.id
                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300'
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }
                        `}
                        title={plugin.description}
                    >
                        <plugin.icon size={14} />
                        <span className="hidden xl:inline">{plugin.name}</span>
                    </button>
                ))}

                <button
                    onClick={handleInstallPlugin}
                    className="p-1.5 rounded-full border border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:text-blue-500 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title="安装插件 (加载远程 JS)"
                >
                    <DownloadCloud size={14} />
                </button>
            </div>
        </div>
    );
}
