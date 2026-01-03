import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { DocumentSettings } from '@/lib/typst';

interface ProjectSettingsModalProps {
    show: boolean;
    onClose: () => void;
    title: string;
    onTitleChange: (title: string) => void;
    docSettings: DocumentSettings;
    onSettingsChange: (settings: DocumentSettings) => void;
    projectType: 'report' | 'cover' | 'template';
    hasCover?: boolean;
    coverFixedOnePage?: boolean;
    onCoverFixedOnePageChange?: (fixed: boolean) => void;
}

export function ProjectSettingsModal({
    show,
    onClose,
    title,
    onTitleChange,
    docSettings,
    onSettingsChange,
    projectType,
    hasCover,
    coverFixedOnePage,
    onCoverFixedOnePageChange,
}: ProjectSettingsModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    // Close on escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (show) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [show, onClose]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        if (show) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [show, onClose]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                ref={modalRef}
                className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200 overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">项目设置</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Title */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">项目标题</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => onTitleChange(e.target.value)}
                            placeholder="输入项目标题..."
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-zinc-400"
                            autoFocus
                        />
                    </div>

                    <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

                    {/* Document Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">文档排版</h3>

                        {projectType !== 'cover' && (
                            <div className="grid grid-cols-2 gap-4">
                                <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors group">
                                    <input
                                        type="checkbox"
                                        checked={docSettings.tableCaptionNumbering}
                                        onChange={(e) => onSettingsChange({ ...docSettings, tableCaptionNumbering: e.target.checked })}
                                        className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 group-hover:border-blue-500 transition-colors"
                                    />
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">表格自动编号</span>
                                </label>
                                <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors group">
                                    <input
                                        type="checkbox"
                                        checked={docSettings.imageCaptionNumbering}
                                        onChange={(e) => onSettingsChange({ ...docSettings, imageCaptionNumbering: e.target.checked })}
                                        className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 group-hover:border-blue-500 transition-colors"
                                    />
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">图片自动编号</span>
                                </label>
                            </div>
                        )}

                        <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">图片标题位置</span>
                            <div className="flex bg-zinc-200 dark:bg-zinc-800 p-1 rounded-lg">
                                <button
                                    onClick={() => onSettingsChange({ ...docSettings, imageCaptionPosition: 'above' })}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${docSettings.imageCaptionPosition === 'above'
                                            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                        }`}
                                >
                                    上方
                                </button>
                                <button
                                    onClick={() => onSettingsChange({ ...docSettings, imageCaptionPosition: 'below' })}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${docSettings.imageCaptionPosition === 'below'
                                            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                        }`}
                                >
                                    下方
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* View Options */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">视图选项</h3>
                        <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">显示空白行辅助块</span>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={docSettings.verticalSpaceVisible}
                                    onChange={(e) => onSettingsChange({ ...docSettings, verticalSpaceVisible: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-blue-600"></div>
                            </div>
                        </label>

                        {(projectType === 'report' || projectType === 'template') && hasCover && typeof onCoverFixedOnePageChange === 'function' && (
                            <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors mt-2">
                                <span className="text-sm text-zinc-600 dark:text-zinc-400">封面固定占据一页</span>
                                <div className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!coverFixedOnePage}
                                        onChange={(e) => onCoverFixedOnePageChange(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-blue-600"></div>
                                </div>
                            </label>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-colors"
                    >
                        完成
                    </button>
                </div>
            </div>
        </div>
    );
}
