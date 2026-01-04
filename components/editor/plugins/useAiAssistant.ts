import { useState, useRef } from 'react';
import { getToken } from '@/lib/auth';
import {
    chatWithDeepSeekStream,
    getAssistantPrompt,
} from '@/lib/api';
import { extractJsonFromModelText, normalizeAiBlocksResponse } from '@/lib/ai-blocks';
import { applyPromptTemplate, buildUserInputJson } from '@/lib/home-ai-utils';
import { preparePdfContextWithDebug } from '@/lib/home-pdf-context';
import type { TypstBlock } from '@/lib/typst';
import { AiContextFile, AiPluginDraft, DEFAULT_DRAFT } from './AiAssistantPlugin.types';

// Prompt template fallback
const DEFAULT_AI_PROMPT_TEMPLATE = `
你是一个专业的学术助手。请根据用户提供的【实验大纲】、【实验细节】和【参考文件上下文】，生成一份结构清晰的实验报告。
请返回 JSON 格式，包含 blocks（TypstBlock数组）和 settings。

{{USER_INPUT_JSON}}

{{PDF_CONTEXT_JSON}}
`;

interface UseAiAssistantProps {
    projectId: string;
    existingBlocks?: TypstBlock[];
    onInsertBlocks: (blocks: TypstBlock[]) => void;
    onClose: () => void;
}

export function useAiAssistant({ projectId, existingBlocks, onInsertBlocks, onClose }: UseAiAssistantProps) {
    // State
    const [draft, setDraft] = useState<AiPluginDraft>(DEFAULT_DRAFT);
    const [status, setStatus] = useState<'idle' | 'preprocessing' | 'generating' | 'done' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    // Progress / Debug info
    const [progressMsg, setProgressMsg] = useState('');
    const [prepDebug, setPrepDebug] = useState<Record<string, unknown>>({});
    const [sentPrompt, setSentPrompt] = useState<string>('');
    const [showPrompt, setShowPrompt] = useState(false);

    // AI Outputs
    const [aiThought, setAiThought] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [isCopied, setIsCopied] = useState(false);

    // Refs
    const abortControllerRef = useRef<AbortController | null>(null);

    // Handlers
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files;
        if (!selected) return;

        const newFiles: AiContextFile[] = Array.from(selected).map(file => {
            const isPdf = file.type === 'application/pdf';
            return {
                id: Math.random().toString(36).slice(2),
                file,
                source: 'local',
                type: isPdf ? 'pdf' : 'image',
                description: '',
                shouldInclude: true, // User requested default true
                // Set defaults
                pdfPageStart: isPdf ? '1' : undefined,
                pdfPageEnd: isPdf ? '5' : undefined,
                imageRecognize: !isPdf ? false : undefined,
            };
        });

        setDraft(prev => ({ ...prev, files: [...prev.files, ...newFiles] }));
        e.target.value = ''; // Reset input
    };

    const handleAddUrl = () => {
        const newFile: AiContextFile = {
            id: Math.random().toString(36).slice(2),
            source: 'url',
            url: '',
            type: 'pdf', // URL mode primarily supporting PDF ingest via MinerU
            description: '',
            pdfPageStart: '1',
            pdfPageEnd: '5',
        };
        setDraft(prev => ({ ...prev, files: [...prev.files, newFile] }));
    };

    const updateFile = (id: string, updates: Partial<AiContextFile>) => {
        setDraft(prev => ({
            ...prev,
            files: prev.files.map(f => f.id === id ? { ...f, ...updates } : f)
        }));
    };

    const removeFile = (id: string) => {
        setDraft(prev => ({
            ...prev,
            files: prev.files.filter(f => f.id !== id)
        }));
    };

    const uploadImage = async (file: File): Promise<string> => {
        const token = getToken();
        const form = new FormData();
        form.append('file', file);

        const res = await fetch(`/api/projects/${projectId}/images/upload`, {
            method: 'POST',
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: form,
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.detail || '上传图片失败');
        }

        const data = await res.json();
        return data?.url as string;
    };


    type ProcessedContext =
        | { type: 'pdf'; filename: string; description?: string; data: Record<string, unknown> }
        | { type: 'image'; filename: string; url: string; description?: string; visionAnalysis: string | null; shouldInclude?: boolean }
        | { type: 'error'; filename: string; error: string };

    const processFiles = async () => {
        const contexts: ProcessedContext[] = [];
        const debugs: Record<string, unknown> = {};

        for (const f of draft.files) {
            const displayName = f.source === 'url' ? (f.url || 'Untitled URL') : f.file?.name || 'Untitled File';
            setProgressMsg(`正在处理文件: ${displayName}...`);

            if (f.type === 'pdf') {
                try {
                    if (f.source === 'url' && !f.url?.trim()) {
                        throw new Error('URL 不能为空');
                    }

                    const { context, debug } = await preparePdfContextWithDebug({
                        projectId,
                        pdfFile: f.source === 'local' ? f.file || null : null,
                        pdfUrl: f.source === 'url' ? f.url : undefined,
                        pageStart: f.pdfPageStart || '1',
                        pageEnd: f.pdfPageEnd || '5',
                        parserMode: draft.parserMode,
                        onStep: (step) => setProgressMsg(`处理 ${displayName}: ${step}`),
                    });

                    contexts.push({
                        type: 'pdf',
                        filename: displayName,
                        description: f.description,
                        data: context
                    });
                    debugs[displayName] = debug;
                } catch (e) {
                    console.error(`PDF processing failed for ${displayName}:`, e);
                    contexts.push({
                        type: 'error',
                        filename: displayName,
                        error: String(e)
                    });
                }
            } else if (f.type === 'image') {
                // PRE-UPLOAD IMAGE
                let uploadedUrl = '';
                if (f.source === 'local' && f.file) {
                    try {
                        setProgressMsg(`正在上传图片: ${displayName}...`);
                        uploadedUrl = await uploadImage(f.file);
                    } catch (e) {
                        console.error(`Image upload failed for ${displayName}:`, e);
                        contexts.push({ type: 'error', filename: displayName, error: 'Upload failed: ' + String(e) });
                        continue;
                    }
                }

                let visionSummary = null;
                if (f.imageRecognize) {
                    visionSummary = "(Image content analysis pending backend upload support)";
                }

                contexts.push({
                    type: 'image',
                    filename: displayName,
                    url: uploadedUrl,
                    description: f.description,
                    visionAnalysis: visionSummary,
                    shouldInclude: f.shouldInclude
                });
            }
        }
        return { contexts, debugs };
    };

    const handleRun = async () => {
        const hasText = draft.outlineText.trim() || draft.detailsText.trim();
        const hasFiles = draft.files.length > 0;

        if (!hasText && !hasFiles) {
            setError("请提供 实验大纲、实验细节 或 上传文件");
            return;
        }

        const invalidUrlItem = draft.files.find(f => f.source === 'url' && !f.url?.trim());
        if (invalidUrlItem) {
            setError("请填写 PDF 链接地址");
            return;
        }

        setStatus('preprocessing');
        setError(null);
        setAiThought('');
        setAiResponse('');
        setSentPrompt('');
        setProgressMsg('正在准备上下文...');

        abortControllerRef.current = new AbortController();

        try {
            // 1. File Preprocessing
            const { contexts, debugs } = await processFiles();
            setPrepDebug(debugs);

            // 2. Build Prompt
            setProgressMsg('正在构建 Prompt...');
            let template = DEFAULT_AI_PROMPT_TEMPLATE;
            try {
                const data = await getAssistantPrompt();
                template = data.ai_prompt ?? '';
            } catch {
                // ignore
            }

            const multiFileContext = {
                files: contexts.map(c => {
                    if (c.type === 'pdf') {
                        return {
                            filename: c.filename,
                            user_description: c.description,
                            parsed_content: c.data
                        };
                    } else if (c.type === 'image') {
                        return {
                            filename: c.filename,
                            url: c.url,
                            user_description: c.description,
                            vision_analysis: c.visionAnalysis,
                            should_include: c.shouldInclude
                        };
                    } else {
                        // Error case
                        return {
                            filename: c.filename,
                            error: c.error,
                            status: 'failed'
                        };
                    }
                })
            };

            const pdfContextString = JSON.stringify(multiFileContext, null, 2);

            const { userInputJson, existingBlocksJson } = buildUserInputJson({
                outlineText: draft.outlineText,
                detailsText: draft.detailsText,
                referenceFiles: [],
                selectedModel: draft.selectedModel,
                thinkingEnabled: draft.thinkingEnabled,
                existingBlocks: existingBlocks,
                pdfContext: null,
            });

            console.log('[AiAssistantPlugin] Multi-file Context:', multiFileContext);

            let finalMessage = '';
            if (template.includes('{{PDF_CONTEXT_JSON}}')) {
                finalMessage = applyPromptTemplate(template, {
                    USER_INPUT_JSON: userInputJson,
                    PDF_CONTEXT_JSON: pdfContextString,
                    PROJECT_ID: projectId,
                    EXISTING_BLOCKS_JSON: existingBlocksJson,
                });
            } else {
                const tempVars = {
                    USER_INPUT_JSON: `【Reference Files Context】:\n${pdfContextString}\n\n${userInputJson}`,
                    PDF_CONTEXT_JSON: '',
                    PROJECT_ID: projectId,
                };
                finalMessage = template.replaceAll('{{USER_INPUT_JSON}}', tempVars.USER_INPUT_JSON).replaceAll('{{PROJECT_ID}}', tempVars.PROJECT_ID);
            }

            setSentPrompt(finalMessage);

            // 3. Call DeepSeek
            setStatus('generating');
            setProgressMsg('AI 思考中...');

            await chatWithDeepSeekStream(finalMessage, draft.selectedModel, draft.thinkingEnabled, (evt) => {
                if (evt.type === 'thought') {
                    setAiThought((prev) => prev + evt.delta);
                } else if (evt.type === 'content') {
                    setAiResponse((prev) => prev + evt.delta);
                }
            });

            // 4. Finish
            setStatus('done');
            setProgressMsg('生成完成！请点击下方按钮插入到文档。');

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
            onClose();
        } catch (e) {
            alert('解析并插入失败: ' + e);
        }
    };

    return {
        draft,
        setDraft,
        status,
        error,
        progressMsg,
        prepDebug,
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
    };
}
