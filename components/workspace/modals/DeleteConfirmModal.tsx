import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

export default function DeleteConfirmModal() {
    const {
        deletingProject,
        batchDeleting,
        setDeletingProject,
        setBatchDeleting,
        selectedIds,
        deleteProject,
        // deleteSelectedProjects
    } = useWorkspaceStore();

    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [batchDeleteProgress, setBatchDeleteProgress] = useState<{ current: number; total: number } | null>(null);

    // If neither deleting nor batch deleting, don't render
    if (!deletingProject && !batchDeleting) return null;

    const onConfirmDelete = async () => {
        if (!deletingProject) return;
        setDeleteError(null);
        try {
            await deleteProject(deletingProject.id);
            setDeletingProject(null);
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : '删除失败');
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;

        // For progress tracking, we might need to implement the loop here or in store but expose progress.
        // The store implementation I wrote does best-effort loop but doesn't expose progress callback.
        // To keep UI consistent with previous version (showing progress), I should ideally handle it here 
        // OR update store to support progress callback.
        // Given the store implementation is simple `for ... await deleteProject`, 
        // let's do the loop here to maintain fine-grained UI mastery, 
        // calling store's deleteProject one by one, then reload at end.

        const idsToDelete = Array.from(selectedIds);
        setBatchDeleteProgress({ current: 0, total: idsToDelete.length });
        setDeleteError(null);

        let successCount = 0;
        for (let i = 0; i < idsToDelete.length; i++) {
            try {
                // Check if store has a method for single delete without reloading every time?
                // Store's deleteProject updates state locally. So it's fine.
                await deleteProject(idsToDelete[i]);
                successCount++;
                setBatchDeleteProgress({ current: successCount, total: idsToDelete.length });
            } catch (err) {
                setDeleteError(`删除失败 (${successCount}/${idsToDelete.length} 已完成): ${err instanceof Error ? err.message : '未知错误'}`);
                break;
            }
        }

        // Cleanup
        setBatchDeleting(false);
        setBatchDeleteProgress(null);
    };

    const handleCancel = () => {
        if (batchDeleteProgress) return; // Cannot cancel mid-progress in this simple impl
        setDeletingProject(null);
        setBatchDeleting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200" onClick={handleCancel}>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                        <Trash2 size={24} />
                    </div>

                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                        {batchDeleting ? '删除选中项目？' : '删除项目？'}
                    </h3>

                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
                        {batchDeleting ? (
                            <>即将删除 <span className="font-semibold text-zinc-900 dark:text-zinc-200">{selectedIds.size}</span> 个项目。</>
                        ) : (
                            <>确定要删除 <span className="font-semibold text-zinc-900 dark:text-zinc-200">&quot;{deletingProject?.title}&quot;</span> 吗？</>
                        )}
                        <br />
                        此操作无法撤销。
                    </p>

                    {batchDeleteProgress && (
                        <div className="mb-4 text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center justify-center gap-2">
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            正在删除: {batchDeleteProgress.current} / {batchDeleteProgress.total}
                        </div>
                    )}

                    {deleteError && (
                        <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">
                            {deleteError}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={handleCancel}
                            disabled={!!batchDeleteProgress}
                            className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            onClick={batchDeleting ? handleBatchDelete : onConfirmDelete}
                            disabled={!!batchDeleteProgress}
                            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium shadow-lg shadow-red-500/20 transition-colors disabled:opacity-50"
                        >
                            删除
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
