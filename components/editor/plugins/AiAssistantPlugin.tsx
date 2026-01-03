'use client';

import { Sparkles, FileText, Upload, X, ArrowRight, Loader2, Play, Copy, Check, Trash2, Image as ImageIcon, Link as LinkIcon, Eye } from 'lucide-react';
import type { TypstBlock } from '@/lib/typst';
import { useAiAssistant } from './useAiAssistant';

/* --------------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------------- */

interface AiAssistantPluginProps {
    projectId: string;
    existingBlocks?: TypstBlock[];
    onInsertBlocks: (blocks: TypstBlock[]) => void;
    onClose: () => void;
}

export function AiAssistantPlugin({ projectId, existingBlocks, onInsertBlocks, onClose }: AiAssistantPluginProps) {
    const {
        draft,
        setDraft,
        status,
        error,
        progressMsg,
        sentPrompt,
        showPrompt,
        setShowPrompt,
        aiThought,
        aiResponse,
        isCopied,
        setIsCopied,
        handleFileChange,
        handleAddUrl,
        updateFile,
        removeFile,
        handleRun,
        handleInsert
    } = useAiAssistant({ projectId, existingBlocks, onInsertBlocks, onClose });

    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-medium">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                    AI 助手
                </div>
                <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                    <X size={18} />
                </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Input Section */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                            实验大纲
                        </label>
                        <textarea
                            className="w-full text-xs p-2 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y min-h-[60px]"
                            placeholder="例如：实验目的、原理、步骤..."
                            value={draft.outlineText}
                            onChange={e => setDraft({ ...draft, outlineText: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                            实验细节
                        </label>
                        <textarea
                            className="w-full text-xs p-2 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y min-h-[80px]"
                            placeholder="描述具体的实验背景、数据、观察结果等..."
                            value={draft.detailsText}
                            onChange={e => setDraft({ ...draft, detailsText: e.target.value })}
                        />
                    </div>

                    {/* File Upload List */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                            参考文件 (PDF/图片)
                        </label>

                        <div className="space-y-2 mb-2">
                            {draft.files.map((file, idx) => (
                                <div key={file.id} className="p-2 border border-zinc-200 dark:border-zinc-800 rounded bg-zinc-50 dark:bg-zinc-900 text-xs">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                                            {file.source === 'url' ? (
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <LinkIcon size={14} className="text-purple-500 shrink-0" />
                                                    <input
                                                        type="text"
                                                        placeholder="输入 PDF 下载链接..."
                                                        className="flex-1 w-full px-1.5 py-0.5 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-700 dark:text-zinc-300 focus:border-blue-500 outline-none"
                                                        value={file.url}
                                                        onChange={(e) => updateFile(file.id, { url: e.target.value })}
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    {file.type === 'pdf' ? (
                                                        <FileText size={14} className="text-red-500 shrink-0" />
                                                    ) : (
                                                        <ImageIcon size={14} className="text-blue-500 shrink-0" />
                                                    )}
                                                    <span className="truncate font-medium text-zinc-700 dark:text-zinc-300" title={file.file?.name}>
                                                        {file.file?.name}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <button onClick={() => removeFile(file.id)} className="text-zinc-400 hover:text-red-500 transition-colors shrink-0">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    {/* Description Input */}
                                    <input
                                        type="text"
                                        placeholder="文件描述（可选）"
                                        className="w-full mb-2 px-2 py-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded focus:border-blue-500 outline-none"
                                        value={file.description}
                                        onChange={(e) => updateFile(file.id, { description: e.target.value })}
                                    />

                                    {/* Type Specific Controls */}
                                    {file.type === 'pdf' && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-zinc-500">页码:</span>
                                            <input
                                                type="text"
                                                className="w-10 px-1 py-0.5 text-center border rounded bg-white dark:bg-zinc-950"
                                                value={file.pdfPageStart}
                                                onChange={e => updateFile(file.id, { pdfPageStart: e.target.value })}
                                            />
                                            <span className="text-zinc-400">-</span>
                                            <input
                                                type="text"
                                                className="w-10 px-1 py-0.5 text-center border rounded bg-white dark:bg-zinc-950"
                                                value={file.pdfPageEnd}
                                                onChange={e => updateFile(file.id, { pdfPageEnd: e.target.value })}
                                            />
                                            {file.source === 'url' && (
                                                <span className="text-[10px] text-zinc-400 ml-auto">MinerU URL 模式</span>
                                            )}
                                        </div>
                                    )}

                                    {file.type === 'image' && (
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id={`ocr-${file.id}`}
                                                    checked={file.imageRecognize}
                                                    onChange={(e) => updateFile(file.id, { imageRecognize: e.target.checked })}
                                                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <label htmlFor={`ocr-${file.id}`} className="text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                                                    AI 识图 (GLM-4V)
                                                </label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id={`include-${file.id}`}
                                                    checked={file.shouldInclude}
                                                    onChange={(e) => updateFile(file.id, { shouldInclude: e.target.checked })}
                                                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <label htmlFor={`include-${file.id}`} className="text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                                                    生成到报告中
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                                <Upload size={14} className="text-zinc-400" />
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                    本地文件
                                </span>
                                <input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </label>

                            {draft.parserMode === 'mineru' && (
                                <button
                                    onClick={handleAddUrl}
                                    className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <LinkIcon size={14} className="text-purple-400" />
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                        PDF 链接
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Model & Parser Settings */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                AI 模型
                            </label>
                            <select
                                className="w-full text-xs p-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={draft.selectedModel}
                                onChange={e => setDraft({ ...draft, selectedModel: e.target.value as any })}
                            >
                                <option value="deepseek-chat">DeepSeek V3</option>
                                <option value="deepseek-reasoner">DeepSeek R1 (Reasoning)</option>
                                <option value="qwen3-max">Qwen 2.5 Max</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                PDF 解析模式
                            </label>
                            <select
                                className="w-full text-xs p-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={draft.parserMode}
                                onChange={e => {
                                    const mode = e.target.value as any;
                                    setDraft(prev => ({ ...prev, parserMode: mode }));
                                }}
                            >
                                <option value="mineru">MinerU (推荐)</option>
                                <option value="local">本地极速</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-1">
                            <input
                                type="checkbox"
                                id="thinking"
                                checked={draft.thinkingEnabled}
                                onChange={e => setDraft({ ...draft, thinkingEnabled: e.target.checked })}
                                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="thinking" className="text-xs text-zinc-600 dark:text-zinc-400 select-none">显示思考过程</label>
                        </div>

                        <button
                            onClick={handleRun}
                            disabled={status === 'preprocessing' || status === 'generating'}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded shadow-sm disabled:opacity-50 transition-colors"
                        >
                            {status === 'preprocessing' || status === 'generating' ? (
                                <>
                                    <Loader2 size={12} className="animate-spin" />
                                    {status === 'preprocessing' ? '处理中' : '生成中'}
                                </>
                            ) : (
                                <>
                                    <Play size={12} fill="currentColor" />
                                    开始生成
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Status / Output Section */}
                {error && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded border border-red-100 dark:border-red-900/30">
                        {error}
                    </div>
                )}

                {status !== 'idle' && (
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded bg-zinc-50 dark:bg-zinc-900/50 p-2 text-xs space-y-1">
                        <div className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                            <Loader2 size={10} className={status === 'done' ? 'hidden' : 'animate-spin'} />
                            {progressMsg}
                        </div>
                    </div>
                )}

                {/* Sent Prompt View */}
                {sentPrompt && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between" onClick={() => setShowPrompt(!showPrompt)}>
                            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1">
                                <Eye size={10} />
                                Sent Prompt {showPrompt ? '(Hide)' : '(Show)'}
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(sentPrompt);
                                    setIsCopied(true);
                                    setTimeout(() => setIsCopied(false), 2000);
                                }}
                                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-blue-500 transition-colors"
                            >
                                <Copy size={10} />
                            </button>
                        </div>
                        {showPrompt && (
                            <div className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded text-[10px] text-zinc-500 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto border border-zinc-200 dark:border-zinc-800">
                                {sentPrompt}
                            </div>
                        )}
                    </div>
                )}

                {/* Thought Stream */}
                {aiThought && (
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Reasoning</div>
                        <div className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded text-[10px] text-zinc-500 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto border border-zinc-200 dark:border-zinc-800">
                            {aiThought}
                        </div>
                    </div>
                )}

                {/* Response Preview */}
                {aiResponse && (
                    <div className="space-y-1 flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Response JSON</div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(aiResponse);
                                    setIsCopied(true);
                                    setTimeout(() => setIsCopied(false), 2000);
                                }}
                                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-blue-500 transition-colors"
                            >
                                {isCopied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                {isCopied ? '已复制' : '复制 JSON'}
                            </button>
                        </div>
                        <div className="flex-1 p-2 bg-zinc-100 dark:bg-zinc-900 rounded text-[10px] text-zinc-800 dark:text-zinc-300 font-mono whitespace-pre-wrap overflow-y-auto border border-zinc-200 dark:border-zinc-800">
                            {aiResponse}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            {status === 'done' && (
                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <button
                        onClick={handleInsert}
                        className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded shadow-sm flex items-center justify-center gap-2 transition-colors"
                    >
                        <ArrowRight size={16} />
                        插入生成内容
                    </button>
                    <p className="text-[10px] text-center text-zinc-400 mt-2">
                        将把生成的内容追加到当前文档
                    </p>
                </div>
            )}
        </div>
    );
}
