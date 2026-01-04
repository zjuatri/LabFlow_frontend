import { useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Undo2, Redo2, Settings, FilePlus2 } from 'lucide-react';

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
    showSettings: boolean;
    onToggleSettings: () => void;
    onCloseSettings: () => void;
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
                    title="返回工作区"
                >
                    <ArrowLeft size={16} />
                </button>

                <div className="flex items-center gap-1 p-1 bg-white dark:bg-zinc-900 rounded border border-zinc-300 dark:border-zinc-600 shrink-0">
                    <button
                        onClick={() => onModeSwitch('visual')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${mode === 'visual'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        可视化
                    </button>
                    <button
                        onClick={() => onModeSwitch('source')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${mode === 'source'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        源码
                    </button>
                </div>

                <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1 hidden sm:block"></div>

                <button
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="撤销 (Ctrl+Z)"
                >
                    <Undo2 size={16} />
                </button>
                <button
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="重做 (Ctrl+Y)"
                >
                    <Redo2 size={16} />
                </button>
            </div>

            <div className="flex items-center gap-3 shrink-0">
                <button
                    onClick={onSave}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-semibold transition-colors"
                    title="保存 (Ctrl+S)"
                >
                    <Save size={14} />
                    <span className="hidden sm:inline">保存</span>
                </button>

                {projectType === 'report' && (
                    <button
                        onClick={onOpenCoverModal}
                        className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="选择封面"
                    >
                        <FilePlus2 size={16} />
                    </button>
                )}

                <button
                    onClick={onToggleSettings}
                    className={`p-2 rounded border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${showSettings ? 'bg-zinc-200 dark:bg-zinc-700' : 'bg-white dark:bg-zinc-900'}`}
                    title="设置"
                >
                    <Settings size={16} />
                </button>
            </div>
        </div>
    );
}
