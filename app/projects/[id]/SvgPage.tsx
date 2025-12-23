'use client';

import { useEffect, useRef, useState } from 'react';

type SvgPageProps = {
  svgContent: string;
  pageIndex: number;
  forceVisible: boolean;
  activeLocalIndex: number | null;
  highlightNonce: number;
  registerPageRef: (pageIndex: number, el: HTMLDivElement | null) => void;
};

// Lazy-loaded SVG page component with intersection observer
export function SvgPage({
  svgContent,
  pageIndex,
  forceVisible,
  activeLocalIndex,
  highlightNonce,
  registerPageRef,
}: SvgPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [observedVisible, setObservedVisible] = useState(false);
  const isVisible = forceVisible || observedVisible;
  const lastHighlightNonceRef = useRef(0);

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
    // Only show highlight when explicitly triggered by a click (highlightNonce bumps).
    if (highlightNonce <= lastHighlightNonceRef.current) return;
    if (!isVisible || activeLocalIndex === null || !containerRef.current) return;

    // Consume this highlight trigger only once we are ready to compute the union/highlight.
    lastHighlightNonceRef.current = highlightNonce;

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
      let container: Element | null = marker.parentNode instanceof Element ? marker.parentNode : null;
      // Walk up to find a reasonable container (typically a <g> from #block)
      // The container should be large enough to contain the block content
      while (container && container !== svgElement) {
        // If this container has more children besides just structural groups, it's likely our block container
        const childCount = container.children.length;
        if (childCount > 1) {
          return container;
        }
        const parent = container.parentNode;
        container = parent instanceof Element ? parent : null;
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
      let p: Element | null = nextMarker.parentNode instanceof Element ? nextMarker.parentNode : null;
      while (p && p !== svgElement && p !== markerContainer) {
        nextMarkerAncestors.add(p);
        const parent = p.parentNode;
        p = parent instanceof Element ? parent : null;
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

      const isOutOfBounds =
        centerX < visibleLeft - 100 ||
        centerX > visibleRight + 100 ||
        centerY < visibleTop - 100 ||
        centerY > visibleBottom + 100;

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
  }, [highlightNonce, isVisible, activeLocalIndex]);

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
        <div className="flex items-center justify-center h-full text-zinc-400">Loading page {pageIndex + 1}...</div>
      )}
    </div>
  );
}
