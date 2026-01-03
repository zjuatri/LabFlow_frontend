import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    FileText, Calendar, Copy, Pencil, Trash2, FolderOpen
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { Project } from '@/lib/api';

export default function ProjectGrid() {
    const router = useRouter();
    const {
        projects,
        loading,
        activeTab,
        selectedIds,
        toggleSelect,
        setError,
        createProject,
        loadProjects,
        setRenamingProject,
        setDeletingProject
    } = useWorkspaceStore();

    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [copying, setCopying] = useState(false);

    const handleCopyClick = async (source: Project, e: React.MouseEvent) => {
        e.stopPropagation();
        if (activeTab === 'report') {
            if (activeDropdown === source.id) {
                setActiveDropdown(null);
            } else {
                setActiveDropdown(source.id);
            }
        } else {
            await performDuplicate(source, activeTab);
        }
    };

    const performDuplicate = async (source: Project, type: string) => {
        setCopying(true);
        setActiveDropdown(null);
        try {
            const title = `${source.title} (副本)`;
            await createProject(title, type, source.id);
            // createProject in store already updates list for current tab
        } catch (err) {
            setError(err instanceof Error ? err.message : '复制失败');
        } finally {
            setCopying(false);
        }
    };

    const performCopyToTemplate = async (source: Project) => {
        setCopying(true);
        setActiveDropdown(null);
        try {
            const title = `${source.title} (Template)`;
            await createProject(title, 'template', source.id);
            // Note: This creates a template but we are likely on 'report' tab, so it won't appear in list unless we switch tabs?
            // User stays on report tab usually.
        } catch (err) {
            setError(err instanceof Error ? err.message : '复制失败');
        } finally {
            setCopying(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-400 text-sm">正在加载...</p>
            </div>
        );
    }

    const tabLabel = {
        report: '实验报告',
        cover: '封面',
        template: '模板'
    }[activeTab];

    if (projects.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-zinc-400">
                    <FolderOpen size={32} />
                </div>
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-1">暂无项目</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-xs text-center">
                    点击上方按钮创建一个新的{tabLabel}。
                </p>
                <button
                    onClick={() => useWorkspaceStore.getState().setShowCreateModal(true)}
                    className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all shadow-sm"
                >
                    新建{tabLabel}
                </button>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((p) => (
                <div
                    key={p.id}
                    className={`
            group relative bg-white dark:bg-zinc-900/50 border rounded-xl transition-all duration-200
            hover:shadow-md hover:border-blue-500/30 hover:-translate-y-0.5
            ${selectedIds.has(p.id) ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/30 dark:bg-blue-900/10' : 'border-zinc-200 dark:border-zinc-800'}
          `}
                >
                    {/* Card Content (Clickable) */}
                    <div
                        onClick={() => router.push(`/projects/${p.id}`)}
                        className="p-3.5 cursor-pointer flex flex-col"
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className={`p-2.5 rounded-lg ${selectedIds.has(p.id) ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-900/20 dark:group-hover:text-blue-400'} transition-colors`}>
                                <FileText size={20} />
                            </div>

                            {/* Checkbox (Absolute positioning for better hit area) */}
                            <div
                                onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                                className="p-2 -mr-2 -mt-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.has(p.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900'}`}>
                                    {selectedIds.has(p.id) && <div className="w-2 h-2 bg-white rounded-sm" />}
                                </div>
                            </div>
                        </div>

                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-sm">
                            {p.title}
                        </h3>

                        <div className="mt-auto pt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/50">
                            <div className="flex items-center gap-1.5">
                                <Calendar size={12} />
                                {new Date(p.updated_at).toLocaleDateString()}
                            </div>

                            <div className="flex items-center gap-1 relative">
                                <button
                                    onClick={(e) => handleCopyClick(p, e)}
                                    disabled={copying}
                                    className={`p-1.5 rounded-md transition-colors ${activeDropdown === p.id ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'}`}
                                    title={activeTab === 'report' ? "复制" : "创建副本"}
                                >
                                    <Copy size={14} />
                                </button>

                                {/* Dropdown Menu */}
                                {activeDropdown === p.id && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); }}
                                        />
                                        <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 p-1 flex flex-col gap-0.5">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); performDuplicate(p, 'report'); }}
                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                                            >
                                                <Copy size={14} className="text-zinc-400" />
                                                <span>创建副本</span>
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); performCopyToTemplate(p); }}
                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                                            >
                                                <FileText size={14} className="text-zinc-400" />
                                                <span>存为模板</span>
                                            </button>
                                        </div>
                                    </>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setRenamingProject(p);
                                    }}
                                    className="p-1.5 rounded-md hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
                                    title="重命名"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeletingProject(p);
                                    }}
                                    className="p-1.5 -mr-1.5 rounded-md hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-colors"
                                    title="删除项目"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
