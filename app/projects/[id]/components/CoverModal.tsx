import { X, FileText } from 'lucide-react';
import { type Project } from '@/lib/api';

interface CoverModalProps {
    show: boolean;
    onClose: () => void;
    onInsert: (coverId: string) => void;
    loading: boolean;
    covers: Project[];
}

export function CoverModal({ show, onClose, onInsert, loading, covers }: CoverModalProps) {
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
                                    onClick={() => onInsert(cover.id)}
                                    className="flex items-center p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left group"
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
            </div>
        </div>
    );
}
