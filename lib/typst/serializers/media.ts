import { TypstBlock, DocumentSettings } from '../types';
import { base64EncodeUtf8, safeParseChartPayload, LF_IMAGE_MARKER, LF_CHART_MARKER } from '../utils';

export function serializeImage(block: TypstBlock, imageIndex: number, settings: DocumentSettings): string {
    const width = block.width || '50%';
    const height = 'auto';
    const align = block.align || 'center';
    const captionRaw = (block.caption ?? '').trim();
    // Only show numbering if: numbering is enabled AND image has a caption AND imageIndex > 0
    const shouldNumber = settings.imageCaptionNumbering && captionRaw.length > 0 && imageIndex > 0;
    const label = shouldNumber ? `图${imageIndex} ` : '';
    const captionText = captionRaw ? (label + captionRaw).trim() : '';
    const payload = {
        caption: block.caption ?? '',
        width,
        height,
    };
    const encoded = `${LF_IMAGE_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;
    const alignValue = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';

    // If image path is empty, output a placeholder text instead of image("") which causes compilation error
    const imagePath = (block.content ?? '').trim();
    if (!imagePath) {
        const placeholderText = captionText || '(待上传图片)';
        return `#align(${alignValue})[${placeholderText}]${encoded}`;
    }

    // Check if the path looks like a placeholder or hallucinated path that won't exist
    // Valid paths should already exist in the project's images folder
    // Hallucinated paths often have Chinese characters or non-standard patterns
    const isLikelyHallucinated = (path: string): boolean => {
        // Check for common hallucination patterns:
        // 1. Chinese characters in filename (DeepSeek often invents these)
        // 2. Paths that don't start with /static/projects/ but look like static paths
        // 3. Placeholder-like names
        const hasChineseInFilename = /[\u4e00-\u9fa5]/.test(path.split('/').pop() || '');
        const looksLikePlaceholder = /\[\[.*\]\]|待.*图|占位/.test(path);
        const hasIllegalChars = /[<>"|?*]/.test(path);
        return hasChineseInFilename || looksLikePlaceholder || hasIllegalChars;
    };

    // Explicitly handle [[IMAGE_PLACEHOLDER...]] tags as a valid placeholder state
    // Relaxed regex to catch various spacing or casing
    if (/\[\[\s*IMAGE_PLACEHOLDER/i.test(imagePath)) {
        // Extract hint text if possible, otherwise default
        const match = imagePath.match(/\[\[\s*IMAGE_PLACEHOLDER\s*:\s*(.*?)\s*\]\]/i);
        // For placeholders, we use a single-line block to avoid parsing issues / newline replacement loops
        // caused by typstToBlocks treating unknown multi-line blocks as paragraphs.
        const hint = match ? match[1] : '(点击此处上传图片)';
        const placeholderText = hint || '图片占位符';
        const textContent = `#text(fill: rgb("#3B82F6"), weight: "bold", size: 1.5em)[+] #text(fill: rgb("#3B82F6"), size: 0.9em)[${placeholderText}]`;
        // Use the selected alignment (alignValue) instead of hardcoded center
        const blockContent = `#align(${alignValue} + horizon)[${textContent}]`;

        // We explicitly store the 'src' (block.content) in the payload so the parser can restore the 
        // [[IMAGE_PLACEHOLDER]] value even though it's not in the visual Typst code (which only shows the hint).
        const payload = {
            caption: block.caption,
            width: block.width,
            height: block.height,
            src: block.content
        };
        const encoded = `/*LF_IMAGE:${base64EncodeUtf8(JSON.stringify(payload))}*/`;

        // Compact single-line block - use alignValue for the outer #align as well
        return `#align(${alignValue})[#block(width: ${width}, height: 8em, fill: rgb("#EFF6FF"), stroke: rgb("#93C5FD"), radius: 4pt, inset: 12pt)[${blockContent}]]${encoded}`;
    }

    // If path looks hallucinated, output a styled placeholder instead
    if (isLikelyHallucinated(imagePath)) {
        const warningText = captionText || '(图片路径无效)';
        const pathDisplay = imagePath.length > 60 ? imagePath.slice(0, 60) + '...' : imagePath;
        return `#block(width: 100%, fill: rgb("#FEF2F2"), stroke: rgb("#FCA5A5"), inset: 12pt, radius: 4pt)[
  #align(center)[
    #text(fill: rgb("#DC2626"), weight: "bold")[图片缺失]
    #linebreak()
    #text(size: 0.8em, fill: rgb("#991B1B"))[路径: ${pathDisplay}]
  ]
]${encoded}`;
    }

    const imageLine = `#align(${alignValue}, image("${imagePath}", width: ${width}, height: ${height}))${encoded}`;
    const captionLine = captionText ? `#align(${alignValue})[${captionText}]` : '';

    if (captionLine && settings.imageCaptionPosition === 'above') {
        return `${captionLine}\n${imageLine}`;
    } else if (captionLine && settings.imageCaptionPosition === 'below') {
        return `${imageLine}\n${captionLine}`;
    }

    return imageLine;
}

export function serializeChart(block: TypstBlock): string {
    const payload = safeParseChartPayload(block.content ?? '');
    const imageUrl = (payload.imageUrl ?? '').trim();
    const encoded = `${LF_CHART_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;
    const align = block.align || 'center';
    const alignValue = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';

    if (!imageUrl) {
        return `#align(${alignValue})[(未生成图表)]${encoded}`;
    }

    const width = block.width || '50%';
    const imageLine = `#align(${alignValue}, image("${imageUrl}", width: ${width}, height: auto))${encoded}`;
    return imageLine;
}
