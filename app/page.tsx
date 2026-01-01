'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Sparkles, ArrowRight } from 'lucide-react';
import FileUploadWithDescription from '@/components/FileUploadWithDescription';
import PdfUploadSingle from '@/components/PdfUploadSingle';
import { clearToken, getToken } from '@/lib/auth';
import { useAiTestStore, type AiTestUploadedFile } from '@/components/AiTestStore';

export default function CreateProjectPage() {
  const router = useRouter();
  const { setDraft, clearRun } = useAiTestStore();
  const [outlineText, setOutlineText] = useState('');
  const [outlineFiles, setOutlineFiles] = useState<AiTestUploadedFile[]>([]);
  const [detailsText, setDetailsText] = useState('');
  const [detailsFiles, setDetailsFiles] = useState<AiTestUploadedFile[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPageStart, setPdfPageStart] = useState('');
  const [pdfPageEnd, setPdfPageEnd] = useState('');
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState<'deepseek-chat' | 'deepseek-reasoner' | 'qwen3-max'>('deepseek-chat');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    // Default behavior: enable thinking for R1 (reasoner), disable for V3 (chat).
    // For qwen3-max, default to disabled.
    if (selectedModel === 'deepseek-reasoner') {
      setThinkingEnabled(true);
    } else {
      setThinkingEnabled(false);
    }
  }, [selectedModel]);

  const handleGenerate = async () => {
    if (!outlineText.trim() && !detailsText.trim() && outlineFiles.length === 0 && detailsFiles.length === 0) {
      if (!pdfFile) return;
    }

    setError('');
    // Always start a fresh run; otherwise /ai-test may restore an old snapshot (e.g. previous skipped PDF step).
    clearRun();
    setDraft({
      outlineText,
      outlineFiles,
      detailsText,
      detailsFiles,
      pdfFile,
      pdfPageStart,
      pdfPageEnd,
      selectedModel,
      thinkingEnabled,
    });
    router.push('/ai-test');
  };

  const handleOutlineFilesChange = (newFiles: AiTestUploadedFile[]) => {
    setOutlineFiles(newFiles);
  };

  const handleDetailsFilesChange = (newFiles: AiTestUploadedFile[]) => {
    setDetailsFiles(newFiles);
  };

  const onLogout = () => {
    clearToken();
    router.push('/login');
  };

  const goToWorkspace = () => {
    router.push('/workspace');
  };

  const canGenerate =
    !!pdfFile || outlineText.trim() || detailsText.trim() || outlineFiles.length > 0 || detailsFiles.length > 0;

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
              onClick={goToWorkspace}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors"
            >
              我的工作区
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

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-full mb-4">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">AI 驱动的实验报告生成</span>
          </div>
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            创建新项目
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            描述您的实验大纲和细节，或上传相关文件，AI 将帮助您生成专业的实验报告
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
          <div className="p-6 space-y-6">
            {/* Model Selection */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                AI 模型选择
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  onClick={() => setSelectedModel('deepseek-chat')}
                  className={`px-4 py-3 rounded-lg border transition-all text-left ${selectedModel === 'deepseek-chat'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                >
                  <div className="font-medium">DeepSeek V3 (Chat)</div>
                  <div className="text-xs mt-1 opacity-75">V3.2 非思考模式，快速响应</div>
                </button>
                <button
                  onClick={() => setSelectedModel('deepseek-reasoner')}
                  className={`px-4 py-3 rounded-lg border transition-all text-left ${selectedModel === 'deepseek-reasoner'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                >
                  <div className="font-medium">DeepSeek R1 (Reasoner)</div>
                  <div className="text-xs mt-1 opacity-75">V3.2 思考模式，深度推理</div>
                </button>
                <button
                  onClick={() => setSelectedModel('qwen3-max')}
                  className={`px-4 py-3 rounded-lg border transition-all text-left ${selectedModel === 'qwen3-max'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                >
                  <div className="font-medium">Qwen3-Max</div>
                  <div className="text-xs mt-1 opacity-75">通义千问超强模型，综合能力优秀</div>
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">思考模式</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">开启后会输出思考内容（reasoning_content / &lt;think&gt;）</div>
                </div>
                <button
                  type="button"
                  onClick={() => setThinkingEnabled((v) => !v)}
                  className={`px-3 py-1.5 rounded border text-sm transition-colors ${thinkingEnabled
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                >
                  {thinkingEnabled ? '已开启' : '已关闭'}
                </button>
              </div>
            </div>

            {/* Outline Section */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                文档大纲
              </label>
              <textarea
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                placeholder="例如：实验目的、实验原理、实验步骤、实验结果、结论等"
                className="w-full h-32 px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2 mb-3">
                简要描述您的文档结构和主要章节
              </p>
              <FileUploadWithDescription
                onFilesChange={handleOutlineFilesChange}
                label="outline"
                placeholder="上传大纲相关文件（可选）"
              />
            </div>

            {/* Details Section */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                细节信息
              </label>
              <textarea
                value={detailsText}
                onChange={(e) => setDetailsText(e.target.value)}
                placeholder="详细描述实验的背景、方法、数据、观察结果等信息..."
                className="w-full h-48 px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2 mb-3">
                提供更多细节信息以帮助 AI 生成更准确的内容
              </p>
              <FileUploadWithDescription
                onFilesChange={handleDetailsFilesChange}
                label="details"
                placeholder="上传细节相关文件（可选）"
              />
            </div>

            <div>
              <PdfUploadSingle
                file={pdfFile}
                onChange={setPdfFile}
                pageStart={pdfPageStart}
                pageEnd={pdfPageEnd}
                onPageStartChange={setPdfPageStart}
                onPageEndChange={setPdfPageEnd}
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between rounded-b-lg">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {(outlineFiles.length > 0 || detailsFiles.length > 0) && (
                <span>已上传 {outlineFiles.length + detailsFiles.length} 个文件</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Sparkles size={18} />
                生成项目
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
