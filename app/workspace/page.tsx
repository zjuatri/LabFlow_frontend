'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { X, Plus, Home, Trash2 } from 'lucide-react';

import { clearToken, getToken } from '@/lib/auth';
import { createProject, deleteProject, listProjects, Project } from '@/lib/api';

export default function WorkspacePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Batch delete states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteProgress, setBatchDeleteProgress] = useState<{ current: number; total: number } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      if (msg.toLowerCase().includes('not authenticated') || msg.toLowerCase().includes('invalid token')) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onCreate = async () => {
    if (!title.trim()) return;
    setError(null);
    try {
      const p = await createProject(title.trim());
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

  const onLogout = () => {
    clearToken();
    router.push('/login');
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

  const goToHome = () => {
    router.push('/');
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/icon.png" alt="LabFlow" width={32} height={32} className="" />
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">LabFlow</h1>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={goToHome}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors flex items-center gap-2"
            >
              <Home size={16} />
              首页
            </button>
            <button
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors"
              onClick={onLogout}
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">我的工作区</h2>
          <button
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2 rounded"
            onClick={() => setShowModal(true)}
          >
            <Plus size={18} />
            创建项目
          </button>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="text-zinc-600 dark:text-zinc-400">加载中...</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-zinc-400 dark:text-zinc-600 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">还没有项目</p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors inline-flex items-center gap-2"
              >
                <Plus size={18} />
                创建第一个项目
              </button>
            </div>
          ) : (
            <>
              {/* Batch action toolbar */}
              {projects.length > 0 && (
                <div className="mb-4 flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === projects.length && projects.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {selectedIds.size === projects.length && projects.length > 0 ? '取消全选' : '全选'}
                    </span>
                  </label>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        已选中 {selectedIds.size} 个项目
                      </span>
                      <button
                        onClick={() => setBatchDeleting(true)}
                        className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-sm transition-colors flex items-center gap-2"
                      >
                        <Trash2 size={16} />
                        批量删除
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={`p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors ${selectedIds.has(p.id) ? 'ring-2 ring-blue-500' : ''
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => handleToggleSelect(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded border-zinc-300 dark:border-zinc-600"
                      />
                      <button
                        className="text-left flex-1"
                        onClick={() => router.push(`/projects/${p.id}`)}
                      >
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{p.title}</div>
                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {new Date(p.updated_at).toLocaleString()}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteError(null);
                          setDeleting(p);
                        }}
                        className="px-2 py-2 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="删除项目"
                        aria-label="删除项目"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">创建新项目</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                项目名称
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入项目名称"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              {error && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setTitle('');
                  setError(null);
                }}
                className="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={onCreate}
                disabled={!title.trim()}
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Modal */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleting(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">删除项目</h3>
              <button
                onClick={() => setDeleting(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="text-zinc-800 dark:text-zinc-200">
                确认删除项目：
                <span className="font-semibold"> {deleting.title}</span>？
              </div>
              <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">该操作不可恢复（项目内容与已上传图片会一并删除）。</div>
              {deleteError && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{deleteError}</div>}
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => setDeleting(null)}
                className="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={onConfirmDelete}
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Modal */}
      {batchDeleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !batchDeleteProgress && setBatchDeleting(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">批量删除项目</h3>
              <button
                onClick={() => !batchDeleteProgress && setBatchDeleting(false)}
                disabled={!!batchDeleteProgress}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="text-zinc-800 dark:text-zinc-200">
                确认删除 <span className="font-semibold">{selectedIds.size}</span> 个项目？
              </div>
              <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">该操作不可恢复（项目内容与已上传图片会一并删除）。</div>
              {batchDeleteProgress && (
                <div className="mt-3 text-sm text-blue-600 dark:text-blue-400">
                  删除进度: {batchDeleteProgress.current} / {batchDeleteProgress.total}
                </div>
              )}
              {deleteError && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{deleteError}</div>}
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => setBatchDeleting(false)}
                disabled={!!batchDeleteProgress}
                className="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={!!batchDeleteProgress}
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {batchDeleteProgress ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    删除中...
                  </>
                ) : (
                  '删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
