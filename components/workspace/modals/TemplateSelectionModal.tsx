import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, FileText, ArrowLeft } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { listProjects, Project } from '@/lib/api';

export default function TemplateSelectionModal() {
    const router = useRouter();
    const { showTemplateModal, setShowTemplateModal, createProject } = useWorkspaceStore();
    const [templates, setTemplates] = useState<Project[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Project | null>(null);
    const [newProjectName, setNewProjectName] = useState('');

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
                {/* Header */}
                <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        {selectedTemplate && (
                            <button
                                onClick={() => setSelectedTemplate(null)}
                                className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
                            >
                                <ArrowLeft size={20} />
                            </button>
                        )}
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {selectedTemplate ? '创建项目' : '选择模板'}
                        </h3>
                    </div>
                    <button
                        onClick={() => {
                            setShowTemplateModal(false);
                            setSelectedTemplate(null);
                        }}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {selectedTemplate ? (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                    项目名称
                                </label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    placeholder="请输入项目名称"
                                    className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && newProjectName.trim()) {
                                            // Handle create
                                            (document.querySelector('#confirm-create-btn') as HTMLButtonElement)?.click();
                                        }
                                    }}
                                />
                            </div>

                            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 flex items-start gap-3">
                                <div className="p-2 bg-blue-100 dark:bg-blue-800/50 rounded-lg text-blue-600 dark:text-blue-300 shrink-0">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                                        基于模板: {selectedTemplate.title}
                                    </h4>
                                    <p className="text-xs text-blue-700 dark:text-blue-300 opacity-80">
                                        新项目将复制此模板的内容与设置。
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    onClick={() => setSelectedTemplate(null)}
                                    className="px-4 py-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    返回
                                </button>
                                <button
                                    id="confirm-create-btn"
                                    disabled={creatingFromTemplate || !newProjectName.trim()}
                                    onClick={async () => {
                                        if (creatingFromTemplate || !newProjectName.trim()) return;
                                        setCreatingFromTemplate(true);
                                        try {
                                            const p = await createProject(newProjectName.trim(), 'report', selectedTemplate.id);
                                            setShowTemplateModal(false);
                                            setSelectedTemplate(null);
                                            router.push(`/projects/${p.id}`);
                                        } catch (err) {
                                            alert('创建失败: ' + (err instanceof Error ? err.message : '未知错误'));
                                        } finally {
                                            setCreatingFromTemplate(false);
                                        }
                                    }}
                                    className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {creatingFromTemplate ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            创建中...
                                        </>
                                    ) : (
                                        '确认创建'
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
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
                                            onClick={() => {
                                                setSelectedTemplate(t);
                                                setNewProjectName(t.title); // Default name is template title
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
