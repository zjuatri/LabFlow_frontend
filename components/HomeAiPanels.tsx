'use client';

import { Sparkles } from 'lucide-react';

export default function HomeAiPanels(props: {
  isGenerating: boolean;
  selectedModel: string;
  aiActualModel: string;
  aiResponse: string;
  aiThought: string;
  aiUsage: { prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null } | null;
  error: string;
  showThought: boolean;
  onToggleThought: () => void;
}) {
  const {
    isGenerating,
    selectedModel,
    aiActualModel,
    aiResponse,
    aiThought,
    aiUsage,
    error,
    showThought,
    onToggleThought,
  } = props;

  const show = isGenerating || aiResponse || aiThought || aiUsage || error;
  if (!show) return null;

  return (
    <>
      <div className="mt-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            AI 生成结果
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
              （选择：{selectedModel}
              {aiActualModel ? ` | 实际：${aiActualModel}` : ''}）
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
                  prompt: {aiUsage.prompt_tokens ?? '-'} | completion: {aiUsage.completion_tokens ?? '-'} | total:{' '}
                  {aiUsage.total_tokens ?? '-'}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">思考过程</div>
                  <button
                    type="button"
                    onClick={onToggleThought}
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
                  <div className="text-xs text-zinc-500 dark:text-zinc-500">（已折叠，仍在实时生成）</div>
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
    </>
  );
}
