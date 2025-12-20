'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { clearToken, getToken } from '@/lib/auth';
import { createProject, listProjects, Project } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      router.push(`/projects/${p.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  const onLogout = () => {
    clearToken();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">我的项目</h1>
          <button
            className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={onLogout}
          >
            退出登录
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
            placeholder="新项目标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
            onClick={onCreate}
          >
            创建
          </button>
        </div>

        {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

        <div className="mt-6">
          {loading ? (
            <div className="text-zinc-600 dark:text-zinc-400">加载中...</div>
          ) : projects.length === 0 ? (
            <div className="text-zinc-600 dark:text-zinc-400">还没有项目</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className="text-left p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded hover:border-zinc-400 dark:hover:border-zinc-600"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{p.title}</div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{new Date(p.updated_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
