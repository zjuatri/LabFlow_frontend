'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, FileText, Upload, X, ArrowRight, Loader2, Play, Copy, Check } from 'lucide-react';
import { getToken } from '@/lib/auth';
import {
    chatWithDeepSeekStream,
    getManagePrompt,
    getAssistantPrompt,
} from '@/lib/api';
import { extractJsonFromModelText, normalizeAiBlocksResponse } from '@/lib/ai-blocks';
import { blocksToTypst, injectDocumentSettings, type DocumentSettings, type TypstBlock } from '@/lib/typst';
import { applyPromptTemplate, buildUserInputJson, makeAiDebugHeader } from '@/lib/home-ai-utils'; // Reusing utils
import { preparePdfContextWithDebug, type HomePdfContext, type PreparePdfContextDebug } from '@/lib/home-pdf-context';

/* --------------------------------------------------------------------------------
 * Types (Simplified from AiTestStore)
 * -------------------------------------------------------------------------------- */

export type AiPluginDraft = {
    outlineText: string;
    detailsText: string;
    // Simplified file handling: just one PDF for now as primary context?
    // Or support the same list? Let's support the complexity the user had.
    // Actually, let's keep it simple: One PDF context + Text
    pdfFile: File | null;
    pdfPageStart: string;
    pdfPageEnd: string;
    parserMode: 'local' | 'mineru';
    selectedModel: 'deepseek-chat' | 'deepseek-reasoner' | 'qwen3-max';
    thinkingEnabled: boolean;
};

const DEFAULT_DRAFT: AiPluginDraft = {
    outlineText: '',
    detailsText: '',
    pdfFile: null,
    pdfPageStart: '1',
    pdfPageEnd: '5',
    parserMode: 'mineru',
    selectedModel: 'deepseek-chat',
    thinkingEnabled: false,
};

// Prompt template fallback
const DEFAULT_AI_PROMPT_TEMPLATE = `
你是一个专业的学术助手。请根据用户提供的【实验大纲】和【PDF上下文】，生成一份结构清晰的实验报告。
请返回 JSON 格式，包含 blocks（TypstBlock数组）和 settings。

{{USER_INPUT_JSON}}

{{PDF_CONTEXT_JSON}}
`;

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
    // State
    const [draft, setDraft] = useState<AiPluginDraft>(DEFAULT_DRAFT);
    const [status, setStatus] = useState<'idle' | 'preprocessing' | 'generating' | 'done' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    // Progress / Debug info
    const [progressMsg, setProgressMsg] = useState('');
    const [prepDebug, setPrepDebug] = useState<PreparePdfContextDebug | null>(null);

    // AI Outputs
    const [aiThought, setAiThought] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [isCopied, setIsCopied] = useState(false);

    // Refs
    const abortControllerRef = useRef<AbortController | null>(null);

    // Handlers
    const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setDraft(prev => ({ ...prev, pdfFile: file }));
        }
    };

    const handleRun = async () => {
        if (!draft.outlineText.trim() && !draft.detailsText.trim() && !draft.pdfFile) {
            setError("请提供 实验大纲、实验细节 或 上传 PDF");
            return;
        }

        setStatus('preprocessing');
        setError(null);
        setAiThought('');
        setAiResponse('');
        setProgressMsg('正在准备上下文...');

        abortControllerRef.current = new AbortController();

        try {
            /* ----------------------------------------------------------------
             * 1. PDF Preprocessing
             * ---------------------------------------------------------------- */
            let contextForPrompt: HomePdfContext | null = null;

            if (draft.pdfFile) {
                setProgressMsg('正在解析 PDF (OCR)...');
                const { context, debug } = await preparePdfContextWithDebug({
                    projectId, // Use current project ID for storing images if needed
                    pdfFile: draft.pdfFile,
                    pageStart: draft.pdfPageStart,
                    pageEnd: draft.pdfPageEnd,
                    parserMode: draft.parserMode,
                    onStep: (step) => setProgressMsg(`PDF处理: ${step}`),
                });
                contextForPrompt = context;
                setPrepDebug(debug);
            }

            /* ----------------------------------------------------------------
             * 2. Build Prompt
             * ---------------------------------------------------------------- */
            setProgressMsg('正在构建 Prompt...');
            let template = DEFAULT_AI_PROMPT_TEMPLATE;
            try {
                const data = await getAssistantPrompt();
                template = data.ai_prompt ?? '';
            } catch {
                // ignore
            }

            const assistantFallback = `你是实验报告续写助手。只输出 JSON，不要输出 Markdown 或解释。
当前文档已有内容：{{EXISTING_BLOCKS_JSON}}
下面是用户提供的信息：{{USER_INPUT_JSON}}
【必须使用的 project_id】{{PROJECT_ID}}`;

            const tpl = template ?? assistantFallback;

            const { userInputJson, pdfContextJson, existingBlocksJson } = buildUserInputJson({
                outlineText: draft.outlineText,
                detailsText: draft.detailsText,
                referenceFiles: [], // TODO: Add support if needed
                selectedModel: draft.selectedModel,
                thinkingEnabled: draft.thinkingEnabled,
                existingBlocks: existingBlocks,
                pdfContext: contextForPrompt,
            });

            // Debug: log existing blocks being sent to AI
            console.log('[AiAssistantPlugin] existingBlocks count:', existingBlocks?.length ?? 0);
            console.log('[AiAssistantPlugin] existingBlocksJson:', existingBlocksJson);

            let finalMessage = '';
            if (template.includes('{{PDF_CONTEXT_JSON}}')) {
                finalMessage = applyPromptTemplate(template, {
                    USER_INPUT_JSON: userInputJson,
                    PDF_CONTEXT_JSON: pdfContextJson,
                    PROJECT_ID: projectId,
                    EXISTING_BLOCKS_JSON: existingBlocksJson,
                });
            } else {
                // Fallback legacy template support
                const tempVars = {
                    USER_INPUT_JSON: `【PDF Context】:\n${pdfContextJson}\n\n${userInputJson}`,
                    PDF_CONTEXT_JSON: '',
                    PROJECT_ID: projectId,
                };
                finalMessage = template.replaceAll('{{USER_INPUT_JSON}}', tempVars.USER_INPUT_JSON).replaceAll('{{PROJECT_ID}}', tempVars.PROJECT_ID);
            }

            /* ----------------------------------------------------------------
             * 3. Call DeepSeek
             * ---------------------------------------------------------------- */
            setStatus('generating');
            setProgressMsg('AI 思考中...');

            let fullText = '';
            await chatWithDeepSeekStream(finalMessage, draft.selectedModel, draft.thinkingEnabled, (evt) => {
                if (evt.type === 'thought') {
                    setAiThought((prev) => prev + evt.delta);
                } else if (evt.type === 'content') {
                    setAiResponse((prev) => prev + evt.delta);
                    fullText += evt.delta;
                }
            });

            /* ----------------------------------------------------------------
             * 4. Parse & Finish
             * ---------------------------------------------------------------- */
            setProgressMsg('正在解析结果...');
            const rawJson = extractJsonFromModelText(fullText);
            const normalized = normalizeAiBlocksResponse({ raw: rawJson, projectId });

            setStatus('done');
            setProgressMsg('生成完成！请点击下方按钮插入到文档。');

            // Allow user to review before adhering?
            // For now, we just keep the state 'done' and user clicks a button to insert.
            // But we need to store the parsed blocks to insert them.
            // Let's store them in a ref or derived state? 
            // We can just re-parse on insert or store in state.
            // Storing in state is safer.
            // For now, let's just parse again on insert or keep "aiResponse" and parse on-demand.

        } catch (e) {
            setStatus('error');
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const handleInsert = () => {
        try {
            const rawJson = extractJsonFromModelText(aiResponse);
            const normalized = normalizeAiBlocksResponse({ raw: rawJson, projectId });
            onInsertBlocks(normalized.blocks);
            // Maybe notify success?
        } catch (e) {
            alert('解析并插入失败: ' + e);
        }
    };

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

                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                            参考 PDF (可选)
                        </label>
                        <div className="flex items-center gap-2">
                            <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                <Upload size={14} className="text-zinc-400" />
                                <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                    {draft.pdfFile ? draft.pdfFile.name : "点击上传 PDF"}
                                </span>
                                <input type="file" accept=".pdf" className="hidden" onChange={handlePdfChange} />
                            </label>
                            {draft.pdfFile && (
                                <button
                                    onClick={() => setDraft({ ...draft, pdfFile: null })}
                                    className="p-2 text-zinc-400 hover:text-red-500"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        {draft.pdfFile && (
                            <div className="mt-2 flex items-center gap-2 text-xs">
                                <span className="text-zinc-500 text-nowrap">页码范围:</span>
                                <input
                                    type="text"
                                    className="w-12 px-1 py-0.5 text-center border rounded bg-zinc-50 dark:bg-zinc-900"
                                    value={draft.pdfPageStart}
                                    onChange={e => setDraft({ ...draft, pdfPageStart: e.target.value })}
                                />
                                <span className="text-zinc-400">-</span>
                                <input
                                    type="text"
                                    className="w-12 px-1 py-0.5 text-center border rounded bg-zinc-50 dark:bg-zinc-900"
                                    value={draft.pdfPageEnd}
                                    onChange={e => setDraft({ ...draft, pdfPageEnd: e.target.value })}
                                />
                            </div>
                        )}
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
                                onChange={e => setDraft({ ...draft, parserMode: e.target.value as any })}
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
