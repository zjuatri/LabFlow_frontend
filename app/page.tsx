'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import {
  Sparkles,
  ArrowRight,
  FileText,
  UploadCloud,
  Library,
  BrainCircuit
} from 'lucide-react';

import FileUploadWithDescription from '@/components/FileUploadWithDescription';
import PdfUploadSingle from '@/components/PdfUploadSingle';
import { getToken } from '@/lib/auth';
import { useAiTestStore, type AiTestUploadedFile } from '@/components/AiTestStore';

export default function CreateProjectPage() {
  const router = useRouter();
  const { setDraft, clearRun } = useAiTestStore();
  const token = getToken();

  // Redirect if not logged in
  useEffect(() => {
    if (!token) {
      router.push('/login');
    }
  }, [router, token]);

  // Form State
  const [outlineText, setOutlineText] = useState('');
  const [detailsText, setDetailsText] = useState('');
  const [referenceFiles, setReferenceFiles] = useState<AiTestUploadedFile[]>([]);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfPageStart, setPdfPageStart] = useState('');
  const [pdfPageEnd, setPdfPageEnd] = useState('');

  const [parserMode, setParserMode] = useState<'local' | 'mineru'>('local');
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState<'deepseek-chat' | 'deepseek-reasoner' | 'qwen3-max'>('deepseek-chat');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);

  useEffect(() => {
    // Default behavior for models
    if (selectedModel === 'deepseek-reasoner') {
      setThinkingEnabled(true);
    } else {
      setThinkingEnabled(false);
    }
  }, [selectedModel]);

  const handleGenerate = async () => {
    if (!outlineText.trim() && !detailsText.trim() && referenceFiles.length === 0) {
      // Allow if only PDF is provided
      if (!pdfFile && !pdfUrl.trim()) return;
    }

    setError('');
    clearRun();
    setDraft({
      outlineText,
      detailsText,
      referenceFiles,
      pdfFile,
      pdfUrl,
      pdfPageStart,
      pdfPageEnd,
      parserMode,
      selectedModel,
      thinkingEnabled,
    });
    router.push('/ai-test');
  };

  const handleFilesChange = (newFiles: AiTestUploadedFile[]) => {
    setReferenceFiles(newFiles);
  };

  const canGenerate =
    !!pdfFile || !!pdfUrl.trim() || outlineText.trim() || detailsText.trim() || referenceFiles.length > 0;

  if (!token) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950/50" />;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-blue-500/20">

      {/* Navbar (Unified Style) */}
      <SiteHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pt-28 pb-20">

        {/* Hero Section */}
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/50 rounded-full mb-6 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">AI-Powered Report Generation</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            Create Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">Next Project</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            描述您的实验大纲和细节，或上传相关文件。AI 将根据上下文自动构建专业的实验报告结构与内容。
          </p>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Column: Project Content Inputs */}
          <div className="lg:col-span-7 flex flex-col gap-6">

            {/* Context Card */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm backdrop-blur-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Project Content</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Provide the core content for your report.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Document Outline (文档大纲)
                  </label>
                  <textarea
                    value={outlineText}
                    onChange={(e) => setOutlineText(e.target.value)}
                    placeholder="例如：实验目的、实验原理、实验步骤、实验结果、结论等..."
                    className="w-full h-32 px-4 py-3 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none transition-all placeholder:text-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Details & Observations (细节信息)
                  </label>
                  <textarea
                    value={detailsText}
                    onChange={(e) => setDetailsText(e.target.value)}
                    placeholder="详细描述实验的背景、方法、数据、观察结果等信息..."
                    className="w-full h-48 px-4 py-3 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none transition-all placeholder:text-zinc-400"
                  />
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Right Column: Files & Settings */}
          <div className="lg:col-span-5 flex flex-col gap-6">

            {/* Reference Files Card */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm backdrop-blur-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                  <UploadCloud size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Reference Materials</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Upload charts, data sheets, or extra text.</p>
                </div>
              </div>

              <FileUploadWithDescription
                onFilesChange={handleFilesChange}
                label="reference"
                placeholder="Upload reference files (Images, Text, etc.)"
              />
            </div>

            {/* PDF Source Card */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm backdrop-blur-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
                  <Library size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">PDF Source</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Primary source document for OCR processing.</p>
                </div>
              </div>

              <PdfUploadSingle
                file={pdfFile}
                onChange={setPdfFile}
                pdfUrl={pdfUrl}
                onPdfUrlChange={setPdfUrl}
                pageStart={pdfPageStart}
                pageEnd={pdfPageEnd}
                onPageStartChange={setPdfPageStart}
                onPageEndChange={setPdfPageEnd}
                parserMode={parserMode}
              />
            </div>

            {/* Settings Card */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm backdrop-blur-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                  <BrainCircuit size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Configuration</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Select model and processing engine.</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Parser Selection */}
                <div>
                  <label className="text-xs font-semibold uppercase text-zinc-500 mb-3 block">Parser Engine</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setParserMode('local')}
                      className={`px-3 py-2 rounded-lg text-sm border transition-all ${parserMode === 'local' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      <div className="font-medium">Local OCR</div>
                      <div className="text-[10px] opacity-70">Faster, Basic</div>
                    </button>
                    <button
                      onClick={() => setParserMode('mineru')}
                      className={`px-3 py-2 rounded-lg text-sm border transition-all ${parserMode === 'mineru' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      <div className="font-medium">MinerU</div>
                      <div className="text-[10px] opacity-70">High Accuracy</div>
                    </button>
                  </div>
                </div>

                {/* Model Selection */}
                <div>
                  <label className="text-xs font-semibold uppercase text-zinc-500 mb-3 block">Reasoning Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as any)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                  >
                    <option value="deepseek-chat">DeepSeek V3 (Chat)</option>
                    <option value="deepseek-reasoner">DeepSeek R1 (Reasoning)</option>
                    <option value="qwen3-max">Qwen3-Max</option>
                  </select>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Thinking Mode</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={thinkingEnabled} onChange={(e) => setThinkingEnabled(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar (Mobile/Desktop Stacked) */}
            <div className="mt-2">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`
                  w-full py-3.5 rounded-xl font-semibold text-white shadow-lg shadow-blue-500/20
                  bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 
                  active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2
                `}
              >
                <Sparkles size={18} />
                Generate Project
                <ArrowRight size={18} />
              </button>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
