'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { X, Plus, Home } from 'lucide-react';

import { clearToken, getToken } from '@/lib/auth';
import { createProject, listProjects, Project } from '@/lib/api';

export default function WorkspacePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

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

  const goToHome = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/icon.png" alt="LabFlow" width={32} height={32} className="" />
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">LabFlow</h1>
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className="text-left p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{p.title}</div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(p.updated_at).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
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
    </div>
  );
}
