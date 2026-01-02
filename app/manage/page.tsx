'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import { clearToken, getToken } from '@/lib/auth';
import { getManagePrompts, updateManagePrompts } from '@/lib/api';

function PromptEditor(props: {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (v: string) => void;
  heightClass?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{props.title}</div>
          {props.subtitle ? <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">{props.subtitle}</div> : null}
        </div>
      </div>
      <div className="p-5">
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className={`w-full ${props.heightClass ?? 'h-[45vh]'} font-mono text-xs p-3 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100`}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

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
  const [pdfOcrPrompt, setPdfOcrPrompt] = useState('');
  const [tableCellOcrPrompt, setTableCellOcrPrompt] = useState('');
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
        const data = await getManagePrompts();
        setPrompt(data.ai_prompt ?? '');
        setPdfOcrPrompt(data.pdf_page_ocr_prompt ?? '');
        setTableCellOcrPrompt(data.table_cell_ocr_prompt ?? '');
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
      const data = await updateManagePrompts({
        ai_prompt: prompt,
        pdf_page_ocr_prompt: pdfOcrPrompt,
        table_cell_ocr_prompt: tableCellOcrPrompt,
      });
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
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/icon.png" alt="LabFlow" width={32} height={32} />
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">后台管理</div>
          </Link>
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
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">提示词管理</div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              {loadedAt ? `上次更新：${loadedAt}` : '尚未更新（使用默认值）'}
            </div>
          </div>
          <button
            onClick={onSave}
            disabled={status !== 'idle' || !prompt.trim() || !pdfOcrPrompt.trim() || !tableCellOcrPrompt.trim()}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm"
          >
            {status === 'saving' ? '保存中...' : '保存全部'}
          </button>
        </div>

        {error ? (
          <div className="mb-4 p-3 rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 text-sm">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4">
          <PromptEditor
            title="AI 提示词（主页生成）"
            subtitle="用于主页的实验报告 blocks 生成。"
            value={prompt}
            onChange={setPrompt}
            heightClass="h-[40vh]"
          />
          <PromptEditor
            title="OCR 提示词（PDF 整页识别，含行内公式）"
            subtitle="用于 /pdf/ingest?ocr_math=1 的整页 OCR。"
            value={pdfOcrPrompt}
            onChange={setPdfOcrPrompt}
            heightClass="h-[35vh]"
          />
          <PromptEditor
            title="OCR 提示词（表格单元格公式识别）"
            subtitle="用于 /pdf/table/formula/vision 的单元格公式识别。"
            value={tableCellOcrPrompt}
            onChange={setTableCellOcrPrompt}
            heightClass="h-[30vh]"
          />
        </div>

        <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          只有 role=admin 的账号可访问：`/manage`。
        </div>
      </main>
    </div>
  );
}
