import { useEffect, useRef } from 'react';

type EditorMode = 'source' | 'visual';

type ActiveAnchor = { pageIndex: number; localIndex: number } | null;

type MarkerMeta = { usableCounts: number[]; totalBlocks: number };

type Params = {
  mode: EditorMode;
  svgPages: string[];
  blocksLength: number;
  previewRef: React.RefObject<HTMLDivElement | null>;
  editorScrollRef: React.RefObject<HTMLDivElement | null>;
  pageRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  setActiveAnchor?: (a: ActiveAnchor) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

const buildMarkerMeta = (svgPages: string[]): MarkerMeta => {
  const markerCounts = svgPages.map((p) => (p.match(/fill=\"#000001\"/g) || []).length);
  const totalMarkers = markerCounts.reduce((a, b) => a + b, 0);
  const totalBlocks = Math.max(0, totalMarkers - 1);

  let sentinelPage = -1;
  for (let i = markerCounts.length - 1; i >= 0; i--) {
    if (markerCounts[i] > 0) {
      sentinelPage = i;
      break;
    }
  }

  const usableCounts = markerCounts.map((raw, i) => (i === sentinelPage ? Math.max(0, raw - 1) : raw));
  return { usableCounts, totalBlocks };
};

const globalIndexToPageLocal = (globalIndex: number, usableCounts: number[]) => {
  let remaining = globalIndex;
  for (let pageIndex = 0; pageIndex < usableCounts.length; pageIndex++) {
    const usable = usableCounts[pageIndex] ?? 0;
    if (remaining < usable) return { pageIndex, localIndex: remaining };
    remaining -= usable;
  }
  return { pageIndex: 0, localIndex: 0 };
};

const pageLocalToGlobalIndex = (pageIndex: number, localIndex: number, usableCounts: number[]) => {
  let globalIndex = 0;
  for (let i = 0; i < pageIndex; i++) globalIndex += usableCounts[i] ?? 0;
  globalIndex += localIndex;
  return globalIndex;
};

const findClosestBlockIndexFromEditorViewport = (editorEl: HTMLDivElement): number | null => {
  const rect = editorEl.getBoundingClientRect();
  const x = rect.left + 24;
  const y = rect.top + 80;
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const carrier = el?.closest?.('[data-block-index]') as HTMLElement | null;
  if (!carrier) return null;
  const raw = carrier.getAttribute('data-block-index');
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
};

const findClosestBlockIndexFromPreviewViewport = (
  previewEl: HTMLDivElement,
  pageRefs: Array<HTMLDivElement | null>,
  meta: MarkerMeta
): number | null => {
  const previewRect = previewEl.getBoundingClientRect();
  const targetY = previewRect.top + 80;

  type Candidate = { pageIndex: number; localIndex: number; dy: number };
  let bestBelow: Candidate | null = null;
  let bestAbove: Candidate | null = null;

  for (let pageIndex = 0; pageIndex < pageRefs.length; pageIndex++) {
    const pageEl = pageRefs[pageIndex];
    if (!pageEl) continue;

    const usable = meta.usableCounts[pageIndex] ?? 0;
    if (usable <= 0) continue;

    const svgEl = pageEl.querySelector('svg');
    if (!svgEl) continue;

    const markers = svgEl.querySelectorAll<SVGGraphicsElement>('path[fill="#000001"]');
    if (markers.length === 0) continue;

    const maxIndex = Math.min(usable, markers.length);
    for (let localIndex = 0; localIndex < maxIndex; localIndex++) {
      const marker = markers.item(localIndex);
      if (!marker) continue;
      const r = marker.getBoundingClientRect();
      const dy = r.top - targetY;
      if (dy >= 0) {
        if (!bestBelow || dy < bestBelow.dy) bestBelow = { pageIndex, localIndex, dy };
      } else {
        if (!bestAbove || dy > bestAbove.dy) bestAbove = { pageIndex, localIndex, dy };
      }
    }
  }

  const chosen = bestBelow ?? bestAbove;
  if (!chosen) return null;

  return pageLocalToGlobalIndex(chosen.pageIndex, chosen.localIndex, meta.usableCounts);
};

const scrollPreviewToIndex = async (opts: {
  previewEl: HTMLDivElement;
  pageRefs: Array<HTMLDivElement | null>;
  meta: MarkerMeta;
  index: number;
  requestAnchor?: (a: ActiveAnchor) => void;
  clearAnchor?: () => void;
}) => {
  const { previewEl, pageRefs, meta, index, requestAnchor, clearAnchor } = opts;
  if (meta.totalBlocks <= 0) return;

  const { pageIndex, localIndex } = globalIndexToPageLocal(index, meta.usableCounts);
  const pageEl = pageRefs[pageIndex];
  if (!pageEl) return;

  requestAnchor?.({ pageIndex, localIndex });

  const previewRect = previewEl.getBoundingClientRect();
  const targetY = previewRect.top + 80;

  // Ensure page is roughly visible first.
  pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });

  const tryScroll = (triesLeft: number) => {
    const svgEl = pageEl.querySelector('svg');
    if (!svgEl) {
      if (triesLeft > 0) requestAnimationFrame(() => tryScroll(triesLeft - 1));
      else clearAnchor?.();
      return;
    }

    const markers = svgEl.querySelectorAll<SVGGraphicsElement>('path[fill="#000001"]');
    const marker = markers.item(localIndex);
    if (!marker) {
      if (triesLeft > 0) requestAnimationFrame(() => tryScroll(triesLeft - 1));
      else clearAnchor?.();
      return;
    }

    const r = marker.getBoundingClientRect();
    const delta = r.top - targetY;
    if (Number.isFinite(delta) && Math.abs(delta) > 1) {
      previewEl.scrollTo({ top: Math.max(0, previewEl.scrollTop + delta), behavior: 'auto' });
    }

    // Clear anchor soon after to avoid permanent forceVisible.
    setTimeout(() => clearAnchor?.(), 200);
  };

  tryScroll(24);
};

export function useBidirectionalScrollSync({
  mode,
  svgPages,
  blocksLength,
  previewRef,
  editorScrollRef,
  pageRefs,
  setActiveAnchor,
}: Params) {
  const markerMetaRef = useRef<MarkerMeta>({ usableCounts: [], totalBlocks: 0 });

  const previewRafRef = useRef<number | null>(null);
  const editorRafRef = useRef<number | null>(null);

  const ignorePreviewUntilRef = useRef(0);
  const ignoreEditorUntilRef = useRef(0);

  const lastFromPreviewRef = useRef<number>(-1);
  const lastFromEditorRef = useRef<number>(-1);

  const clearAnchorTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    markerMetaRef.current = buildMarkerMeta(svgPages);
    lastFromPreviewRef.current = -1;
    lastFromEditorRef.current = -1;
  }, [svgPages]);

  useEffect(() => {
    const previewEl = previewRef.current;
    const editorEl = editorScrollRef.current;
    if (!previewEl || !editorEl) return;

    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const clearAnchor = () => {
      if (clearAnchorTimeoutRef.current !== null) {
        window.clearTimeout(clearAnchorTimeoutRef.current);
        clearAnchorTimeoutRef.current = null;
      }
      setActiveAnchor?.(null);
    };

    const requestAnchor = (a: ActiveAnchor) => {
      if (clearAnchorTimeoutRef.current !== null) {
        window.clearTimeout(clearAnchorTimeoutRef.current);
        clearAnchorTimeoutRef.current = null;
      }
      setActiveAnchor?.(a);
      clearAnchorTimeoutRef.current = window.setTimeout(() => setActiveAnchor?.(null), 400);
    };

    const onPreviewScroll = () => {
      if (mode !== 'visual') return;
      if (now() < ignorePreviewUntilRef.current) return;
      if (svgPages.length === 0 || blocksLength === 0) return;

      if (previewRafRef.current !== null) return;
      previewRafRef.current = window.requestAnimationFrame(() => {
        previewRafRef.current = null;

        const meta = markerMetaRef.current;
        const idx = findClosestBlockIndexFromPreviewViewport(previewEl, pageRefs.current, meta);
        if (idx === null) return;

        const clamped = clamp(idx, 0, Math.max(0, blocksLength - 1));
        if (clamped === lastFromPreviewRef.current) return;
        lastFromPreviewRef.current = clamped;

        ignoreEditorUntilRef.current = now() + 220;

        const target = editorEl.querySelector<HTMLElement>(`[data-block-index="${clamped}"]`);
        if (!target) return;

        const editorRect = editorEl.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const nextTop = targetRect.top - editorRect.top + editorEl.scrollTop - editorEl.clientHeight * 0.2;
        editorEl.scrollTo({ top: Math.max(0, nextTop), behavior: 'auto' });
      });
    };

    const onEditorScroll = () => {
      if (mode !== 'visual') return;
      if (now() < ignoreEditorUntilRef.current) return;
      if (svgPages.length === 0 || blocksLength === 0) return;

      if (editorRafRef.current !== null) return;
      editorRafRef.current = window.requestAnimationFrame(() => {
        editorRafRef.current = null;

        const idx = findClosestBlockIndexFromEditorViewport(editorEl);
        if (idx === null) return;

        const clamped = clamp(idx, 0, Math.max(0, blocksLength - 1));
        if (clamped === lastFromEditorRef.current) return;
        lastFromEditorRef.current = clamped;

        ignorePreviewUntilRef.current = now() + 260;

        void scrollPreviewToIndex({
          previewEl,
          pageRefs: pageRefs.current,
          meta: markerMetaRef.current,
          index: clamped,
          requestAnchor,
          clearAnchor,
        });
      });
    };

    previewEl.addEventListener('scroll', onPreviewScroll, { passive: true });
    editorEl.addEventListener('scroll', onEditorScroll, { passive: true });

    return () => {
      previewEl.removeEventListener('scroll', onPreviewScroll);
      editorEl.removeEventListener('scroll', onEditorScroll);

      if (previewRafRef.current !== null) {
        window.cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
      if (editorRafRef.current !== null) {
        window.cancelAnimationFrame(editorRafRef.current);
        editorRafRef.current = null;
      }

      if (clearAnchorTimeoutRef.current !== null) {
        window.clearTimeout(clearAnchorTimeoutRef.current);
        clearAnchorTimeoutRef.current = null;
      }
    };
  }, [blocksLength, mode, pageRefs, previewRef, editorScrollRef, setActiveAnchor, svgPages.length]);
}
