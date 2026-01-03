import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

export default function RenameModal() {
    const { renamingProject, setRenamingProject, updateProject } = useWorkspaceStore();
    const [title, setTitle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (renamingProject) {
            setTitle(renamingProject.title);
            setError(null);
            setSaving(false);
        }
    }, [renamingProject]);

    if (!renamingProject) return null;

    const onConfirm = async () => {
        const nextTitle = title.trim();
        if (!nextTitle) return;
        setError(null);
        setSaving(true);
        try {
            await updateProject(renamingProject.id, { title: nextTitle });
            setRenamingProject(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : '重命名失败');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200"
            onMouseDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (saving) return;
                setRenamingProject(null);
            }}
        >
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">重命名</h3>
                    <button
                        onClick={() => {
                            if (saving) return;
                            setRenamingProject(null);
                        }}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        新名称
                    </label>
                    <input
                        type="text"
                        className="w-full px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                void onConfirm();
                            }
                        }}
                        autoFocus
                    />
                    {error && (
                        <div className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                            <X size={14} />
                            {error}
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            onClick={() => {
                                if (saving) return;
                                setRenamingProject(null);
                            }}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            disabled={saving}
                        >
                            取消
                        </button>
                        <button
                            onClick={() => void onConfirm()}
                            disabled={saving || !title.trim()}
                            className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
                        >
                            {saving ? '保存中...' : '保存'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
