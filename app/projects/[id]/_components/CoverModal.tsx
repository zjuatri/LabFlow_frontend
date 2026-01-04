import { X, FileText } from 'lucide-react';
import { type Project } from '@/lib/api';
import { useMemo, useState } from 'react';

interface CoverModalProps {
    show: boolean;
    onClose: () => void;
    onInsert: (coverId: string, fixedOnePage: boolean) => void;
    loading: boolean;
    covers: Project[];
}

export function CoverModal({ show, onClose, onInsert, loading, covers }: CoverModalProps) {


    const [selectedCoverId, setSelectedCoverId] = useState<string | null>(null);
    const selectedCover = useMemo(() => covers.find(c => c.id === selectedCoverId) ?? null, [covers, selectedCoverId]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">选择封面</h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : covers.length === 0 ? (
                        <div className="text-center text-zinc-500 dark:text-zinc-400 py-8">
                            暂无可用封面，请先在工作区创建封面。
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {covers.map(cover => (
                                <button
                                    key={cover.id}
                                    onClick={() => setSelectedCoverId(cover.id)}
                                    className={
                                        "flex items-center p-3 rounded-xl border transition-all text-left group " +
                                        (selectedCoverId === cover.id
                                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10"
                                            : "border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10")
                                    }
                                >
                                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mr-3">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <div className="font-medium text-zinc-900 dark:text-zinc-100">{cover.title}</div>
                                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                            {new Date(cover.updated_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Step 2: Ask fixed-one-page */}
                <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="text-sm text-zinc-700 dark:text-zinc-300 truncate mb-2">
                        {selectedCover ? `已选择：${selectedCover.title}` : '请选择一个封面'}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                        封面是否固定占据一页？如果固定，则即使封面内容不足一页，正文也会从下一页开始。
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm"
                        >
                            取消
                        </button>
                        <button
                            disabled={!selectedCoverId}
                            onClick={() => {
                                if (!selectedCoverId) return;
                                onInsert(selectedCoverId, false);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            不固定
                        </button>
                        <button
                            disabled={!selectedCoverId}
                            onClick={() => {
                                if (!selectedCoverId) return;
                                onInsert(selectedCoverId, true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                        >
                            固定占一页
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
