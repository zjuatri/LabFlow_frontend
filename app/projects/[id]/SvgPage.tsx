'use client';

import { useEffect, useRef, useState } from 'react';
import { useSvgInteraction } from './useSvgInteraction';

type SvgPageProps = {
  svgContent: string;
  pageIndex: number;
  forceVisible: boolean;
  activeLocalIndex: number | null;
  highlightNonce: number;
  registerPageRef: (pageIndex: number, el: HTMLDivElement | null) => void;
  onBlockClick: (pageIndex: number, localIndex: number) => void;
};

// Lazy-loaded SVG page component with intersection observer
export function SvgPage({
  svgContent,
  pageIndex,
  forceVisible,
  activeLocalIndex,
  highlightNonce,
  registerPageRef,
  onBlockClick,
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

  // Use the new interaction hook (handles geometric hit testing, hover, click)
  const { hoveredLocalIndex, handleMouseMove, handleMouseLeave, handleClick, getBlockRect } = useSvgInteraction(
    containerRef as React.RefObject<HTMLDivElement>,
    pageIndex,
    isVisible,
    onBlockClick
  );

  // Re-use logic for visuals but simpler now because hook does the heavy lifting
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current || !isVisible || hoveredLocalIndex === null) {
      setHoverRect(null);
      return;
    }

    // Try to get precise rect from hook
    const rect = getBlockRect(hoveredLocalIndex);
    if (rect && rect.l !== Infinity) {
      // Add some padding
      const padding = 2; // subtle padding
      setHoverRect({
        left: rect.l - padding,
        top: rect.t - padding,
        width: (rect.r - rect.l) + padding * 2,
        height: (rect.b - rect.t) + padding * 2
      });
    } else {
      setHoverRect(null);
    }
  }, [hoveredLocalIndex, isVisible, getBlockRect]);


  // Handle scrolling to active block marker (highlight effect)
  useEffect(() => {
    if (highlightNonce <= lastHighlightNonceRef.current) return;
    if (!isVisible || activeLocalIndex === null || !containerRef.current) return;

    lastHighlightNonceRef.current = highlightNonce;

    // Use getBlockRect for accurate block bounds
    const rect = getBlockRect(activeLocalIndex);
    if (rect && rect.l !== Infinity) {
      showFlashHighlight(rect);
    }
  }, [highlightNonce, isVisible, activeLocalIndex, getBlockRect]);

  // Helper to show flash highlight using block rect
  const showFlashHighlight = (rect: { l: number; t: number; r: number; b: number }) => {
    const container = containerRef.current;
    if (!container) return;

    const padding = 4;
    const left = rect.l - padding;
    const top = rect.t - padding;
    const width = (rect.r - rect.l) + padding * 2;
    const height = (rect.b - rect.t) + padding * 2;

    const highlight = document.createElement('div');
    Object.assign(highlight.style, {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      border: '2px solid rgba(59, 130, 246, 0.4)',
      borderRadius: '4px',
      zIndex: '20',
      opacity: '0',
      transition: 'opacity 0.3s',
      pointerEvents: 'none'
    });

    container.appendChild(highlight);
    requestAnimationFrame(() => highlight.style.opacity = '1');

    setTimeout(() => {
      highlight.style.opacity = '0';
      setTimeout(() => highlight.remove(), 300);
    }, 1000);
  };

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        registerPageRef(pageIndex, el);
      }}
      className="bg-white shadow-lg relative transition-colors"
      style={{
        minHeight: isVisible ? 'auto' : '800px',
        // Use geometric visual feedback for cursor
        cursor: hoveredLocalIndex !== null ? 'pointer' : 'default'
      }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Hover Overlay - Using simple band logic now */}
      {hoverRect && (
        <div
          style={{
            position: 'absolute',
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
            backgroundColor: 'rgba(59, 130, 246, 0.08)', // Faint blue
            // border: '1px solid rgba(59, 130, 246, 0.2)',
            pointerEvents: 'none',
            borderRadius: '2px',
            zIndex: 10,
            transition: 'all 0.1s ease-out'
          }}
        />
      )}
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
