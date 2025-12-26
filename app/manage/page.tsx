'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { clearToken, getToken } from '@/lib/auth';
import { getManagePrompt, updateManagePrompt } from '@/lib/api';

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function ManagePage() {
  const router = useRouter();
  const token = getToken();
  const [mounted, setMounted] = useState(false);

  const role = useMemo(() => {
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    return payload?.role ?? null;
  }, [token]);

  const [prompt, setPrompt] = useState('');
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('idle');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!token) {
      router.push('/login');
      return;
    }
    if (role !== 'admin') {
      router.push('/');
      return;
    }

    (async () => {
      try {
        setStatus('loading');
        setError('');
        const data = await getManagePrompt();
        setPrompt(data.ai_prompt ?? '');
        setLoadedAt(data.updated_at ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '加载失败';
        if (msg.toLowerCase().includes('not authenticated') || msg.toLowerCase().includes('invalid token')) {
          clearToken();
          router.push('/login');
          return;
        }
        setError(msg);
      } finally {
        setStatus('idle');
      }
    })();
  }, [mounted, role, router, token]);

  const onSave = async () => {
    try {
      setStatus('saving');
      setError('');
      const data = await updateManagePrompt(prompt);
      setLoadedAt(data.updated_at ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setStatus('idle');
    }
  };

  const onLogout = () => {
    clearToken();
    router.push('/login');
  };

  if (!mounted) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900" />;
  }
  if (!token || role !== 'admin') {
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <header className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">后台管理</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/')}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
            >
              返回主页
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
          <div className="p-5 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">AI 提示词（主页生成）</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                  {loadedAt ? `上次更新：${loadedAt}` : '尚未更新（使用默认值）'}
                </div>
              </div>
              <button
                onClick={onSave}
                disabled={status !== 'idle' || !prompt.trim()}
                className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm"
              >
                {status === 'saving' ? '保存中...' : '保存'}
              </button>
            </div>
          </div>

          <div className="p-5">
            {error ? (
              <div className="mb-4 p-3 rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 text-sm">
                {error}
              </div>
            ) : null}

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-[60vh] font-mono text-xs p-3 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              spellCheck={false}
            />

            <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
              只有 role=admin 的账号可访问：`/manage`。
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
