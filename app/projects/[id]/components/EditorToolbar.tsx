import { useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Undo2, Redo2, Settings, FilePlus2 } from 'lucide-react';
import { type DocumentSettings } from '@/lib/typst';

export type EditorMode = 'source' | 'visual';

interface EditorToolbarProps {
    mode: EditorMode;
    onModeSwitch: (mode: EditorMode) => void;
    title: string;
    onTitleChange: (title: string) => void;
    docSettings: DocumentSettings;
    onSettingsChange: (settings: DocumentSettings) => void;
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


    // Cover-specific settings (only relevant when editing a report that contains a cover block)
    hasCover?: boolean;
    coverFixedOnePage?: boolean;
    onCoverFixedOnePageChange?: (fixed: boolean) => void;
}

export function EditorToolbar({
    mode,
    onModeSwitch,
    title,
    onTitleChange,
    docSettings,
    onSettingsChange,
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

    hasCover,
    coverFixedOnePage,
    onCoverFixedOnePageChange,
}: EditorToolbarProps) {
    const router = useRouter();
    const settingsRef = useRef<HTMLDivElement>(null);

    // Close settings dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                onCloseSettings();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onCloseSettings]);

    return (
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700 gap-3 flex-wrap">
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

                <div className="relative" ref={settingsRef}>
                    <button
                        onClick={onToggleSettings}
                        className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="设置"
                    >
                        <Settings size={16} />
                    </button>
                    {showSettings && (
                        <div className="absolute right-0 mt-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded shadow-lg z-10 min-w-max">
                            <div className="px-4 py-3 space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
                                <div className="mb-2">
                                    <label className="block text-xs font-semibold mb-2">项目标题</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => onTitleChange(e.target.value)}
                                        placeholder="项目标题"
                                        className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs"
                                    />
                                </div>
                                <div className="border-t border-zinc-300 dark:border-zinc-600 pt-3">
                                    {projectType !== 'cover' && (
                                        <>
                                            <label className="flex items-center gap-2 select-none cursor-pointer mb-2">
                                                <input
                                                    type="checkbox"
                                                    checked={docSettings.tableCaptionNumbering}
                                                    onChange={(e) => onSettingsChange({ ...docSettings, tableCaptionNumbering: e.target.checked })}
                                                />
                                                表格排序
                                            </label>
                                            <label className="flex items-center gap-2 select-none cursor-pointer mb-2">
                                                <input
                                                    type="checkbox"
                                                    checked={docSettings.imageCaptionNumbering}
                                                    onChange={(e) => onSettingsChange({ ...docSettings, imageCaptionNumbering: e.target.checked })}
                                                />
                                                图片排序
                                            </label>
                                        </>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <label className="select-none cursor-pointer">图片标题位置</label>
                                        <select
                                            value={docSettings.imageCaptionPosition}
                                            onChange={(e) =>
                                                onSettingsChange({
                                                    ...docSettings,
                                                    imageCaptionPosition: e.target.value === 'above' ? 'above' : 'below',
                                                })
                                            }
                                            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900"
                                        >
                                            <option value="above">上方</option>
                                            <option value="below">下方</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                                            <input
                                                type="checkbox"
                                                checked={docSettings.verticalSpaceVisible}
                                                onChange={(e) =>
                                                    onSettingsChange({
                                                        ...docSettings,
                                                        verticalSpaceVisible: e.target.checked,
                                                    })
                                                }
                                                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            显示空白行辅助块
                                        </label>
                                    </div>

                                    {(projectType === 'report' || projectType === 'template') && hasCover && typeof onCoverFixedOnePageChange === 'function' && (
                                        <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                                            <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={!!coverFixedOnePage}
                                                    onChange={(e) => onCoverFixedOnePageChange(e.target.checked)}
                                                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                封面固定占据一页
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
