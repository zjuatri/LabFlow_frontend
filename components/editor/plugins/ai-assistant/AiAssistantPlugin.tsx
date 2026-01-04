import React, { useRef, useEffect } from 'react';
import { Bot, Paperclip, Send, X, FileText, Image as ImageIcon, Link as LinkIcon, ChevronDown, ChevronRight, Loader2, Sparkles, AlertCircle, Copy, Check } from 'lucide-react';
import { EditorPlugin, EditorPluginProps } from '../types';
import { pluginRegistry } from '../registry';
import { useAiAssistant } from './useAiAssistant';
import { AiContextFile } from './AiAssistantPlugin.types';

export function AiAssistantPlugin({ projectId, existingBlocks, onInsertBlocks, onClose }: EditorPluginProps) {
    const {
        draft,
        setDraft,
        status,
        error,
        progressMsg,
        sentPrompt,
        aiThought,
        aiResponse,
        handleFileChange,
        handleAddUrl,
        updateFile,
        removeFile,
        handleRun,
        handleInsert,
    } = useAiAssistant({ projectId, existingBlocks, onInsertBlocks, onClose });

    const [showDebug, setShowDebug] = React.useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const thoughtRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of response when generating
    useEffect(() => {
        if (status === 'generating') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [aiResponse, status, aiThought]);

    const isBusy = status === 'preprocessing' || status === 'generating';

    const renderFileItem = (file: AiContextFile) => {
        const isPdf = file.type === 'pdf';
        const isImage = file.type === 'image';
        const isOffice = file.type === 'office';

        return (
            <div key={file.id} className="group relative flex flex-col gap-2 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
                <div className="flex items-start gap-3">
                    <div className="mt-1 shrink-0 p-2 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                        {isPdf && <FileText className="w-5 h-5 text-red-500" />}
                        {isImage && <ImageIcon className="w-5 h-5 text-blue-500" />}
                        {isOffice && <FileText className="w-5 h-5 text-orange-500" />}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate" title={file.file?.name || file.url}>
                                {file.source === 'url' ? (file.url || '新 URL') : file.file?.name}
                            </span>
                            <button
                                onClick={() => removeFile(file.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-all rounded hover:bg-zinc-200 dark:hover:bg-zinc-800"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {file.source === 'url' && (
                            <input
                                type="text"
                                value={file.url}
                                onChange={(e) => updateFile(file.id, { url: e.target.value })}
                                placeholder="粘贴 PDF 链接..."
                                className="w-full px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        )}

                        <input
                            type="text"
                            value={file.description}
                            onChange={(e) => updateFile(file.id, { description: e.target.value })}
                            placeholder="添加文件描述（可选）..."
                            className="w-full px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />

                        {isPdf && (
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                                <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={file.usePageRange}
                                        onChange={(e) => updateFile(file.id, { usePageRange: e.target.checked })}
                                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                    />
                                    页码范围
                                </label>

                                {file.usePageRange && (
                                    <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-200">
                                        <input
                                            type="text"
                                            value={file.pdfPageStart}
                                            onChange={(e) => updateFile(file.id, { pdfPageStart: e.target.value })}
                                            className="w-12 px-1.5 py-0.5 text-center border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950"
                                            placeholder="1"
                                        />
                                        <span>-</span>
                                        <input
                                            type="text"
                                            value={file.pdfPageEnd}
                                            onChange={(e) => updateFile(file.id, { pdfPageEnd: e.target.value })}
                                            className="w-12 px-1.5 py-0.5 text-center border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950"
                                            placeholder="5"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {isImage && (
                            <div className="flex flex-col gap-1.5">
                                <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={file.shouldInclude}
                                        onChange={(e) => updateFile(file.id, { shouldInclude: e.target.checked })}
                                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                    />
                                    放入报告
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={file.imageRecognize}
                                        onChange={(e) => updateFile(file.id, { imageRecognize: e.target.checked })}
                                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                    />
                                    识别图片内容
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 text-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md text-blue-600 dark:text-blue-400">
                        <Bot size={18} />
                    </div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">AI 助手</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-all"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto w-full">
                <div className="p-4 space-y-6 max-w-full">

                    {/* File Context Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">参考文件</h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddUrl}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                >
                                    <LinkIcon size={12} />
                                    添加链接
                                </button>
                                <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md cursor-pointer transition-colors">
                                    <Paperclip size={12} />
                                    上传文件
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={handleFileChange}
                                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.ppt,.pptx"
                                    />
                                </label>
                            </div>
                        </div>

                        {draft.files.length > 0 ? (
                            <div className="space-y-3">
                                {draft.files.map(renderFileItem)}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-400">
                                <FileText size={24} className="mb-2 opacity-50" />
                                <span className="text-xs">暂无文件</span>
                            </div>
                        )}
                    </div>

                    {/* Inputs Section */}
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">实验大纲</label>
                            <textarea
                                value={draft.outlineText}
                                onChange={(e) => setDraft(prev => ({ ...prev, outlineText: e.target.value }))}
                                placeholder="例如：1. 引言 2. 实验方法..."
                                className="w-full h-24 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:border-blue-500 transition-all resize-y"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">实验细节</label>
                            <textarea
                                value={draft.detailsText}
                                onChange={(e) => setDraft(prev => ({ ...prev, detailsText: e.target.value }))}
                                placeholder="粘贴原始数据或具体要求..."
                                className="w-full h-32 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:border-blue-500 transition-all resize-y"
                            />
                        </div>
                    </div>

                    {/* Model Settings */}
                    <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">PDF 解析方式</label>
                            <select
                                value={draft.parserMode}
                                onChange={(e) => setDraft(prev => ({ ...prev, parserMode: e.target.value as 'local' | 'mineru' }))}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:border-blue-500 transition-all"
                            >
                                <option value="mineru">MinerU（云端解析，推荐）</option>
                                <option value="local">本地解析</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">选择模型</label>
                            <select
                                value={draft.selectedModel}
                                onChange={(e) => setDraft(prev => ({ ...prev, selectedModel: e.target.value as 'deepseek-chat' | 'deepseek-reasoner' | 'qwen3-max' }))}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:border-blue-500 transition-all"
                            >
                                <option value="deepseek-chat">DeepSeek Chat</option>
                                <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                                <option value="qwen3-max">Qwen3 Max</option>
                            </select>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200">
                            <input
                                type="checkbox"
                                checked={draft.thinkingEnabled}
                                onChange={(e) => setDraft(prev => ({ ...prev, thinkingEnabled: e.target.checked }))}
                                className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-xs font-medium flex items-center gap-1.5">
                                <Sparkles size={12} className={draft.thinkingEnabled ? "text-purple-500" : ""} />
                                启用深度思考
                            </span>
                        </label>
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={handleRun}
                        disabled={isBusy}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white transition-all
                            ${isBusy
                                ? 'bg-zinc-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-sm hover:shadow'
                            }`}
                    >
                        {isBusy ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                {status === 'preprocessing' ? '正在处理文件...' : 'AI 思考中...'}
                            </>
                        ) : (
                            <>
                                <Send size={16} />
                                生成报告
                            </>
                        )}
                    </button>

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-lg text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Status Message */}
                    {progressMsg && !error && (
                        <div className="text-center text-xs text-zinc-500 animate-pulse">
                            {progressMsg}
                        </div>
                    )}

                    {/* Output Section */}
                    {(aiThought || aiResponse) && (
                        <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                            {/* Chain of Thought */}
                            {aiThought && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-medium text-purple-600 dark:text-purple-400">
                                        <Sparkles size={12} />
                                        推理过程
                                    </div>
                                    <div ref={thoughtRef} className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/20 text-xs text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                                        {aiThought}
                                    </div>
                                </div>
                            )}

                            {/* Response */}
                            {aiResponse && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                            <Bot size={12} className="text-blue-600" />
                                            生成内容（预览）
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm leading-relaxed text-zinc-800 dark:text-zinc-300 font-mono whitespace-pre-wrap max-h-80 overflow-y-auto custom-scrollbar shadow-inner">
                                        {aiResponse}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    <button
                                        onClick={handleInsert}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow transition-all active:scale-[0.98]"
                                    >
                                        <Check size={16} />
                                        插入到文档
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Debug Info Section - Toggleable */}
                    <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
                        <button
                            onClick={() => setShowDebug(!showDebug)}
                            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        >
                            {showDebug ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            调试信息
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">仅开发者</span>
                        </button>

                        {showDebug && (
                            <div className="mt-3 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                {sentPrompt && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-zinc-500 uppercase">上次发送的 Prompt</label>
                                        <div className="relative group">
                                            <pre className="p-2 rounded bg-zinc-100 dark:bg-zinc-900 text-[10px] text-zinc-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap border border-zinc-200 dark:border-zinc-800">
                                                {sentPrompt}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                                {aiResponse && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-zinc-500 uppercase">上次响应 JSON</label>
                                        <pre className="p-2 rounded bg-zinc-100 dark:bg-zinc-900 text-[10px] text-zinc-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap border border-zinc-200 dark:border-zinc-800">
                                            {aiResponse}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

export const aiAssistantPluginDefinition: EditorPlugin = {
    id: 'ai-assistant',
    name: 'AI 助手',
    icon: Bot,
    component: AiAssistantPlugin,
    description: '使用 AI 根据大纲和文件生成实验报告。',
};

pluginRegistry.register(aiAssistantPluginDefinition);
