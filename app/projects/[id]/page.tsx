'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  blocksToTypst,
  generateCjkStylePreamble,
} from '@/lib/typst';
import { clearToken, getToken } from '@/lib/auth';
import { useBidirectionalScrollSync } from '@/lib/bidirectional-scroll-sync';
import { useEditorStore } from '@/stores/useEditorStore';
import { useShallow } from 'zustand/react/shallow';

// Import extracted components
import { CoverModal } from './_components/CoverModal';
import { EditorToolbar } from './_components/EditorToolbar';
import { PreviewPanel } from './_components/PreviewPanel';
import { AiAssistantPlugin } from '@/components/editor/plugins/AiAssistantPlugin';
import { ProjectSettingsModal } from './_components/ProjectSettingsModal';
import { VisualEditorPane } from './_components/VisualEditorPane';
import { SourceEditorPane } from './_components/SourceEditorPane';

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

  const previewRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
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

  const buildRenderCodeForPreview = useCallback(() => {
    // Keep saved `code` clean. Only inject markers into the code sent to renderer.
    if (mode !== 'visual') return code;
    // Use a box with baseline to keep marker and content together during page breaks.
    // The marker is placed at the start of the block content using place() inside the box.
    const wrapWithMarker = (content: string) => {
      // We use a stack/block approach: first output the marker, then the content.
      // To ensure they stay together on page breaks, we wrap content in a block where possible.
      const trimmed = content.trim();

      // Cover container blocks may contain images and a forced #pagebreak().
      // Wrapping them in a container (#block[..]) would make #pagebreak() illegal.
      const isCoverContainer = trimmed.startsWith('/*LF_COVER_BEGIN:');

      const markerCode = '#place(dx: -50cm, rect(width: 1pt, height: 1pt, fill: rgb("000001")))';

      if (isCoverContainer) {
        // Cover containers cannot be wrapped, use simple approach
        return `${markerCode}\n${content}`;
      }

      // Headings in Typst use "= " / "== " / "=== " syntax at line start.
      // Wrapping them in #block[...] breaks the syntax because "=" must be at line start.
      // Convert to #heading(level: N)[...] function syntax which can be wrapped.
      const headingMatch = trimmed.match(/^(=+)\s+([\s\S]*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingContent = headingMatch[2];
        // Use #heading function syntax instead of = syntax
        const headingFunc = `#heading(level: ${level})[${headingContent}]`;
        return `#block(width: 100%, breakable: true)[${markerCode}${headingFunc}]`;
      }

      // Wrap ALL other content (paragraphs, math, images, figures, etc.) in a block
      // to keep marker and content together during page breaks.
      // Use width: 100% to ensure proper layout, and breakable: true to allow 
      // long content to break across pages while keeping marker with the start.
      return `#block(width: 100%, breakable: true)[${markerCode}${content}]`;
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
            <SourceEditorPane />
          ) : (
            <VisualEditorPane
              projectId={projectId}
              onBlockClick={handleBlockClick}
              editorScrollRef={editorScrollRef}
            />
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
            title={title}
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

      {/* Project Settings Modal */}
      <ProjectSettingsModal
        show={showSettings}
        onClose={() => setShowSettings(false)}
        title={title}
        onTitleChange={setTitle}
        docSettings={docSettings}
        onSettingsChange={setDocSettings}
        projectType={projectType}
        hasCover={blocks.some(b => b.type === 'cover')}
        coverFixedOnePage={blocks.find(b => b.type === 'cover')?.coverFixedOnePage}
        onCoverFixedOnePageChange={(fixed) => {
          const coverIndex = blocks.findIndex((b) => b.type === 'cover');
          if (coverIndex < 0) return;
          const next = [...blocks];
          next[coverIndex] = { ...next[coverIndex], coverFixedOnePage: fixed };
          setBlocks(next);
        }}
      />
    </div>
  );
}
