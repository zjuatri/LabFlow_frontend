import { useEffect, useState, useCallback, useRef } from 'react';

// Helper to check if an element is a marker
export const isTypstMarker = (el: Element | null) => !!el && el.matches?.('path[fill="#000001"]');

// Helper to get screen rect for SVG elements
export const getSvgScreenRect = (g: SVGGraphicsElement) => {
    try {
        const r = g.getBoundingClientRect();
        if (r.width > 0.5 && r.height > 0.5) return r;
    } catch { }
    return null;
};

// Hook for handling SVG interactions (Hover, Click, Geometric Hit Testing)
export function useSvgInteraction(
    containerRef: React.RefObject<HTMLDivElement>,
    pageIndex: number,
    isVisible: boolean,
    onBlockClick: (pageIndex: number, localIndex: number) => void,
    svgContent?: string // Add svgContent to trigger re-analysis on content change
) {
    const [hoveredLocalIndex, setHoveredLocalIndex] = useState<number | null>(null);

    // Store rects: index -> {l, t, r, b} relative to container
    const blockRectsRef = useRef<Map<number, { l: number, t: number, r: number, b: number }>>(new Map());

    // 1. Analyze Page Geometry (Full Union Rect Calculation)
    // We scan elements to build precise bounding boxes for each block.
    const analyzeGeometry = useCallback(() => {
        if (!containerRef.current) return;
        const svgElement = containerRef.current.querySelector('svg');
        if (!svgElement) return;

        const markers = Array.from(svgElement.querySelectorAll<SVGGraphicsElement>('path[fill="#000001"]'));
        if (markers.length === 0) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const rects = new Map<number, { l: number, t: number, r: number, b: number }>();

        // We use a simplified strategy:
        // 1. Identify "bands" by markers for rough sorting.
        // 2. But we really want strict bounding boxes.
        // The previous "Union" algorithm in SvgPage was:
        // - Find marker
        // - Collect all subsequent elements until next marker (ignoring nested parents of next marker)
        // - Union their BBox.

        // Let's implement that efficiently in one pass.
        // Flatten all elements in DFS order.
        const allElements: Element[] = [];
        const collect = (el: Element) => {
            allElements.push(el);
            // Optimization: Don't dive into definitions or markers themselves
            if (el.tagName === 'defs') return;
            for (let i = 0; i < el.children.length; i++) collect(el.children[i]);
        };
        collect(svgElement);

        // Map elements to markers
        // Iterate elements. Keep track of "latest seen marker index".
        // But we must respect hierarchy for "next marker ancestors".

        // Actually, simple linear scan works well for Typst SVGs because they are largely flat commands.
        // But for nested groups, "ancestor of next marker" check is crucial to avoid claiming the container of the next block.

        const markerIndices = new Map<Element, number>();
        markers.forEach((m, i) => markerIndices.set(m, i));

        const getScreenRect = (g: SVGGraphicsElement) => {
            try {
                const r = g.getBoundingClientRect();
                if (r.width > 0.5 && r.height > 0.5) return r;
            } catch { }
            return null;
        };

        const isSkippable = (el: Element) => {
            const tag = el.tagName.toLowerCase();
            // Skip logic: defs, clipPath, mask, style, metadata
            // Also skip the Markers themselves (1x1 rects) from the Union calculation so they don't skew 0-width blocks?
            // Actually marker rect is useful anchor. Keep custom isMarker check.
            if (tag === 'defs' || tag === 'clippath' || tag === 'mask' || tag === 'style' || tag === 'metadata') return true;
            return false;
        };

        // Pre-calculate ancestors for all markers effectively?
        // Or just lazy check.
        const markerSet = new Set(markers);

        let currentBlockIndex = -1;
        let nextMarker = markers[0];
        let nextMarkerAncestors = new Set<Element>();

        // Setup for first block (before first marker - usually empty or header?)
        // We only care about blocks starting with a marker.

        // Find distinct elements to process
        // optimization: process only leaf nodes or significant groups?
        // simple approach: Process all SVGGraphics elements in the list.

        for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];

            // 1. Check if entering a new block (hit a marker)
            if (markerSet.has(el as SVGGraphicsElement)) {
                currentBlockIndex = markerIndices.get(el)!;
                nextMarker = markers[currentBlockIndex + 1];

                // Recompute ancestors of next marker
                nextMarkerAncestors.clear();
                if (nextMarker) {
                    let p = nextMarker.parentNode;
                    while (p && p !== svgElement) {
                        if (p instanceof Element) nextMarkerAncestors.add(p);
                        p = p.parentNode;
                    }
                }

                // Initialize rect for this block - DON'T use marker rect as it's just 1x1 anchor
                // We'll let subsequent content define the rect
                continue;
            }

            if (currentBlockIndex === -1) continue;
            if (isSkippable(el)) continue;

            // 2. Check if this element belongs to current block
            // Failure case: It is an ancestor of the next marker (so it effectively contains the *next* block too).
            if (nextMarkerAncestors.has(el)) continue;

            // 3. Skip <g> elements that are containers (not leaf content)
            // They often span the whole page width and mess up the union
            // We still traverse into their children (via DFS), so skip the container itself
            const tag = el.tagName.toLowerCase();
            if (tag === 'g' && el.children.length > 0) continue;

            // 4. Add to union
            if (typeof (el as any).getBoundingClientRect === 'function') {
                const r = getScreenRect(el as SVGGraphicsElement);
                if (r) {
                    const l = r.left - containerRect.left;
                    const t = r.top - containerRect.top;
                    const w = r.width;
                    const h = r.height;

                    // 5. Skip elements that are suspiciously large (likely page-level bg rects)
                    // BUT: Only skip if it's a rect/path without text content
                    // Text elements (use, path with d attribute for glyphs) should NOT be skipped
                    const containerWidth = containerRect.width;
                    if (w > containerWidth * 0.8) {
                        // Check if this is likely a background rect (not text)
                        // Text in Typst SVG is usually rendered as <use> or <path> with complex d attribute
                        const isLikelyBackground = tag === 'rect' || 
                            (tag === 'path' && (!el.getAttribute('d') || el.getAttribute('d')!.split(' ').length < 10));
                        if (isLikelyBackground) continue;
                    }

                    const existing = rects.get(currentBlockIndex) || { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };

                    rects.set(currentBlockIndex, {
                        l: Math.min(existing.l, l),
                        t: Math.min(existing.t, t),
                        r: Math.max(existing.r, l + w),
                        b: Math.max(existing.b, t + h)
                    });
                }
            }
        }

        // Post-process: Ensure every block has at least some size (marker size)
        // And maybe expand slightly for easier clicking?
        blockRectsRef.current = rects;
    }, [containerRef]);

    // Re-analyze when visible or resized or when SVG content changes
    useEffect(() => {
        if (!isVisible) return;
        setTimeout(analyzeGeometry, 150); // Slightly larger delay for stability

        const obs = new ResizeObserver(() => analyzeGeometry());
        if (containerRef.current) obs.observe(containerRef.current);

        return () => obs.disconnect();
    }, [isVisible, analyzeGeometry, containerRef, svgContent]); // Add svgContent to trigger on content change


    // 2. Hit Testing Logic
    const findBlockAtPoint = useCallback((clientX: number, clientY: number) => {
        if (!containerRef.current || blockRectsRef.current.size === 0) return -1;

        const containerRect = containerRef.current.getBoundingClientRect();
        const x = clientX - containerRect.left;
        const y = clientY - containerRect.top;

        let bestCandidate = -1;
        let minDist = Infinity;

        // 1. Strict Inclusion Check
        for (const [index, rect] of blockRectsRef.current.entries()) {
            if (x >= rect.l && x <= rect.r && y >= rect.t && y <= rect.b) {
                // If nested blocks (rare in this flattened view but possible overlap), 
                // pick the smallest one? Or the one that started later (usually deeper)?
                // Typst blocks are sequential. Overlap usually means tight packing.
                // Return immediately for now.
                return index;
            }

            // 2. Distance check (Fallback for margins)
            // Compute distance to the rect rectangle
            // dx = max(rect.l - x, 0, x - rect.r)
            const dx = Math.max(rect.l - x, 0, x - rect.r);
            // dy = max(rect.t - y, 0, y - rect.b) 
            const dy = Math.max(rect.t - y, 0, y - rect.b);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDist) {
                minDist = dist;
                bestCandidate = index;
            }
        }

        // If we clicked outside any block, use the closest one within a threshold
        // Threshold: 50px?
        if (minDist < 50) {
            return bestCandidate;
        }

        return -1;
    }, [containerRef]);


    // 3. Event Handlers
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const idx = findBlockAtPoint(e.clientX, e.clientY);
        setHoveredLocalIndex(idx !== -1 ? idx : null);
    }, [findBlockAtPoint]);

    const handleMouseLeave = useCallback(() => {
        setHoveredLocalIndex(null);
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        const idx = findBlockAtPoint(e.clientX, e.clientY);
        if (idx !== -1) {
            onBlockClick(pageIndex, idx);
        }
    }, [findBlockAtPoint, onBlockClick, pageIndex]);

    const getBlockRect = useCallback((index: number) => {
        return blockRectsRef.current.get(index);
    }, []);

    return {
        hoveredLocalIndex,
        handleMouseMove,
        handleMouseLeave,
        handleClick,
        analyzeGeometry,
        getBlockRect
    };
}
