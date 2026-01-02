'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Plus,
  Trash2,
  Pencil,
  FolderOpen,
  Calendar,
  FileText
} from 'lucide-react';

import SiteHeader from '@/components/SiteHeader';
import { useAuth } from '@/components/AuthProvider';
import { createProject, deleteProject, listProjects, updateProject, Project } from '@/lib/api';

export default function WorkspacePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'report' | 'cover' | 'template'>('report');

  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Rename states
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);

  // Batch delete states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteProgress, setBatchDeleteProgress] = useState<{ current: number; total: number } | null>(null);

  const { token, isLoading: isAuthLoading } = useAuth();

  // Loading Logic
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Filter by activeTab type
      const data = await listProjects(activeTab);
      setProjects(data);
      // Construct a new Set to remove IDs that are no longer present in the fetched data
      setSelectedIds(prev => {
        const next = new Set<string>();
        data.forEach(p => {
          if (prev.has(p.id)) next.add(p.id);
        });
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      if (msg.toLowerCase().includes('not authenticated') || msg.toLowerCase().includes('invalid token')) {
        router.push('/login');
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthLoading) return;
    if (!token) {
      router.push('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, token, isAuthLoading, activeTab]); // Reload when tab changes

  const onCreate = async () => {
    if (!title.trim()) return;
    setError(null);
    try {
      const p = await createProject(title.trim(), activeTab);
      setTitle('');
      setShowModal(false);
      router.push(`/projects/${p.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onCreate();
    }
  };

  const onConfirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await deleteProject(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const onConfirmRename = async () => {
    if (!renaming) return;
    const nextTitle = renameTitle.trim();
    if (!nextTitle) return;
    setRenameError(null);
    setRenameSaving(true);
    try {
      await updateProject(renaming.id, { title: nextTitle });
      setRenaming(null);
      setRenameTitle('');
      await load();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : '重命名失败');
    } finally {
      setRenameSaving(false);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    const idsToDelete = Array.from(selectedIds);
    setBatchDeleteProgress({ current: 0, total: idsToDelete.length });
    setDeleteError(null);

    let successCount = 0;
    for (let i = 0; i < idsToDelete.length; i++) {
      try {
        await deleteProject(idsToDelete[i]);
        successCount++;
        setBatchDeleteProgress({ current: successCount, total: idsToDelete.length });
      } catch (err) {
        setDeleteError(`删除失败 (${successCount}/${idsToDelete.length} 已完成): ${err instanceof Error ? err.message : '未知错误'}`);
        break;
      }
    }

    // Refresh and cleanup
    await load();
    setSelectedIds(new Set());
    setBatchDeleting(false);
    setBatchDeleteProgress(null);
  };

  if (!token) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950/50" />;

  const tabLabel = {
    report: '实验报告',
    cover: '封面',
    template: '模板'
  }[activeTab];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-blue-500/20">

      {/* Navbar */}
      <SiteHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pt-28 pb-20">

        {/* Page Header */}
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
                  onClick={() => setBatchDeleting(true)}
                  className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <Trash2 size={16} />
                  删除
                </button>
              </div>
            )}

            <button
              onClick={() => setShowModal(true)}
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

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'report' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            实验报告
          </button>
          <button
            onClick={() => setActiveTab('cover')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'cover' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            封面
          </button>
          <button
            onClick={() => setActiveTab('template')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'template' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            模板
          </button>
        </div>

        {/* Content Area */}
        <div className="min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm">正在加载...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20">
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-zinc-400">
                <FolderOpen size={32} />
              </div>
              <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-1">暂无项目</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-xs text-center">
                点击上方按钮创建一个新的{tabLabel}。
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all shadow-sm"
              >
                新建{tabLabel}
              </button>
            </div>
          ) : (
            <>
              {/* Selection Bar */}
              <div className="flex items-center justify-between mb-4 px-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds.size === projects.length ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 group-hover:border-blue-500'}`}>
                    {selectedIds.size === projects.length && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                    <input
                      type="checkbox"
                      checked={selectedIds.size === projects.length}
                      onChange={handleSelectAll}
                      className="hidden"
                    />
                  </div>
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
                    全选
                  </span>
                </label>
                <span className="text-sm text-zinc-400">
                  {projects.length} 个项目
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={`
                      group relative bg-white dark:bg-zinc-900/50 border rounded-xl overflow-hidden transition-all duration-200
                      hover:shadow-lg hover:border-blue-500/30 hover:-translate-y-1
                      ${selectedIds.has(p.id) ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/30 dark:bg-blue-900/10' : 'border-zinc-200 dark:border-zinc-800'}
                    `}
                  >
                    {/* Card Content (Clickable) */}
                    <div
                      onClick={() => router.push(`/projects/${p.id}`)}
                      className="p-5 cursor-pointer h-full flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className={`p-3 rounded-lg ${selectedIds.has(p.id) ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-900/20 dark:group-hover:text-blue-400'} transition-colors`}>
                          <FileText size={24} />
                        </div>

                        {/* Checkbox (Absolute positioning for better hit area) */}
                        <div
                          onClick={(e) => { e.stopPropagation(); handleToggleSelect(p.id); }}
                          className="p-2 -mr-2 -mt-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds.has(p.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900'}`}>
                            {selectedIds.has(p.id) && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                          </div>
                        </div>
                      </div>

                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {p.title}
                      </h3>

                      <div className="mt-auto pt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/50">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} />
                          {new Date(p.updated_at).toLocaleDateString()}
                        </div>

                        {/* Single Delete Action */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameError(null);
                              setRenaming(p);
                              setRenameTitle(p.title);
                            }}
                            className="p-1.5 rounded-md hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
                            title="重命名"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteError(null);
                              setDeleting(p);
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
            </>
          )}
        </div>
      </main>

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">新建{tabLabel}</h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                项目名称
              </label>
              <input
                type="text"
                className="w-full px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                placeholder="例如：物理实验报告 3"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5"><X size={14} />{error}</div>}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={onCreate}
                  disabled={!title.trim()}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {(deleting || batchDeleting) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200" onClick={() => !batchDeleteProgress && (setDeleting(null), setBatchDeleting(false))}>
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
                  <>确定要删除 <span className="font-semibold text-zinc-900 dark:text-zinc-200">"{deleting?.title}"</span> 吗？</>
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
                  onClick={() => { setDeleting(null); setBatchDeleting(false); }}
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
      )}

      {/* Rename Modal */}
      {renaming && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200"
          onClick={() => {
            if (renameSaving) return;
            setRenaming(null);
            setRenameTitle('');
            setRenameError(null);
          }}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">重命名</h3>
              <button
                onClick={() => {
                  if (renameSaving) return;
                  setRenaming(null);
                  setRenameTitle('');
                  setRenameError(null);
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
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void onConfirmRename();
                  }
                }}
                autoFocus
              />
              {renameError && (
                <div className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <X size={14} />
                  {renameError}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    if (renameSaving) return;
                    setRenaming(null);
                    setRenameTitle('');
                    setRenameError(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  disabled={renameSaving}
                >
                  取消
                </button>
                <button
                  onClick={() => void onConfirmRename()}
                  disabled={renameSaving || !renameTitle.trim()}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
                >
                  {renameSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
