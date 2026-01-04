import { Trash2, Plus, FileText } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
// import { listProjects } from '@/lib/api';

export default function WorkspaceHeader() {
    const {
        selectedIds,
        activeTab,
        setShowCreateModal,
        setShowTemplateModal
    } = useWorkspaceStore();



    const tabLabel = {
        report: '实验报告',
        cover: '封面',
        template: '模板'
    }[activeTab];

    return (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div>
                <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-3">
                    我的工作区
                </h1>
                <p className="mt-2 text-zinc-500 dark:text-zinc-400">
                    管理所有的实验报告、封面与模板。
                </p>
            </div>

            <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/20 px-4 py-2 rounded-lg border border-red-100 dark:border-red-900/30 animate-in fade-in slide-in-from-right-4">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            已选择 {selectedIds.size} 项
                        </span>
                        <button
                            //   onClick={() => setBatchDeleting(true)} // Need store action for this or just pass prop?
                            //   Let's assume we add showBatchDeleteModal to store or similar.
                            className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                            <Trash2 size={16} />
                            删除
                        </button>
                    </div>
                )}

                {activeTab === 'report' && (
                    <button
                        onClick={() => setShowTemplateModal(true)}
                        className={`
              px-4 py-2.5 rounded-lg font-medium text-sm text-zinc-600 dark:text-zinc-300
              border border-zinc-200 dark:border-zinc-700
              hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all flex items-center gap-2
            `}
                    >
                        <FileText size={18} />
                        <span>从模板新建</span>
                    </button>
                )}

                <button
                    onClick={() => setShowCreateModal(true)}
                    className={`
            relative overflow-hidden group px-4 py-2.5 rounded-lg font-medium text-sm text-white shadow-lg shadow-blue-500/20 
            bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 
            active:scale-[0.98] transition-all flex items-center gap-2
          `}
                >
                    <Plus size={18} />
                    <span>新建{tabLabel}</span>
                </button>
            </div>
        </div>
    );
}
