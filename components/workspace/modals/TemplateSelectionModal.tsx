import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, FileText } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { listProjects, Project } from '@/lib/api';

export default function TemplateSelectionModal() {
    const router = useRouter();
    const { showTemplateModal, setShowTemplateModal, createProject } = useWorkspaceStore();
    const [templates, setTemplates] = useState<Project[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);

    useEffect(() => {
        if (showTemplateModal) {
            setLoadingTemplates(true);
            listProjects('template')
                .then(setTemplates)
                .catch(console.error)
                .finally(() => setLoadingTemplates(false));
        }
    }, [showTemplateModal]);

    if (!showTemplateModal) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200"
            onClick={() => setShowTemplateModal(false)}
        >
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">选择模板</h3>
                    <button
                        onClick={() => setShowTemplateModal(false)}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {loadingTemplates ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-zinc-400 text-sm">正在加载模板...</p>
                        </div>
                    ) : templates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20">
                            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-zinc-400">
                                <FileText size={32} />
                            </div>
                            <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-1">暂无模板</h3>
                            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-xs text-center">
                                请先切换到“模板”并创建一个模板。
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {templates.map(t => (
                                <div
                                    key={t.id}
                                    onClick={async () => {
                                        if (creatingFromTemplate) return;
                                        setCreatingFromTemplate(true);
                                        try {
                                            // Keep the same title or allow name change? 
                                            // Original code used template title.
                                            // Ideally we might prompt for new name but original didn't.
                                            const title = t.title;
                                            const p = await createProject(title, 'report', t.id);
                                            setShowTemplateModal(false);
                                            router.push(`/projects/${p.id}`);
                                        } catch (err) {
                                            alert('创建失败: ' + (err instanceof Error ? err.message : '未知错误'));
                                        } finally {
                                            setCreatingFromTemplate(false);
                                        }
                                    }}
                                    className="group p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-blue-500 hover:shadow-md cursor-pointer transition-all bg-white dark:bg-zinc-900 flex items-start gap-4"
                                >
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg group-hover:scale-110 transition-transform">
                                        <FileText size={24} />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-zinc-900 dark:text-zinc-100 mb-1 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {t.title}
                                        </h4>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                            {new Date(t.updated_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
