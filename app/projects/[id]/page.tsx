'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save, Undo2, Redo2, Settings, ArrowLeft, Download } from 'lucide-react';

import BlockEditor from '@/components/BlockEditor';
import {
  TypstBlock,
  blocksToTypst,
  typstToBlocks,
  defaultDocumentSettings,
  type DocumentSettings,
  stripDocumentSettings,
  injectDocumentSettings,
} from '@/lib/typst';
import { clearToken, getToken } from '@/lib/auth';
import { getProject, updateProject } from '@/lib/api';
import { DEFAULT_TYPST_CODE } from '@/lib/typst-default';
import { useBidirectionalScrollSync } from '@/lib/bidirectional-scroll-sync';
import { SvgPage } from './SvgPage';

// In production/Docker we typically proxy /api/* through the same origin.
// For local dev, set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000.
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

type EditorMode = 'source' | 'visual';

function extractAiDebug(typst_code: string): { debugText: string | null; rest: string } {
  const start = typst_code.indexOf('/* LF_AI_DEBUG v1');
  if (start < 0) return { debugText: null, rest: typst_code };
  const end = typst_code.indexOf('*/', start);
  if (end < 0) return { debugText: typst_code.slice(start), rest: '' };
  const debugText = typst_code.slice(start, end + 2);
  const rest = (typst_code.slice(0, start) + typst_code.slice(end + 2)).trimStart();
  return { debugText, rest };
}

export default function ProjectEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [mode, setMode] = useState<EditorMode>('visual');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [blocks, setBlocks] = useState<TypstBlock[]>([]);
  const [syncSource, setSyncSource] = useState<'code' | 'blocks'>('code');

  const [docSettings, setDocSettings] = useState<DocumentSettings>({ ...defaultDocumentSettings });

  const [aiDebug, setAiDebug] = useState<string | null>(null);
  const [showAiDebug, setShowAiDebug] = useState(false);

  const [svgPages, setSvgPages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<{ pageIndex: number; localIndex: number } | null>(null);
  const [highlightNonce, setHighlightNonce] = useState(0);
  const [clickAnchor, setClickAnchor] = useState<{ pageIndex: number; localIndex: number } | null>(null);
  
  const [history, setHistory] = useState<Array<{ blocks: TypstBlock[]; settings: DocumentSettings }>>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const isRestoringRef = useRef(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const blankCursorRef = useRef(0);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const registerPageRef = useCallback((pageIndex: number, el: HTMLDivElement | null) => {
    pageRefs.current[pageIndex] = el;
  }, []);

  useBidirectionalScrollSync({
    mode,
    svgPages,
    blocksLength: blocks.length,
    previewRef,
    editorScrollRef,
    pageRefs,
    setActiveAnchor,
  });

  const findAnswerBlankIndexes = useCallback((): number[] => {
    const idx: number[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type !== 'paragraph') continue;
      if (!b.placeholder) continue;
      const txt = (b.content ?? '').replace(/\u200B/g, '').trim();
      if (txt.length === 0) idx.push(i);
    }
    return idx;
  }, [blocks]);

  const jumpToNextBlank = useCallback(() => {
    const blanks = findAnswerBlankIndexes();
    if (blanks.length === 0) return;
    const start = blankCursorRef.current % blanks.length;
    const targetIndex = blanks[start];
    blankCursorRef.current = start + 1;

    const container = editorScrollRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-block-index="${targetIndex}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus first editable inside the block if possible.
    const editable = el.querySelector('[contenteditable="true"]') as HTMLElement | null;
    editable?.focus();
  }, [findAnswerBlankIndexes]);

  const buildRenderCodeForPreview = useCallback(() => {
    // Keep saved `code` clean. Only inject markers into the code sent to renderer.
    if (mode !== 'visual') return code;
    // Use a box with baseline to keep marker and content together during page breaks.
    // The marker is placed at the start of the block content using place() inside the box.
    const wrapWithMarker = (content: string) => {
      // We use a stack/block approach: first output the marker, then the content.
      // To ensure they stay together on page breaks, we check if content is an image/figure.
      // For images and figures, wrap in a box so marker + content move together.
      const trimmed = content.trim();
      const isImage =
        trimmed.startsWith('#image(') ||
        /^#align\(\s*(?:left|center|right)\s*,\s*image\(/.test(trimmed) ||
        trimmed.startsWith('#align(center)[(未生成图表)]') ||
        trimmed.includes('LF_CHART:') ||
        trimmed.includes('LF_IMAGE:');
      const isFigure = trimmed.startsWith('#figure(');
      
      const markerCode = '#place(dx: -50cm, rect(width: 1pt, height: 1pt, fill: rgb("000001")))';
      
      if (isImage || isFigure) {
        // Wrap in a block that keeps marker and content together.
        // We use width: 100% to ensure the block spans the page, allowing internal #align to work.
        // Without explicit width, #block might shrink-wrap or behave differently.
        return `#block(width: 100%)[${markerCode}${content}]`;
      }
      
      // For other content (paragraphs, headings, etc.), the simple approach works
      return `${markerCode}\n${content}`;
    };
    
    const markerLine = '#place(dx: -50cm, rect(width: 1pt, height: 1pt, fill: rgb("000001")))';
    // Add a trailing sentinel marker to properly bound the last block for highlight.
    return (
      blocks
        .map((b) => wrapWithMarker(blocksToTypst([b], { settings: docSettings })))
        .join('\n\n') +
      `\n\n${markerLine}`
    );
  }, [blocks, code, docSettings, mode]);

  // auth guard
  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
    }
  }, [router]);

  // load project
  useEffect(() => {
    (async () => {
      try {
        const p = await getProject(projectId);
        const rawCode = (p.typst_code ?? '').trim() ? (p.typst_code ?? '') : DEFAULT_TYPST_CODE;

        const { debugText, rest } = extractAiDebug(rawCode);
        setAiDebug(debugText);

        const raw = rest;
        const { code: initialCode, settings } = stripDocumentSettings(raw);
        setTitle(p.title);
        setCode(initialCode);
        setBlocks(typstToBlocks(initialCode));
        setDocSettings(settings);

        // initialize history with loaded state
        setHistory([{ blocks: typstToBlocks(initialCode), settings }]);
        setHistoryIndex(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '加载项目失败';
        if (msg.toLowerCase().includes('not authenticated') || msg.toLowerCase().includes('invalid token')) {
          clearToken();
          router.push('/login');
          return;
        }
        setError(msg);
      }
    })();
  }, [projectId, router]);

  const renderTypst = useCallback(async (typstCode: string) => {
    if (!typstCode.trim()) {
      setSvgPages([]);
      setError(null);
      return;
    }

    setIsRendering(true);
    setError(null);

    try {
      const token = getToken();
      const response = await fetch(`${BASE_URL}/api/render-typst`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: typstCode }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || 'Rendering failed');
      }

      const data = await response.json();
      setSvgPages(data.pages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSvgPages([]);
    } finally {
      setIsRendering(false);
    }
  }, []);

  const downloadPdf = useCallback(async () => {
    const typstCode = buildRenderCodeForPreview();
    if (!typstCode.trim()) return;

    try {
      const token = getToken();
      const response = await fetch(`${BASE_URL}/api/render-typst/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: typstCode }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || 'PDF 生成失败');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'typst'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [BASE_URL, buildRenderCodeForPreview, title]);

  // code -> blocks
  useEffect(() => {
    if (syncSource === 'code' && mode === 'visual') {
      setBlocks(typstToBlocks(code));
    }
  }, [code, mode, syncSource]);

  // Handle block click and scroll to corresponding position in preview
  const handleBlockClick = useCallback((index: number) => {
    if (!previewRef.current || svgPages.length === 0) return;

    // Map global block index -> (pageIndex, localIndex) by counting markers per page.
    // NOTE: We inject a trailing sentinel marker after the last block; it must be ignored here.
    const markerCounts = svgPages.map((p) => (p.match(/fill="#000001"/g) || []).length);
    const totalMarkers = markerCounts.reduce((a, b) => a + b, 0);
    const totalBlocks = Math.max(0, totalMarkers - 1);
    if (totalBlocks === 0) return;

    const safeIndex = Math.max(0, Math.min(index, totalBlocks - 1));

    // Sentinel is always the last marker, so it lives on the last page that has any markers.
    let sentinelPage = -1;
    for (let i = markerCounts.length - 1; i >= 0; i--) {
      if (markerCounts[i] > 0) {
        sentinelPage = i;
        break;
      }
    }

    let remaining = safeIndex;
    let pageIndex = 0;
    let localIndex = 0;
    for (let i = 0; i < svgPages.length; i++) {
      const rawCount = markerCounts[i] || 0;
      const usableCount = i === sentinelPage ? Math.max(0, rawCount - 1) : rawCount;
      if (remaining < usableCount) {
        pageIndex = i;
        localIndex = remaining;
        break;
      }
      remaining -= usableCount;
    }

    // Highlight should happen only on explicit block click (not on scroll-sync anchor updates).
    setHighlightNonce((n) => n + 1);
    setClickAnchor({ pageIndex, localIndex });
    setTimeout(() => setClickAnchor(null), 1500);
  }, [svgPages]);

  const cloneState = useCallback((b: TypstBlock[], s: DocumentSettings) => {
    try {
      const cloned = typeof structuredClone === 'function' ? structuredClone({ blocks: b, settings: s }) : null;
      if (cloned) return cloned as { blocks: TypstBlock[]; settings: DocumentSettings };
    } catch {
      // ignore
    }
    return {
      blocks: b.map((x) => ({ ...x })),
      settings: { ...s },
    };
  }, []);

  const pushHistory = useCallback((nextBlocks: TypstBlock[], nextSettings: DocumentSettings) => {
    setHistory((prev) => {
      const base = prev.slice(0, historyIndex + 1);
      const snapshot = cloneState(nextBlocks, nextSettings);
      const next = [...base, snapshot];
      return next.slice(-50);
    });
    setHistoryIndex((idx) => Math.min(idx + 1, 49));
  }, [cloneState, historyIndex]);

  // blocks -> code and track undo/redo history
  useEffect(() => {
    if (syncSource === 'blocks') {
      setCode(blocksToTypst(blocks, { settings: docSettings }));
      if (!isRestoringRef.current) {
        pushHistory(blocks, docSettings);
      }
    }
  }, [blocks, docSettings, pushHistory, syncSource]);

  const handleModeSwitch = (newMode: EditorMode) => {
    if (newMode === mode) return;

    if (newMode === 'visual') {
      setBlocks(typstToBlocks(code));
      setSyncSource('code');
    } else {
      setCode(blocksToTypst(blocks));
      setSyncSource('blocks');
    }

    setMode(newMode);
  };

  const handleSave = useCallback(async () => {
    try {
      setSaveStatus('saving');
      const saveCode = injectDocumentSettings(code, docSettings);
      await updateProject(projectId, { title, typst_code: saveCode });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus(null);
      setError(err instanceof Error ? err.message : '保存失败');
    }
  }, [code, docSettings, projectId, title]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const nextIndex = historyIndex - 1;
    const snap = history[nextIndex];
    if (!snap) return;
    isRestoringRef.current = true;
    setBlocks(snap.blocks);
    setDocSettings(snap.settings);
    setSyncSource('blocks');
    setHistoryIndex(nextIndex);
    queueMicrotask(() => {
      isRestoringRef.current = false;
    });
  }, [canUndo, history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const nextIndex = historyIndex + 1;
    const snap = history[nextIndex];
    if (!snap) return;
    isRestoringRef.current = true;
    setBlocks(snap.blocks);
    setDocSettings(snap.settings);
    setSyncSource('blocks');
    setHistoryIndex(nextIndex);
    queueMicrotask(() => {
      isRestoringRef.current = false;
    });
  }, [canRedo, history, historyIndex]);

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ctrl+S / Cmd+S -> save, Ctrl+Z -> undo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void handleSave();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, handleRedo, handleUndo]);

  // render debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      renderTypst(buildRenderCodeForPreview());
    }, 100);
    return () => clearTimeout(timer);
  }, [buildRenderCodeForPreview, renderTypst]);

  return (
    <div className="flex h-screen w-full bg-zinc-50 dark:bg-zinc-900">
      <div className="flex flex-col w-1/2 border-r border-zinc-300 dark:border-zinc-700">
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                  return;
                }
                router.push('/workspace');
              }}
              className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
              title="返回主页"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex bg-white dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-600 overflow-hidden shrink-0">
              <button
                onClick={() => handleModeSwitch('visual')}
                className={`px-3 py-1 text-sm transition-colors ${
                  mode === 'visual'
                    ? 'bg-blue-500 text-white'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                可视化
              </button>
              <button
                onClick={() => handleModeSwitch('source')}
                className={`px-3 py-1 text-sm transition-colors ${
                  mode === 'source'
                    ? 'bg-blue-500 text-white'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                源代码
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
              title="重做 (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>
            <button
              onClick={handleSave}
              className="p-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
              title="保存 (Ctrl+S)"
            >
              <Save size={16} />
            </button>
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="设置"
              >
                <Settings size={16} />
              </button>
              {showSettings && (
                <div className="absolute right-0 mt-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded shadow-lg z-10 min-w-max">
                  <div className="px-4 py-3 space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
                    <div className="mb-2">
                      <label className="block text-xs font-semibold mb-2">项目标题</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="项目标题"
                        className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs"
                      />
                    </div>
                    <div className="border-t border-zinc-300 dark:border-zinc-600 pt-3">
                      <label className="flex items-center gap-2 select-none cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={docSettings.tableCaptionNumbering}
                          onChange={(e) => setDocSettings((s) => ({ ...s, tableCaptionNumbering: e.target.checked }))}
                        />
                        表格排序
                      </label>
                      <label className="flex items-center gap-2 select-none cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={docSettings.imageCaptionNumbering}
                          onChange={(e) => setDocSettings((s) => ({ ...s, imageCaptionNumbering: e.target.checked }))}
                        />
                        图片排序
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="select-none cursor-pointer">图片标题位置</label>
                        <select
                          value={docSettings.imageCaptionPosition}
                          onChange={(e) =>
                            setDocSettings((s) => ({
                              ...s,
                              imageCaptionPosition: e.target.value === 'above' ? 'above' : 'below',
                            }))
                          }
                          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900"
                        >
                          <option value="above">上方</option>
                          <option value="below">下方</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {mode === 'source' ? (
          <textarea
            value={code}
            onChange={(e) => {
              setSyncSource('code');
              setCode(e.target.value);
            }}
            className="flex-1 w-full p-4 font-mono text-sm text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-950 resize-none focus:outline-none"
            placeholder="Type your Typst code here..."
            spellCheck={false}
          />
        ) : (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-950" ref={editorScrollRef}>
            {(() => {
              const blanks = findAnswerBlankIndexes();
              if (blanks.length === 0) return null;
              return (
                <div className="sticky top-0 z-10 px-4 py-2 bg-amber-50/95 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3">
                  <div className="text-xs text-amber-800 dark:text-amber-200">
                    发现 {blanks.length} 处“待填写答案”。虚线框段落为答案区。
                  </div>
                  <button
                    type="button"
                    onClick={jumpToNextBlank}
                    className="text-xs px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white/80 dark:bg-zinc-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  >
                    跳到下一处
                  </button>
                </div>
              );
            })()}
            <BlockEditor
              blocks={blocks}
              onChange={(b) => {
                setSyncSource('blocks');
                setBlocks(b);
              }}
              projectId={projectId}
              onBlockClick={handleBlockClick}
            />
          </div>
        )}
      </div>

      {aiDebug ? (
        <div className="absolute left-3 bottom-3 z-20 max-w-[48%]">
          <div className="bg-white/95 dark:bg-zinc-950/95 border border-zinc-300 dark:border-zinc-700 rounded shadow-sm">
            <button
              onClick={() => setShowAiDebug((v) => !v)}
              className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="显示/隐藏 AI 原始输出（调试）"
            >
              {showAiDebug ? '隐藏 AI 调试信息' : '显示 AI 调试信息'}
            </button>
            {showAiDebug && (
              <pre className="max-h-[40vh] overflow-auto px-3 pb-3 text-[11px] text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                {aiDebug}
              </pre>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col w-1/2">
        <div className="px-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Preview</h2>
          <button
            onClick={downloadPdf}
            className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="下载 PDF"
          >
            <Download size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-zinc-200 dark:bg-zinc-900 p-4 relative" ref={previewRef}>
          {error ? (
            <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-700 rounded">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">Error:</p>
              <pre className="mt-2 text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap">{error}</pre>
            </div>
          ) : svgPages.length > 0 ? (
            <div className="flex flex-col items-center gap-6">
              {svgPages.map((svgContent, index) => (
                <SvgPage
                  key={index}
                  svgContent={svgContent}
                  pageIndex={index}
                  forceVisible={activeAnchor?.pageIndex === index}
                  activeLocalIndex={clickAnchor?.pageIndex === index ? clickAnchor.localIndex : null}
                  highlightNonce={highlightNonce}
                  registerPageRef={registerPageRef}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500 dark:text-zinc-400">
              {isRendering ? 'Rendering...' : 'Preview will appear here'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
