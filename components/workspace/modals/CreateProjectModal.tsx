import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

export default function CreateProjectModal() {
    const router = useRouter();
    const { showCreateModal, setShowCreateModal, createProject, activeTab } = useWorkspaceStore();
    const [title, setTitle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (showCreateModal) {
            setTitle('');
            setError(null);
            // Auto focus fix for some browsers if autoFocus prop doesn't work perfectly in dynamic modals
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [showCreateModal]);

    if (!showCreateModal) return null;

    const handleCreate = async () => {
        if (!title.trim()) return;
        setError(null);
        try {
            const p = await createProject(title.trim());
            setShowCreateModal(false);
            router.push(`/projects/${p.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : '创建失败');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCreate();
        }
    };

    const tabLabel = {
        report: '实验报告',
        cover: '封面',
        template: '模板'
    }[activeTab];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200" onClick={() => setShowCreateModal(false)}>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">新建{tabLabel}</h3>
                    <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        项目名称
                    </label>
                    <input
                        ref={inputRef}
                        type="text"
                        className="w-full px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                        placeholder="例如：物理实验报告 3"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5"><X size={14} />{error}</div>}

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            onClick={() => setShowCreateModal(false)}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={!title.trim()}
                            className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
                        >
                            创建
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
