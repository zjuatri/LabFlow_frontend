'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import {
  BrainCircuit,
  FileText,
  Save,
  Table,
  AlertTriangle,
  Clock
} from 'lucide-react';

import { useAuth } from '@/components/AuthProvider';
import { getManagePrompts, updateManagePrompts } from '@/lib/api';

function PromptEditor(props: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  heightClass?: string;
  color?: 'blue' | 'purple' | 'emerald';
}) {
  const colorMap = {
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900',
    purple: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900',
  };

  const iconStyle = props.color ? colorMap[props.color] : colorMap['blue'];

  return (
    <div className="group bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 backdrop-blur-sm">
      <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-start gap-4">
        <div className={`p-3 rounded-lg border ${iconStyle} transition-colors`}>
          <props.icon size={24} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {props.title}
          </h3>
          {props.subtitle ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              {props.subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="p-1">
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className={`w-full ${props.heightClass ?? 'h-[45vh]'} block p-4 bg-zinc-50/50 dark:bg-black/20 text-sm font-mono text-zinc-800 dark:text-zinc-300 leading-relaxed outline-none resize-y rounded-b-lg focus:bg-white dark:focus:bg-black/40 transition-colors selection:bg-blue-100 dark:selection:bg-blue-900/30`}
          spellCheck={false}
          placeholder="// 输入提示词..."
        />
      </div>
    </div>
  );
}

export default function ManagePage() {
  const router = useRouter();
  const { token, isLoading: isAuthLoading, isAdmin, clearToken } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [pdfOcrPrompt, setPdfOcrPrompt] = useState('');
  const [tableCellOcrPrompt, setTableCellOcrPrompt] = useState('');
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('idle');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isAuthLoading) return;

    if (!token) {
      router.push('/login');
      return;
    }
    if (!isAdmin) {
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
  }, [isAdmin, router, token, isAuthLoading, clearToken]);

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

  if (isAuthLoading) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950/50" />;
  }
  if (!token || !isAdmin) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950/50" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-blue-500/20">
      {/* Navbar with Glassmorphism */}
      <SiteHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pt-28 pb-20">

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-3">
              提示词编排 <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">v2.0</span>
            </h1>
            <div className="flex items-center gap-4 mt-3 text-sm text-zinc-500 dark:text-zinc-400 text-opacity-80">
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-zinc-400" />
                {loadedAt ? (
                  <span>上次更新于 <span className="font-mono text-zinc-700 dark:text-zinc-300">{new Date(loadedAt).toLocaleString()}</span></span>
                ) : (
                  <span>尚未更新（使用 System Defaults）</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={status !== 'idle' || !prompt.trim() || !pdfOcrPrompt.trim() || !tableCellOcrPrompt.trim()}
              className={`
                relative overflow-hidden group px-6 py-2.5 rounded-lg font-medium text-sm text-white shadow-lg shadow-blue-500/20 
                bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 
                active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <div className="flex items-center gap-2 relative z-10">
                {status === 'saving' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Save Changes</span>
                  </>
                )}
              </div>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 backdrop-blur-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={20} />
            <div>
              <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">Changes could not be saved</h3>
              <p className="text-sm text-red-700 dark:text-red-300/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Main AI Prompt - Full width on mobile, 7 cols on desktop */}
          <div className="lg:col-span-12 xl:col-span-7">
            <PromptEditor
              title="AI 提示词 (Agent System Prompt)"
              subtitle="控制 Core AI 生成实验报告 blocks 的逻辑。该提示词定义了 JSON 结构、Block 规范、以及内容/结果的处理逻辑。"
              icon={BrainCircuit}
              color="purple"
              value={prompt}
              onChange={setPrompt}
              heightClass="min-h-[600px] h-[75vh]"
            />
          </div>

          {/* OCR Prompts - Stacked column on desktop */}
          <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6">
            <div className="flex-1">
              <PromptEditor
                title="Page OCR (Full Page PDF)"
                subtitle="用于 /pdf/ingest?ocr_math=1 整页识别。负责提取文字与行内公式。"
                icon={FileText}
                color="blue"
                value={pdfOcrPrompt}
                onChange={setPdfOcrPrompt}
                heightClass="h-[35vh]"
              />
            </div>

            <div className="flex-1">
              <PromptEditor
                title="Cell OCR (Table Formulas)"
                subtitle="用于 /pdf/table/formula/vision 表格单元格公式识别。专注于小区域 LaTeX 提取。"
                icon={Table}
                color="emerald"
                value={tableCellOcrPrompt}
                onChange={setTableCellOcrPrompt}
                heightClass="h-[35vh]"
              />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
