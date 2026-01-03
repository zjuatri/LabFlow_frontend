'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import BlockEditor from '@/components/BlockEditor';
import {
  TypstBlock,
  blocksToTypst,
  type DocumentSettings,
  generateCjkStylePreamble,
} from '@/lib/typst';
import { convertTypstContentToLatex } from '@/lib/math-convert';
import { clearToken, getToken } from '@/lib/auth';
import { useBidirectionalScrollSync } from '@/lib/bidirectional-scroll-sync';
import { useEditorStore } from '@/lib/stores/useEditorStore';
import { useShallow } from 'zustand/react/shallow';

// Import extracted components
import { CoverModal } from './components/CoverModal';
import { EditorToolbar, type EditorMode } from './components/EditorToolbar';
import { PreviewPanel } from './components/PreviewPanel';
import { AiAssistantPlugin } from '@/components/plugins/AiAssistantPlugin';

// In production/Docker we typically proxy /api/* through the same origin.
// For local dev, set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000.
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

export default function ProjectEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const {
    // state
    mode,
    title,
    code,
    blocks,
    docSettings,
    svgPages,
    error,
    isRendering,
    saveStatus,
    showSettings,
    showCoverModal,
    covers,
    loadingCovers,
    projectType,

    // actions
    loadProject,
    reset,
    switchMode,
    setTitle,
    setCode,
    setBlocks,
    setDocSettings,
    setShowSettings,
    setShowCoverModal,
    openCoverModal,
    insertCover,
    saveProject,
    undo,
    redo,
    canUndo,
    canRedo,
    setError,
    setSvgPages,
    setIsRendering,
    showAiSidebar,
    setShowAiSidebar,
  } = useEditorStore(
    useShallow((s) => ({
      mode: s.mode,
      title: s.title,
      code: s.code,
      blocks: s.blocks,
      docSettings: s.docSettings,
      svgPages: s.svgPages,
      error: s.error,
      isRendering: s.isRendering,
      saveStatus: s.saveStatus,
      showSettings: s.showSettings,
      showCoverModal: s.showCoverModal,
      covers: s.covers,
      loadingCovers: s.loadingCovers,
      projectType: s.projectType,

      loadProject: s.loadProject,
      reset: s.reset,
      switchMode: s.switchMode,
      setTitle: s.setTitle,
      setCode: s.setCode,
      setBlocks: s.setBlocks,
      setDocSettings: s.setDocSettings,
      setShowSettings: s.setShowSettings,
      setShowCoverModal: s.setShowCoverModal,
      openCoverModal: s.openCoverModal,
      insertCover: s.insertCover,
      saveProject: s.saveProject,
      undo: s.undo,
      redo: s.redo,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      setError: s.setError,
      setSvgPages: s.setSvgPages,
      setIsRendering: s.setIsRendering,
      showAiSidebar: s.showAiSidebar,
      setShowAiSidebar: s.setShowAiSidebar,
    }))
  );

  const [editorWidthPercent, setEditorWidthPercent] = useState(50);
  const [aiSidebarWidth, setAiSidebarWidth] = useState(400);

  const [isResizingEditor, setIsResizingEditor] = useState(false);
  const [isResizingAi, setIsResizingAi] = useState(false);

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingEditor) {
        // Calculate percentage based on window width
        const mainAreaWidth = window.innerWidth - (showAiSidebar ? aiSidebarWidth : 0);
        const newPercent = (e.clientX / mainAreaWidth) * 100;
        setEditorWidthPercent(Math.max(20, Math.min(80, newPercent)));
      }

      if (isResizingAi) {
        const newWidth = window.innerWidth - e.clientX;
        setAiSidebarWidth(Math.max(250, Math.min(800, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingEditor(false);
      setIsResizingAi(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizingEditor || isResizingAi) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isResizingEditor ? 'col-resize' : 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizingEditor, isResizingAi, showAiSidebar, aiSidebarWidth]);

  const [activeAnchor, setActiveAnchor] = useState<{ pageIndex: number; localIndex: number } | null>(null);
  const [highlightNonce, setHighlightNonce] = useState(0);
  const [clickAnchor, setClickAnchor] = useState<{ pageIndex: number; localIndex: number } | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const blankCursorRef = useRef(0);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const registerPageRef = useCallback((pageIndex: number, el: HTMLDivElement | null) => {
    pageRefs.current[pageIndex] = el;
  }, []);

  const { suppressEditorSync } = useBidirectionalScrollSync({
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

      // Cover container blocks may contain images and a forced #pagebreak().
      // Wrapping them in a container (#block[..]) would make #pagebreak() illegal.
      const isCoverContainer = trimmed.startsWith('/*LF_COVER_BEGIN:');
      const isImage =
        trimmed.startsWith('#image(') ||
        /^#align\(\s*(?:left|center|right)\s*,\s*image\(/.test(trimmed) ||
        trimmed.startsWith('#align(center)[(未生成图表)]') ||
        trimmed.includes('LF_CHART:') ||
        trimmed.includes('LF_IMAGE:');
      const isFigure = trimmed.startsWith('#figure(');

      const markerCode = '#place(dx: -50cm, rect(width: 1pt, height: 1pt, fill: rgb("000001")))';

      if (!isCoverContainer && (isImage || isFigure)) {
        // Wrap in a block that keeps marker and content together.
        // We use width: 100% to ensure the block spans the page, allowing internal #align to work.
        // Without explicit width, #block might shrink-wrap or behave differently.
        return `#block(width: 100%)[${markerCode}${content}]`;
      }

      // For other content (paragraphs, headings, etc.), the simple approach works
      return `${markerCode}\n${content}`;
    };

    const markerLine = '#place(dx: -50cm, rect(width: 1pt, height: 1pt, fill: rgb("000001")))';
    // Add CJK font styling preamble for bold/italic simulation
    const preamble = generateCjkStylePreamble();
    // Add a trailing sentinel marker to properly bound the last block for highlight.
    return (
      preamble +
      blocks
        .map((b) => wrapWithMarker(blocksToTypst([b], { settings: docSettings, target: 'preview' })))
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
    let cancelled = false;
    reset();
    (async () => {
      try {
        await loadProject(projectId);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '加载项目失败';
        if (msg.toLowerCase().includes('not authenticated') || msg.toLowerCase().includes('invalid token')) {
          clearToken();
          router.push('/login');
          return;
        }
        setError(msg);
      }
    })();

    return () => {
      cancelled = true;
      reset();
    };
  }, [loadProject, projectId, reset, router, setError]);

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
    // For export, we generate clean code without markers and without draft blocks (like vertical space guides)
    const typstCode = generateCjkStylePreamble() + blocksToTypst(blocks, { settings: docSettings, target: 'export' });
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
  }, [BASE_URL, blocks, docSettings, title]);

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
        void saveProject();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, saveProject, undo]);

  // render debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      renderTypst(buildRenderCodeForPreview());
    }, 100);
    return () => clearTimeout(timer);
  }, [buildRenderCodeForPreview, renderTypst]);

  const handlePreviewClick = useCallback((pageIndex: number, localIndex: number) => {
    if (!editorScrollRef.current) return;

    // Suppress editor-to-preview sync to prevent the preview from scrolling back
    suppressEditorSync(2000);

    let globalIndex = 0;
    for (let i = 0; i < pageIndex; i++) {
      const content = svgPages[i] || '';
      const matches = content.match(/fill="#000001"/g);
      globalIndex += matches ? matches.length : 0;
    }
    globalIndex += localIndex;

    // Get the block content for copying
    const block = blocks[globalIndex];
    if (block) {
      let textToCopy = '';
      if (block.type === 'image') {
        // For images, copy the image path or caption
        textToCopy = block.content || block.caption || '(图片)';
      } else if (block.type === 'table') {
        // For tables, try to extract text representation
        try {
          const payload = JSON.parse(block.content || '{}');
          if (payload.cells) {
            textToCopy = payload.cells
              .map((row: any[]) => row.map((cell: any) => cell.content || '').join('\t'))
              .join('\n');
          }
        } catch {
          textToCopy = block.content || '';
        }
      } else {
        // Automatically convert inline Typst math to LaTeX for clipboard
        textToCopy = convertTypstContentToLatex(block.content || '');
      }

      if (textToCopy) {
        (async () => {
          try {
            if (block.type === 'image' && block.content) {
              // Try to fetch image and write to clipboard as blob
              try {
                // If it's a relative path, prepend BASE_URL or rely on browser to handle relative to current origin,
                // but usually images are served from /static/ or similar.
                // WE assume block.content is the path.
                const imgPath = block.content;
                // Since this is a restricted app, we might need auth headers if images are protected?
                // Usually static files are public or cookie-auth handled.
                // Note: Clipboard Item API requires secure context (HTTPS or localhost).

                // Fetch the image
                const response = await fetch(imgPath);
                let blob = await response.blob();

                // Convert to PNG if not already, as ClipboardItem has strict type support
                // and some apps prefer PNG.
                if (blob.type !== 'image/png') {
                  try {
                    const pngBlob = await new Promise<Blob | null>((resolve) => {
                      const img = new Image();
                      img.crossOrigin = 'anonymous'; // might be needed if CORS allows
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) { resolve(null); return; }
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob((b) => resolve(b), 'image/png');
                      };
                      img.onerror = () => resolve(null);
                      img.src = URL.createObjectURL(blob);
                    });
                    if (pngBlob) blob = pngBlob;
                  } catch (e) {
                    console.warn('Image conversion failed', e);
                  }
                }

                // Write to clipboard
                await navigator.clipboard.write([
                  new ClipboardItem({
                    [blob.type === 'image/png' ? 'image/png' : blob.type]: blob
                  })
                ]);

                // Success toast
                showToast('图片已复制到剪贴板');
                return;
              } catch (err) {
                console.warn('Failed to copy image blob, fallback to path', err);
                // Fallback to text copy below
              }
            }

            await navigator.clipboard.writeText(textToCopy);
            showToast('已复制到剪贴板');
          } catch (err) {
            console.error('Clipboard failed', err);
          }
        })();
      }
    }

    function showToast(msg: string) {
      const toast = document.createElement('div');
      toast.textContent = msg;
      Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '8px 16px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        borderRadius: '4px',
        fontSize: '14px',
        zIndex: '9999',
        opacity: '0',
        transition: 'opacity 0.3s'
      });
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.style.opacity = '1');
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 1500);
    }


    const el = editorScrollRef.current.querySelector(`[data-block-index="${globalIndex}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Temporary highlight using outline and boxShadow for more visibility
      const htmlEl = el as HTMLElement;
      const originalOutline = htmlEl.style.outline;
      const originalBoxShadow = htmlEl.style.boxShadow;
      const originalTransition = htmlEl.style.transition;

      htmlEl.style.transition = 'outline 0.2s ease, box-shadow 0.2s ease';
      htmlEl.style.outline = '2px solid rgba(59, 130, 246, 0.6)';
      htmlEl.style.boxShadow = '0 0 8px rgba(59, 130, 246, 0.4)';

      setTimeout(() => {
        htmlEl.style.outline = originalOutline;
        htmlEl.style.boxShadow = originalBoxShadow;
        setTimeout(() => {
          htmlEl.style.transition = originalTransition;
        }, 200);
      }, 1000);
    }
  }, [svgPages, blocks, suppressEditorSync]);

  return (
    <div className="flex h-screen w-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden">

      {/* Main Area: Editor + Preview */}
      <div className="flex h-full transition-[width] duration-0" style={{ width: showAiSidebar ? `calc(100% - ${aiSidebarWidth}px)` : '100%' }}>

        {/* Editor Pane */}
        <div
          className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50"
          style={{ width: `${editorWidthPercent}%` }}
        >

          {(() => {
            const coverIndex = blocks.findIndex((b) => b.type === 'cover');
            const hasCover = coverIndex >= 0;
            const coverFixedOnePage = hasCover ? !!blocks[coverIndex]?.coverFixedOnePage : false;

            return (
              <EditorToolbar
                mode={mode}
                onModeSwitch={switchMode}
                title={title}
                onTitleChange={setTitle}
                docSettings={docSettings}
                onSettingsChange={setDocSettings}
                canUndo={canUndo()}
                canRedo={canRedo()}
                onUndo={undo}
                onRedo={redo}
                onSave={() => void saveProject()}
                onOpenCoverModal={() => void openCoverModal()}
                projectType={projectType}
                showSettings={showSettings}
                onToggleSettings={() => setShowSettings(!showSettings)}
                onCloseSettings={() => setShowSettings(false)}
                hasCover={hasCover}
                coverFixedOnePage={coverFixedOnePage}
                onCoverFixedOnePageChange={(fixed) => {
                  if (coverIndex < 0) return;
                  const next = [...blocks];
                  next[coverIndex] = { ...next[coverIndex], coverFixedOnePage: fixed };
                  setBlocks(next);
                }}
              />
            );
          })()}

          {mode === 'source' ? (
            <textarea
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
              className="flex-1 w-full p-6 font-mono text-sm text-zinc-900 dark:text-zinc-100 bg-transparent resize-none focus:outline-none leading-relaxed"
              placeholder="Type your Typst code here..."
              spellCheck={false}
            />
          ) : (
            <div className="flex-1 overflow-y-auto bg-amber-50/10 dark:bg-zinc-950/50" ref={editorScrollRef}>
              {(() => {
                const blanks = findAnswerBlankIndexes();
                if (blanks.length === 0) return null;
                return (
                  <div className="sticky top-0 z-10 px-4 py-2 bg-amber-50/95 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3 backdrop-blur-sm">
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      发现 {blanks.length} 处“待填写答案”。虚线框段落为答案区。
                    </div>
                    <button
                      type="button"
                      onClick={jumpToNextBlank}
                      className="text-xs px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white/80 dark:bg-zinc-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                    >
                      跳到下一处
                    </button>
                  </div>
                );
              })()}
              <BlockEditor
                blocks={blocks}
                onChange={setBlocks}
                projectId={projectId}
                onBlockClick={handleBlockClick}
              />
            </div>
          )}
        </div>

        {/* Editor-Preview Resizer */}
        <div
          className="w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex flex-col justify-center items-center group -ml-0.5 relative"
          onMouseDown={(e) => { e.preventDefault(); setIsResizingEditor(true); }}
        >
          <div className="w-0.5 h-8 bg-zinc-300 dark:bg-zinc-600 rounded-full group-hover:bg-white group-active:bg-white transition-colors" />
        </div>

        {/* Preview Pane */}
        <div className="flex flex-col bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm" style={{ width: `${100 - editorWidthPercent}%` }}>
          <PreviewPanel
            error={error}
            svgPages={svgPages}
            isRendering={isRendering}
            activeAnchor={activeAnchor}
            clickAnchor={clickAnchor}
            highlightNonce={highlightNonce}
            registerPageRef={registerPageRef}
            onBlockClick={handlePreviewClick}
            onDownloadPdf={() => void downloadPdf()}
            previewRef={previewRef}
            projectId={projectId}
            onToggleAiSidebar={() => setShowAiSidebar(!showAiSidebar)}
            isAiSidebarOpen={showAiSidebar}
          />
        </div>
      </div>

      {/* AI Sidebar Resizer */}
      {showAiSidebar && (
        <div
          className="w-1 cursor-ew-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-30 flex flex-col justify-center items-center group -ml-0.5 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
          onMouseDown={(e) => { e.preventDefault(); setIsResizingAi(true); }}
        >
          <div className="w-0.5 h-8 bg-zinc-300 dark:bg-zinc-600 rounded-full group-hover:bg-blue-200 group-active:bg-blue-200 transition-colors" />
        </div>
      )}

      {showAiSidebar && (
        <div
          className="h-full bg-white dark:bg-zinc-950 shrink-0 z-30 shadow-2xl flex flex-col"
          style={{ width: `${aiSidebarWidth}px` }}
        >
          <AiAssistantPlugin
            projectId={projectId}
            existingBlocks={blocks}
            onInsertBlocks={(newBlocks) => {
              // Append new blocks to existing blocks
              const nextBlocks = [...blocks, ...newBlocks];
              setBlocks(nextBlocks);
              // Trigger auto-save immediately
              setTimeout(() => {
                saveProject();
              }, 0);
            }}
            onClose={() => setShowAiSidebar(false)}
          />
        </div>
      )}

      {/* Cover Selection Modal */}
      <CoverModal
        show={showCoverModal}
        onClose={() => setShowCoverModal(false)}
        onInsert={insertCover}
        loading={loadingCovers}
        covers={covers}
      />
    </div>
  );
}
