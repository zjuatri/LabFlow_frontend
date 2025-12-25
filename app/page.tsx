'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Sparkles, ArrowRight } from 'lucide-react';
import FileUploadWithDescription from '@/components/FileUploadWithDescription';
import { clearToken, getToken } from '@/lib/auth';
import { chatWithDeepSeekStream } from '@/lib/api';

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  description?: string;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const [outlineText, setOutlineText] = useState('');
  const [outlineFiles, setOutlineFiles] = useState<UploadedFile[]>([]);
  const [detailsText, setDetailsText] = useState('');
  const [detailsFiles, setDetailsFiles] = useState<UploadedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiThought, setAiThought] = useState('');
  const [aiUsage, setAiUsage] = useState<{ prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null } | null>(null);
  const [aiActualModel, setAiActualModel] = useState<string>('');
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState<'deepseek-v3' | 'deepseek-r1-671b'>('deepseek-v3');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [showThought, setShowThought] = useState(false);
  const [showThoughtTouched, setShowThoughtTouched] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    // Default behavior: expand thought for R1, collapse for V3.
    // If the user already toggled manually, respect that choice.
    if (showThoughtTouched) return;
    setShowThought(selectedModel === 'deepseek-r1-671b');
  }, [selectedModel, showThoughtTouched]);

  useEffect(() => {
    // Default behavior: enable thinking for R1, disable for V3.
    setThinkingEnabled(selectedModel === 'deepseek-r1-671b');
  }, [selectedModel]);

  const handleGenerate = async () => {
    if (!outlineText.trim() && !detailsText.trim() && outlineFiles.length === 0 && detailsFiles.length === 0) {
      return;
    }

    setIsGenerating(true);
    setError('');
    setAiResponse('');
    setAiThought('');
    setAiUsage(null);
    setAiActualModel('');

    try {
      // 构建发送给 AI 的消息
      let message = '请帮我生成一份实验报告的大纲和内容建议。\n\n';
      
      if (outlineText.trim()) {
        message += `文档大纲：\n${outlineText}\n\n`;
      }
      
      if (detailsText.trim()) {
        message += `细节信息：\n${detailsText}\n\n`;
      }
      
      if (outlineFiles.length > 0) {
        message += `大纲相关文件（${outlineFiles.length}个）：\n`;
        outlineFiles.forEach(file => {
          message += `- ${file.name}`;
          if (file.description) {
            message += `: ${file.description}`;
          }
          message += '\n';
        });
        message += '\n';
      }
      
      if (detailsFiles.length > 0) {
        message += `细节相关文件（${detailsFiles.length}个）：\n`;
        detailsFiles.forEach(file => {
          message += `- ${file.name}`;
          if (file.description) {
            message += `: ${file.description}`;
          }
          message += '\n';
        });
      }

      // 流式调用 DeepSeek API：实时展示思考过程/正文
      await chatWithDeepSeekStream(message, selectedModel, thinkingEnabled, (evt) => {
        if (evt.type === 'meta') {
          setAiActualModel(evt.model);
          return;
        }
        if (evt.type === 'thought') {
          setAiThought((prev) => prev + evt.delta);
          return;
        }
        if (evt.type === 'content') {
          setAiResponse((prev) => prev + evt.delta);
          return;
        }
        if (evt.type === 'usage') {
          setAiUsage(evt.usage ?? null);
          return;
        }
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOutlineFilesChange = (newFiles: UploadedFile[]) => {
    setOutlineFiles(newFiles);
  };

  const handleDetailsFilesChange = (newFiles: UploadedFile[]) => {
    setDetailsFiles(newFiles);
  };

  const onLogout = () => {
    clearToken();
    router.push('/login');
  };

  const goToWorkspace = () => {
    router.push('/workspace');
  };

  const canGenerate = outlineText.trim() || detailsText.trim() || outlineFiles.length > 0 || detailsFiles.length > 0;

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
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedModel('deepseek-v3')}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-all ${
                    selectedModel === 'deepseek-v3'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="font-medium">DeepSeek V3</div>
                  <div className="text-xs mt-1 opacity-75">快速响应，适合日常使用</div>
                </button>
                <button
                  onClick={() => setSelectedModel('deepseek-r1-671b')}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-all ${
                    selectedModel === 'deepseek-r1-671b'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="font-medium">DeepSeek R1 (671B)</div>
                  <div className="text-xs mt-1 opacity-75">推理能力强，适合复杂任务</div>
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
                  className={`px-3 py-1.5 rounded border text-sm transition-colors ${
                    thinkingEnabled
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
          </div>

          {/* Action Bar */}
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between rounded-b-lg">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {(outlineFiles.length > 0 || detailsFiles.length > 0) && (
                <span>已上传 {outlineFiles.length + detailsFiles.length} 个文件</span>
              )}
            </div>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  生成项目
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* AI Response Section */}
        {(isGenerating || aiResponse || aiThought || aiUsage || error) && (
          <div className="mt-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                AI 生成结果
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
                  （选择：{selectedModel}{aiActualModel ? ` | 实际：${aiActualModel}` : ''}）
                </span>
              </h3>
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                {aiUsage && (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">用量 (tokens)</div>
                    <div className="text-xs text-zinc-700 dark:text-zinc-300">
                      prompt: {aiUsage.prompt_tokens ?? '-'} | completion: {aiUsage.completion_tokens ?? '-'} | total: {aiUsage.total_tokens ?? '-'}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">思考过程</div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowThoughtTouched(true);
                          setShowThought((v) => !v);
                        }}
                        className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        {showThought ? '折叠' : '展开'}
                      </button>
                    </div>
                    {showThought && (
                      <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap max-h-60 overflow-auto">
                        {aiThought || (isGenerating ? '思考中…' : '（无）')}
                      </div>
                    )}
                    {!showThought && aiThought && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-500">
                        （已折叠，仍在实时生成）
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">正文</div>
                    <div className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap max-h-60 overflow-auto">
                      {aiResponse || (isGenerating ? '生成中…' : '（无）')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tips Section */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">💡 使用建议</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• 提供清晰的文档大纲有助于生成更结构化的报告</li>
            <li>• 细节信息越详细，生成的内容越准确</li>
            <li>• 为每个上传的文件添加描述，让 AI 更好地理解文件内容</li>
            <li>• 可以在大纲和细节部分分别上传相关文件</li>
            <li>• 生成后您可以继续编辑和完善文档</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
