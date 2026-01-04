'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles } from 'lucide-react';
import { getToken } from '@/lib/auth';
import {
  chatWithDeepSeekStream,
  createProject,
  getManagePrompt,
  updateProject,
} from '@/lib/api';
import { extractJsonFromModelText, normalizeAiBlocksResponse } from '@/lib/ai-blocks';
import { blocksToTypst, injectDocumentSettings, type DocumentSettings, type TypstBlock } from '@/lib/typst';
import { applyPromptTemplate, buildUserInputJson, makeAiDebugHeader } from '@/lib/home-ai-utils';
// import { DEFAULT_AI_PROMPT_TEMPLATE } from '@/lib/home-default-template';
const DEFAULT_AI_PROMPT_TEMPLATE = 'Error: Prompt failed to load from backend (ai_prompts.json). Please check network or backend configuration.';

import { preparePdfContextWithDebug, type HomePdfContext, type PreparePdfContextDebug } from '@/lib/home-pdf-context';
import { useAiTestStore } from './AiTestStore';
import { JsonBlock, TextPanel, PdfContextVisualizer } from './AiTestRunnerPanels';

type StepState = {
  label: string;
  status: 'idle' | 'running' | 'done' | 'error';
  output?: unknown;
  error?: string;
};



export default function AiTestRunner() {
  const router = useRouter();
  const { draft, run, patchRun } = useAiTestStore();

  const [projectId, setProjectId] = useState<string>('');
  const [projectTitle, setProjectTitle] = useState<string>('');

  const [prepDebug, setPrepDebug] = useState<PreparePdfContextDebug | null>(null);
  const [pdfContext, setPdfContext] = useState<HomePdfContext | null>(null);

  const [promptTemplate, setPromptTemplate] = useState<string>('');
  const [finalPrompt, setFinalPrompt] = useState<string>('');

  const [aiResponse, setAiResponse] = useState<string>('');
  const [aiThought, setAiThought] = useState<string>('');
  const [aiUsage, setAiUsage] = useState<{
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
    prompt_cache_hit_tokens?: number | null;
    prompt_cache_miss_tokens?: number | null;
  } | null>(null);
  const [aiActualModel, setAiActualModel] = useState<string>('');

  const [jumpReady, setJumpReady] = useState(false);

  // Guard to prevent duplicate project creation in React StrictMode
  const creationStartedRef = useRef(false);

  const [steps, setSteps] = useState<Record<string, StepState>>({
    createProject: { label: '创建项目', status: 'idle' },
    pdfPreprocess: { label: 'PDF 预处理（OCR / 表格公式 / 图片提取）', status: 'idle' },
    buildPrompt: { label: '构造 DeepSeek Prompt', status: 'idle' },
    deepseek: { label: 'DeepSeek 生成报告（点击按钮触发）', status: 'idle' },
    saveAndOpen: { label: '保存并打开项目', status: 'idle' },
  });

  const setStep = (key: keyof typeof steps, patch: Partial<StepState>) => {
    setSteps((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  // Persist steps to store AFTER render commit.
  useEffect(() => {
    const id = projectId || run?.projectId;
    if (!id) return;
    patchRun({ steps });
  }, [steps, projectId, run?.projectId, patchRun]);

  // Restore prior run (so Back from /projects/[id] shows same outputs and does not re-run).
  useEffect(() => {
    if (!run?.projectId) return;
    // Avoid clobbering live UI state during the initial run.
    // (During the run we continuously patchRun; that would otherwise trigger this effect.)
    if (projectId) return;
    setProjectId(run.projectId);
    setProjectTitle(run.projectTitle || '');
    if (run.steps && typeof run.steps === 'object') {
      setSteps(run.steps as unknown as Record<string, StepState>);
    }
    setPrepDebug((run.prepDebug as PreparePdfContextDebug) ?? null);
    setPdfContext((run.pdfContext as HomePdfContext) ?? null);
    setPromptTemplate(run.promptTemplate || '');
    setFinalPrompt(run.finalPrompt || '');
    setAiResponse(run.aiResponse || '');
    setAiThought(run.aiThought || '');
    setAiUsage(
      (run.aiUsage as unknown as {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        total_tokens?: number | null;
        prompt_cache_hit_tokens?: number | null;
        prompt_cache_miss_tokens?: number | null;
      } | null) ?? null
    );
    setAiActualModel(run.aiActualModel || '');
    setJumpReady(!!run.jumpReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.projectId, projectId]);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!draft) return;
      if (run?.projectId) return; // already ran once; restore from store
      if (creationStartedRef.current) return; // prevent duplicate creation in StrictMode
      creationStartedRef.current = true;

      setStep('createProject', { status: 'running', error: undefined });
      setProjectId('');
      setProjectTitle('');
      setPrepDebug(null);
      setPdfContext(null);
      setPromptTemplate('');
      setFinalPrompt('');
      setAiResponse('');
      setAiThought('');
      setAiUsage(null);
      setAiActualModel('');
      setJumpReady(false);

      let createdId = '';
      let contextForPrompt: HomePdfContext | null = null;
      try {
        const title = draft.outlineText.trim().split(/\r?\n/)[0]?.trim() || 'AI 生成实验报告（AI-TEST）';
        const created = await createProject(title.slice(0, 200));
        // Note: We intentionally skip the !mounted check here because React StrictMode
        // might have "unmounted" this instance to run the effect again, but since
        // we use creationStartedRef to prevent the second run, we MUST allow the
        // first run to complete and update the state.
        createdId = created.id;
        setProjectId(created.id);
        setProjectTitle(created.title);
        setStep('createProject', { status: 'done', output: created });

        patchRun({
          projectId: created.id,
          projectTitle: created.title,
          jumpReady: false,
        });
      } catch (e) {
        if (!mounted) return;
        setStep('createProject', { status: 'error', error: e instanceof Error ? e.message : String(e) });
        return;
      }

      if (draft.pdfFile || (draft.parserMode === 'mineru' && draft.pdfUrl)) {
        setStep('pdfPreprocess', { status: 'running', error: undefined });
        try {
          const { context, debug } = await preparePdfContextWithDebug({
            projectId: createdId,
            pdfFile: draft.pdfFile,
            pdfUrl: draft.pdfUrl,
            pageStart: draft.pdfPageStart,
            pageEnd: draft.pdfPageEnd,
            parserMode: draft.parserMode,
            onStep: () => { },
          });

          // if (!mounted) return;
          contextForPrompt = context;
          setPrepDebug(debug);
          setPdfContext(context);
          setStep('pdfPreprocess', { status: 'done', output: debug });

          patchRun({
            prepDebug: debug,
            pdfContext: context,
          });
        } catch (e) {
          // if (!mounted) return;
          setStep('pdfPreprocess', { status: 'error', error: e instanceof Error ? e.message : String(e) });
        }
      } else {
        setStep('pdfPreprocess', { status: 'done', output: { skipped: true } });
        patchRun({
          prepDebug: { skipped: true },
        });
      }

      setStep('buildPrompt', { status: 'running', error: undefined });
      try {
        let template: string | null = null;
        try {
          const data = await getManagePrompt();
          template = (data.ai_prompt ?? '').trim() || null;
        } catch {
          // ignore (likely 403 for non-admin)
        }

        const { userInputJson, pdfContextJson } = buildUserInputJson({
          outlineText: draft.outlineText,
          detailsText: draft.detailsText,
          referenceFiles: draft.referenceFiles,
          selectedModel: draft.selectedModel,
          thinkingEnabled: draft.thinkingEnabled,
          pdfContext: contextForPrompt ?? null,
        });

        const tpl = template ?? DEFAULT_AI_PROMPT_TEMPLATE;

        let message = '';
        if (tpl.includes('{{PDF_CONTEXT_JSON}}')) {
          // New optimized template: Separate placeholders for better caching
          message = applyPromptTemplate(tpl, {
            USER_INPUT_JSON: userInputJson,
            PDF_CONTEXT_JSON: pdfContextJson,
            PROJECT_ID: createdId,
          });
        } else {
          // Legacy/Custom template: No separate {{PDF_CONTEXT_JSON}} placeholder.
          // We must merge PDF context back into USER_INPUT_JSON or prepend it.
          // This ensures the context is defined.
          const tempVars = {
            USER_INPUT_JSON: `【PDF Context (Fallback Injection)】:\n${pdfContextJson}\n\n${userInputJson}`,
            PDF_CONTEXT_JSON: '', // Unused
            PROJECT_ID: createdId,
          };
          message = tpl.replaceAll('{{USER_INPUT_JSON}}', tempVars.USER_INPUT_JSON).replaceAll('{{PROJECT_ID}}', tempVars.PROJECT_ID);
        }

        // if (!mounted) return;
        setPromptTemplate(tpl);
        setFinalPrompt(message);
        setStep('buildPrompt', { status: 'done', output: { used_manage_template: !!template } });

        patchRun({
          promptTemplate: tpl,
          finalPrompt: message,
        });
      } catch (e) {
        // if (!mounted) return;
        setStep('buildPrompt', { status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const canGenerate = !!draft && !!projectId && steps.buildPrompt.status === 'done' && !!finalPrompt.trim();

  const deriveProjectTitleFromBlocks = (blocks: TypstBlock[]): string | null => {
    for (const b of blocks) {
      if (b.type !== 'heading') continue;
      const text = (b.content ?? '').trim();
      if (!text) continue;

      // Prefer top-level heading as the project title.
      if ((b.level ?? 1) === 1) {
        return text;
      }
    }
    // Fallback to first heading if no level=1 found.
    const firstHeading = blocks.find((b) => b.type === 'heading' && (b.content ?? '').trim());
    return firstHeading ? (firstHeading.content ?? '').trim() : null;
  };

  const onGenerateProject = async () => {
    if (!draft) return;
    if (!projectId) return;

    setAiResponse('');
    setAiThought('');
    setAiUsage(null);
    setAiActualModel('');
    setJumpReady(false);

    setStep('deepseek', { status: 'running', error: undefined });
    patchRun({
      aiResponse: '',
      aiThought: '',
      aiUsage: null,
      aiActualModel: '',
      jumpReady: false,
    });

    try {
      const message = finalPrompt || '';
      if (!message.trim()) {
        throw new Error('Prompt 为空，无法生成');
      }

      let aiText = '';
      await chatWithDeepSeekStream(message, draft.selectedModel, draft.thinkingEnabled, (evt) => {
        if (evt.type === 'meta') {
          setAiActualModel(evt.model);
          patchRun({ aiActualModel: evt.model });
          return;
        }
        if (evt.type === 'thought') {
          setAiThought((prev) => prev + evt.delta);
          patchRun({ aiThought: (run?.aiThought || '') + evt.delta });
          return;
        }
        if (evt.type === 'content') {
          setAiResponse((prev) => prev + evt.delta);
          aiText += evt.delta;
          patchRun({ aiResponse: (run?.aiResponse || '') + evt.delta });
          return;
        }
        if (evt.type === 'usage') {
          setAiUsage(evt.usage ?? null);
          patchRun({ aiUsage: evt.usage ?? null });
        }
      });

      const raw = extractJsonFromModelText(aiText);
      const normalized = normalizeAiBlocksResponse({ raw, projectId });
      const parsedBlocks: TypstBlock[] = normalized.blocks;
      const parsedSettings: DocumentSettings | null = normalized.settings;

      const aiTitleRaw = deriveProjectTitleFromBlocks(parsedBlocks);
      const aiTitle = (aiTitleRaw ?? '')
        .replace(/^实验报告[:：]\s*/g, '')
        .replace(/^实验报告\s*/g, '')
        .trim()
        .slice(0, 200);
      const finalProjectTitle = aiTitle || projectTitle || 'AI 生成实验报告';

      const code = blocksToTypst(parsedBlocks, { settings: parsedSettings });
      const debugHeader = makeAiDebugHeader({
        model: aiActualModel || draft.selectedModel,
        thinkingEnabled: draft.thinkingEnabled,
        rawText: aiText,
        parsedJson: raw,
      });
      const saveCode = injectDocumentSettings(debugHeader + code, parsedSettings);

      setStep('deepseek', { status: 'done', output: { parsed_settings: parsedSettings, blocks_count: parsedBlocks.length } });
      setStep('saveAndOpen', { status: 'running', error: undefined });

      await updateProject(projectId, { title: finalProjectTitle, typst_code: saveCode });
      setProjectTitle(finalProjectTitle);
      patchRun({ projectTitle: finalProjectTitle });
      setStep('saveAndOpen', { status: 'done', output: { projectId } });

      // Do not auto-navigate; user explicitly clicks "跳转".
      setJumpReady(true);
      patchRun({
        jumpReady: true,
      });
    } catch (e) {
      setStep('deepseek', { status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const onJumpToEditor = () => {
    if (!projectId) return;
    router.push(`/projects/${projectId}`);
  };

  if (!draft) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">AI Test</div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            没有检测到待处理的输入。请从首页点击“生成项目”进入此页面。
          </div>
          <button
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={() => router.push('/')}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <header className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/icon.png" alt="LabFlow" width={32} height={32} />
            <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">AI Test</div>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors"
            >
              返回首页
            </button>
            <button
              onClick={() => router.push('/workspace')}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors"
            >
              我的工作区
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">流程状态</div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            该页面会清晰展示每一步的输出；最后点击“生成项目”会把内容写入项目并跳转到编辑器。
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(steps).map(([key, s]) => (
              <div
                key={key}
                className="border border-zinc-200 dark:border-zinc-800 rounded p-3 bg-zinc-50 dark:bg-zinc-900/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.label}</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">{s.status}</div>
                </div>
                {s.error ? <div className="text-xs text-red-600 mt-1">{s.error}</div> : null}
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={onGenerateProject}
              disabled={!canGenerate || steps.deepseek.status === 'running' || steps.saveAndOpen.status === 'running'}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {steps.deepseek.status === 'running' || steps.saveAndOpen.status === 'running' ? (
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

            {jumpReady ? (
              <button
                onClick={onJumpToEditor}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                跳转到编辑器
                <ArrowRight size={18} />
              </button>
            ) : null}
            <div className="text-xs text-zinc-500 dark:text-zinc-500">刷新页面会丢失 PDF/File（仅内存保存）</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: pipeline outputs */}
          <div className="space-y-4">
            <JsonBlock title="Step 1 - createProject 输出" value={steps.createProject.output} />
            <JsonBlock title="Step 2 - pdf preprocess debug（ingest/table/summaries）" value={prepDebug} />
            <PdfContextVisualizer context={pdfContext} />
          </div>

          {/* Right: prompt + AI outputs (large panels) */}
          <div className="space-y-4">
            <TextPanel title="Step 3 - prompt template（使用的模板）" value={promptTemplate} />
            <TextPanel title="Step 3 - final prompt（发送给 DeepSeek）" value={finalPrompt} />
            <TextPanel title="DeepSeek thought（reasoning）" value={aiThought} />
            <TextPanel title="DeepSeek response（content）" value={aiResponse} />
            <JsonBlock title="DeepSeek usage" value={aiUsage} />
          </div>
        </div>
      </div>
    </div>
  );
}
