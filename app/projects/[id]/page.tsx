'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save, Undo2, Redo2 } from 'lucide-react';

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

// In production/Docker we typically proxy /api/* through the same origin.
// For local dev, set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000.
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

type EditorMode = 'source' | 'visual';

// Lazy-loaded SVG page component with intersection observer
function SvgPage({
  svgContent,
  pageIndex,
  forceVisible,
  activeLocalIndex,
  registerPageRef,
}: {
  svgContent: string;
  pageIndex: number;
  forceVisible: boolean;
  activeLocalIndex: number | null;
  registerPageRef: (pageIndex: number, el: HTMLDivElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [observedVisible, setObservedVisible] = useState(false);
  const isVisible = forceVisible || observedVisible;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setObservedVisible(true);
          }
        });
      },
      { rootMargin: '200px' } // Load 200px before entering viewport
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Handle scrolling to active block marker
  useEffect(() => {
    if (!isVisible || activeLocalIndex === null || !containerRef.current) return;

    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) return;

    // Markers are off-screen 1pt rects with fill="#000001"
    const markers = svgElement.querySelectorAll<SVGGraphicsElement>('path[fill="#000001"]');
    const marker = markers.item(activeLocalIndex);
    if (!marker) return;

    const isMarker = (el: Element | null) => !!el && el.matches?.('path[fill="#000001"]');
    const isSkippable = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'defs' || tag === 'clipPath' || tag === 'mask' || tag === 'metadata' || tag === 'style') return true;
      if (isMarker(el)) return true;
      return false;
    };

    const getScreenRect = (g: SVGGraphicsElement) => {
      // Prefer getBBox+CTM when available, but SVG <image> can report a tiny bbox
      // on the first tick (especially at page boundaries). Fall back to DOM rect.
      const rectFromClient = () => {
        try {
          const r = g.getBoundingClientRect();
          if (!(r.width > 0.5 && r.height > 0.5)) return null;
          if (!Number.isFinite(r.left) || !Number.isFinite(r.top) || !Number.isFinite(r.right) || !Number.isFinite(r.bottom)) return null;
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        } catch {
          return null;
        }
      };

      const ctm = g.getScreenCTM();
      if (!ctm) return rectFromClient();

      try {
        const bb = g.getBBox();
        if (!(bb.width > 0.5 && bb.height > 0.5)) return rectFromClient();
        const p1 = new DOMPoint(bb.x, bb.y).matrixTransform(ctm);
        const p2 = new DOMPoint(bb.x + bb.width, bb.y + bb.height).matrixTransform(ctm);
        const left = Math.min(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const right = Math.max(p1.x, p2.x);
        const bottom = Math.max(p1.y, p2.y);
        if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) return rectFromClient();
        const w = Math.max(0, right - left);
        const h = Math.max(0, bottom - top);
        if (w < 1 || h < 1) return rectFromClient();
        return { left, top, right, bottom };
      } catch {
        return rectFromClient();
      }
    };

    const nextMarker = markers.item(activeLocalIndex + 1);

    // Compute a union bbox for everything rendered by this block.
    // Strategy: For blocks wrapped in #block[marker content], find the marker's parent container
    // and only compute union within that container. This prevents including elements from other blocks.
    
    // Find marker's block container - walk up until we find a <g> that's a direct child of a larger group
    // or until we find a container that has both the marker and content
    const findMarkerContainer = (): Element | null => {
      let container = marker.parentElement;
      // Walk up to find a reasonable container (typically a <g> from #block)
      // The container should be large enough to contain the block content
      while (container && container !== svgElement) {
        // If this container has more children besides just structural groups, it's likely our block container
        const childCount = container.children.length;
        if (childCount > 1) {
          return container;
        }
        container = container.parentElement;
      }
      return null;
    };

    const markerContainer = findMarkerContainer();

    // Build a flat list of all elements in document order
    const allElements: Element[] = [];
    const collectAll = (el: Element) => {
      allElements.push(el);
      for (let i = 0; i < el.children.length; i++) {
        collectAll(el.children[i]);
      }
    };
    
    // If we found a container, only collect elements within it; otherwise use whole SVG
    if (markerContainer) {
      collectAll(markerContainer);
    } else {
      collectAll(svgElement);
    }

    // Find indices of markers in this flat list
    const markerIdx = allElements.indexOf(marker);
    
    // For nextMarkerIdx: if we're using a container, the boundary is the container end
    // If nextMarker exists and is within our element list, use it; otherwise use list length
    let nextMarkerIdx = allElements.length;
    if (nextMarker) {
      const idx = allElements.indexOf(nextMarker);
      if (idx > markerIdx) {
        nextMarkerIdx = idx;
      }
    }

    if (markerIdx < 0) return;

    const isSvgGraphicsElement = (el: Element): el is SVGGraphicsElement => {
      const g = el as unknown as SVGGraphicsElement;
      return typeof g.getBBox === 'function' && typeof g.getScreenCTM === 'function';
    };

    // Find all ancestors of nextMarker - we need to exclude them from union calculation
    // because they might contain the next block's content too
    const nextMarkerAncestors = new Set<Element>();
    if (nextMarker && allElements.includes(nextMarker)) {
      let p = nextMarker.parentElement;
      while (p && p !== svgElement && p !== markerContainer) {
        nextMarkerAncestors.add(p);
        p = p.parentElement;
      }
    }

    const computeUnion = () => {
      let union: { left: number; top: number; right: number; bottom: number } | null = null;
      for (let i = markerIdx + 1; i < nextMarkerIdx && i < allElements.length; i++) {
        const el = allElements[i];
        if (isSkippable(el)) continue;
        // Skip ancestors of nextMarker - they contain the next block's content
        if (nextMarkerAncestors.has(el)) continue;
        if (!isSvgGraphicsElement(el)) continue;
        const rect = getScreenRect(el);
        if (!rect) continue;

        union = union
          ? {
              left: Math.min(union.left, rect.left),
              top: Math.min(union.top, rect.top),
              right: Math.max(union.right, rect.right),
              bottom: Math.max(union.bottom, rect.bottom),
            }
          : rect;
      }
      return union;
    };

    const hasSvgImagesInRange = () => {
      for (let i = markerIdx + 1; i < nextMarkerIdx && i < allElements.length; i++) {
        const el = allElements[i];
        if (el.tagName?.toLowerCase() === 'image') return true;
      }
      return false;
    };

    const showHighlight = (union: { left: number; top: number; right: number; bottom: number }) => {
      const left = union.left;
      const top = union.top;
      const width = Math.max(0, union.right - union.left);
      const height = Math.max(0, union.bottom - union.top);

      const containerRect = containerRef.current!.getBoundingClientRect();
      const overlayLeft = left - containerRect.left;
      const overlayTop = top - containerRect.top;

      // 如果计算出的位置看起来异常（负数或超出容器很多），说明内容可能跨页或被推到其他位置
      // 检查 union 的实际位置是否在当前容器的可见范围内
      const visibleTop = containerRect.top;
      const visibleBottom = containerRect.bottom;
      const visibleLeft = containerRect.left;
      const visibleRight = containerRect.right;

      // 如果 union 的中心点不在当前容器的可见区域内，跳过高亮（避免显示在错误的位置）
      const centerX = (union.left + union.right) / 2;
      const centerY = (union.top + union.bottom) / 2;
      
      const isOutOfBounds = centerX < visibleLeft - 100 || centerX > visibleRight + 100 ||
                           centerY < visibleTop - 100 || centerY > visibleBottom + 100;
      
      if (isOutOfBounds) {
        // 内容不在当前容器范围内，可能在另一页，不显示高亮
        return;
      }

      const highlight = document.createElement('div');
      highlight.style.position = 'absolute';
      highlight.style.left = `${Math.max(0, overlayLeft)}px`;
      highlight.style.top = `${Math.max(0, overlayTop)}px`;
      highlight.style.width = `${Math.max(0, width)}px`;
      highlight.style.height = `${Math.max(0, height)}px`;
      highlight.style.backgroundColor = 'rgba(59, 130, 246, 0.18)';
      highlight.style.border = '2px solid rgba(59, 130, 246, 0.55)';
      highlight.style.borderRadius = '4px';
      highlight.style.pointerEvents = 'none';
      highlight.style.zIndex = '20';
      highlight.style.animation = 'pulse 1s ease-in-out 2';

      containerRef.current!.appendChild(highlight);
      setTimeout(() => {
        highlight.style.transition = 'opacity 0.35s';
        highlight.style.opacity = '0';
        setTimeout(() => highlight.remove(), 350);
      }, 1200);
    };

    const containsImages = hasSvgImagesInRange();

    // When the block renders an embedded SVG <image> (e.g. chart preview), the first layout tick
    // can report a tiny/zero bbox. Retry a few times to get a stable union.
    let cancelled = false;
    const attempt = (triesLeft: number) => {
      if (cancelled) return;
      const union = computeUnion();
      if (union) {
        const w = Math.max(0, union.right - union.left);
        const h = Math.max(0, union.bottom - union.top);
        const looksTooSmall = w < 8 || h < 8;
        
        // For images, retry if the bbox is too small and we have retries left
        if (containsImages && looksTooSmall && triesLeft > 0) {
          requestAnimationFrame(() => attempt(triesLeft - 1));
          return;
        }
        
        // Even if it looks small, try to show it (the isOutOfBounds check will filter bad cases)
        // Don't skip highlighting just because of size - the new #block wrapper should keep
        // marker and content together, so small size likely means genuinely small content.
        showHighlight(union);
        return;
      }
      if (containsImages && triesLeft > 0) {
        requestAnimationFrame(() => attempt(triesLeft - 1));
      }
    };

    attempt(24);

    return () => {
      cancelled = true;
    };
  }, [isVisible, activeLocalIndex]);

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        registerPageRef(pageIndex, el);
      }}
      className="bg-white shadow-lg relative"
      style={{ minHeight: isVisible ? 'auto' : '800px' }}
    >
      {isVisible ? (
        <div
          dangerouslySetInnerHTML={{ __html: svgContent }}
          style={{ userSelect: 'text', cursor: 'text' }}
          className="[&_svg]:select-text [&_text]:select-text [&_svg]:max-w-full [&_svg]:h-auto"
        />
      ) : (
        <div className="flex items-center justify-center h-full text-zinc-400">
          Loading page {pageIndex + 1}...
        </div>
      )}
    </div>
  );
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

  const [svgPages, setSvgPages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<{ pageIndex: number; localIndex: number } | null>(null);
  
  const [history, setHistory] = useState<Array<{ blocks: TypstBlock[]; settings: DocumentSettings }>>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>(null);

  const isRestoringRef = useRef(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const registerPageRef = useCallback((pageIndex: number, el: HTMLDivElement | null) => {
    pageRefs.current[pageIndex] = el;
  }, []);

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
      const isImage = trimmed.startsWith('#image(') || trimmed.startsWith('#align(center, image(') || trimmed.startsWith('#align(center)[(未生成图表)]') || trimmed.includes('LF_CHART:') || trimmed.includes('LF_IMAGE:');
      const isFigure = trimmed.startsWith('#figure(');
      
      const markerCode = '#place(dx: -50cm, rect(width: 1pt, height: 1pt, fill: rgb("000001")))';
      
      if (isImage || isFigure) {
        // Wrap in a block that keeps marker and content together
        // Using #block with breakable: false would prevent breaks, but we want to allow breaks
        // between blocks. Instead, we place the marker AFTER the content starts rendering,
        // by putting it inside a box at the very beginning.
        return `#block[${markerCode}${content}]`;
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
        const raw = (p.typst_code ?? '').trim() ? (p.typst_code ?? '') : DEFAULT_TYPST_CODE;
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

    setActiveAnchor({ pageIndex, localIndex });

    // Scroll the page container into view (works even if SVG hasn't been injected yet)
    const pageEl = pageRefs.current[pageIndex];
    pageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    setTimeout(() => setActiveAnchor(null), 1500);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // changing docSettings should be undoable too, but only in visual sync
    if (syncSource !== 'blocks') return;
    if (isRestoringRef.current) return;
    pushHistory(blocks, docSettings);
  }, [docSettings]);

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
            <input
              className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 w-64 max-w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="项目标题"
            />
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

            <div className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300">
              <label className="flex items-center gap-1 select-none">
                <input
                  type="checkbox"
                  checked={docSettings.tableCaptionNumbering}
                  onChange={(e) => setDocSettings((s) => ({ ...s, tableCaptionNumbering: e.target.checked }))}
                />
                表格排序
              </label>
              <label className="flex items-center gap-1 select-none">
                <input
                  type="checkbox"
                  checked={docSettings.imageCaptionNumbering}
                  onChange={(e) => setDocSettings((s) => ({ ...s, imageCaptionNumbering: e.target.checked }))}
                />
                图片排序
              </label>
              <label className="flex items-center gap-1 select-none">
                图片标题位置
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
              </label>
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
            {saveStatus === 'saving' && (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">保存中...</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-sm text-green-600 dark:text-green-400">已保存</span>
            )}
            {isRendering && (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">Rendering...</span>
            )}
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
          <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-950">
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

      <div className="flex flex-col w-1/2">
        <div className="px-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Preview</h2>
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
                  activeLocalIndex={activeAnchor?.pageIndex === index ? activeAnchor.localIndex : null}
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
