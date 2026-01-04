import { TypstBlock, DocumentSettings, defaultDocumentSettings } from '../types';
import { base64EncodeUtf8, LF_COVER_BEGIN_MARKER, LF_COVER_END_MARKER, LF_COMPOSITE_ROW_MARKER } from '../utils';

// Loopback type for recursive serialization
export type SerializeFn = (blocks: TypstBlock[], opts?: { settings?: DocumentSettings, target?: 'storage' | 'preview' | 'export' }) => string;

export function serializeVerticalSpace(block: TypstBlock, target: 'storage' | 'preview' | 'export', settings: DocumentSettings): string {
    // block.content stores the length, e.g. "5%", "10%", or legacy "1em"
    const length = (block.content || '5%').trim();
    const visible = settings.verticalSpaceVisible;

    // All modes now use #v() for consistent sizing across views
    const vSpace = `#v(${length})`;

    // Export and storage: just the vertical space
    if (target === 'export' || target === 'storage') {
        return vSpace;
    }

    // Preview mode with guide visible: overlay a visual indicator without changing the spacing
    // We use a box approach: first #v for actual spacing, then use negative spacing to overlay indicator
    if (target === 'preview' && visible) {
        // Use place() to overlay a visual indicator at the position of the vertical space
        // This way the actual space is determined by #v, and the indicator is just visual
        return `#block(width: 100%, above: 0pt, below: 0pt)[
#v(${length})
#place(bottom, dy: 0pt)[#block(height: ${length}, width: 100%, fill: rgb("#dcfce7"), stroke: (paint: rgb("#22c55e"), thickness: 1pt, dash: "dashed"))]
]`;
    }

    // Hidden preview: use #v() for consistent sizing
    return vSpace;
}

export function serializeCover(
    block: TypstBlock,
    opts: { settings?: DocumentSettings, target?: 'storage' | 'preview' | 'export' } | undefined,
    serializeFn: SerializeFn
): string {
    const fixedOnePage = !!block.coverFixedOnePage;
    const payload = { fixedOnePage };
    const begin = `${LF_COVER_BEGIN_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;
    const end = `${LF_COVER_END_MARKER}`;
    const children = Array.isArray(block.children) ? block.children : [];

    // Cover images should NOT participate in the report's image numbering.
    // We force-disable caption numbering inside the cover regardless of the global setting.
    const baseSettings = opts?.settings ?? defaultDocumentSettings;
    const coverSettings: DocumentSettings = {
        ...baseSettings,
        imageCaptionNumbering: false,
    };
    const body = children.length > 0 ? serializeFn(children, { ...opts, settings: coverSettings }) : '';

    const parts: string[] = [begin];
    if (body.trim()) parts.push(body);
    parts.push(end);
    if (fixedOnePage) parts.push('#pagebreak()');
    return parts.join('\n\n');
}

export function serializeCompositeRow(
    block: TypstBlock,
    opts: { settings?: DocumentSettings, target?: 'storage' | 'preview' | 'export' } | undefined,
    serializeFn: SerializeFn
): string {
    const children = Array.isArray(block.children) ? block.children : [];
    if (children.length === 0) {
        return ''; // Empty composite row produces no output
    }

    const justify = block.compositeJustify || 'space-between';
    const gap = block.compositeGap || '8pt';
    const verticalAlign = block.compositeVerticalAlign || 'top';

    // Encode metadata for round-trip parsing
    const payload = {
        justify,
        gap,
        verticalAlign,
    };
    const encoded = `${LF_COMPOSITE_ROW_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;

    // Get document settings for text styling
    // const settings = opts?.settings ?? defaultDocumentSettings;
    // const fontSize = settings.fontSize || '10.5pt';

    // Serialize each child block - get raw content without brackets for space-* modes
    const childRaw = children.map(child => {
        return serializeFn([child], opts);
    });

    // Serialize each child block wrapped in brackets for grid mode
    // We remove the enforced #set text(...) so children benefit from their own styles or global defaults.
    // Previously we forced font: "SimSun", which broke bold/italic rendering for some fonts or configurations.
    const childTypst = childRaw.map(code => `[${code}]`);

    // Map vertical alignment to Typst align values
    const alignValuesMap: Record<string, string> = { top: 'top', middle: 'horizon', bottom: 'bottom' };
    const vertAlign = alignValuesMap[verticalAlign] || 'top';

    // For space-between/around/evenly, use a different approach with #h(1fr) spacers
    // For simple alignments (left/center/right), use grid with column-gutter
    if (['space-between', 'space-around', 'space-evenly'].includes(justify)) {
        // Use box + h(1fr) approach for space distribution
        // Wrap each child in #box() for proper inline layout.
        const spacer = '#h(1fr)';
        const boxedChildren = childRaw.map(code => `#box()[${code}]`);
        let content = '';

        if (justify === 'space-between') {
            // No space at edges, only between items
            content = boxedChildren.join(` ${spacer} `);
        } else if (justify === 'space-around') {
            // Half space at edges, full space between
            content = `#h(0.5fr) ${boxedChildren.join(` ${spacer} `)} #h(0.5fr)`;
        } else {
            // space-evenly: equal space everywhere
            content = `${spacer} ${boxedChildren.join(` ${spacer} `)} ${spacer}`;
        }

        return `#box(width: 100%)[${content}]${encoded}`;
    }

    // For simple alignments, use grid
    let columns: string;
    switch (justify) {
        case 'flex-start':
        case 'flex-end':
            // Auto-width columns
            columns = `(${children.map(() => 'auto').join(', ')})`;
            break;
        case 'center':
        default:
            // Equal-width columns for center
            columns = `(${children.map(() => 'auto').join(', ')})`;
            break;
    }

    const gutterPart = `, column-gutter: ${gap}`;

    // Build the grid with vertical alignment
    const gridCode = `#grid(columns: ${columns}${gutterPart}, align: ${vertAlign}, ${childTypst.join(', ')})`;

    // Wrap with horizontal alignment
    if (justify === 'flex-start') {
        return `#align(left)[${gridCode}]${encoded}`;
    } else if (justify === 'flex-end') {
        return `#align(right)[${gridCode}]${encoded}`;
    } else {
        // center
        return `#align(center)[${gridCode}]${encoded}`;
    }
}
