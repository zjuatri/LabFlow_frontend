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
    const alignValue = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';

    // Helper to strip #text(font:...) wrappers - needed for both payload and output
    const stripTextWrapper = (s: string): string | null => {
        const prefixMatch = s.match(/^#text\(font:\s*"[^"]+"\)\s*\[/);
        if (!prefixMatch) return null;
        const bracketStart = prefixMatch[0].length - 1;
        let depth = 0;
        let end = -1;
        for (let i = bracketStart; i < s.length; i++) {
            if (s[i] === '[') depth++;
            else if (s[i] === ']') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        if (end === -1) return null;
        if (end !== s.length - 1 && s.slice(end + 1).trim() !== '') return null;
        return s.slice(bracketStart + 1, end);
    };

    const stripMalformedTextWrapper = (s: string): string => {
        const prefixMatch = s.match(/^#text\(font:\s*"[^"]+"\)\s*\[/);
        if (!prefixMatch) return s;
        const afterPrefix = s.slice(prefixMatch[0].length);
        let depth = 1;
        let end = -1;
        for (let i = 0; i < afterPrefix.length; i++) {
            if (afterPrefix[i] === '[') depth++;
            else if (afterPrefix[i] === ']') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        if (end === -1) return afterPrefix;
        return afterPrefix.slice(0, end);
    };

    // Clean caption for storage in LF_IMAGE marker (should be plain text, not wrapped)
    let cleanCaptionForPayload = captionRaw;
    while (true) {
        const inner = stripTextWrapper(cleanCaptionForPayload);
        if (inner !== null) {
            cleanCaptionForPayload = inner;
        } else {
            break;
        }
    }
    if (cleanCaptionForPayload.startsWith('#text(font:')) {
        cleanCaptionForPayload = stripMalformedTextWrapper(cleanCaptionForPayload);
    }

    const payload = {
        caption: cleanCaptionForPayload,
        width,
        height,
    };
    const encoded = `${LF_IMAGE_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;

    // If image path is empty, output a placeholder text instead of image("") which causes compilation error
    // Trim and remove zero-width spaces which might be left over from editing
    // Also strip query parameters (e.g., ?t=123456 for cache busting) since Typst treats paths as filesystem paths
    const imagePathRaw = (block.content ?? '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
    const imagePath = imagePathRaw.split('?')[0]; // Strip query parameters for Typst
    if (!imagePath) {
        // Show a styled placeholder box similar to [[IMAGE_PLACEHOLDER]] style
        const placeholderText = captionText || '待上传图片';
        const textContent = `#text(fill: rgb("#3B82F6"), weight: "bold", size: 1.5em)[+] #text(fill: rgb("#3B82F6"), size: 0.9em)[${placeholderText}]`;
        const blockContent = `#align(${alignValue} + horizon)[${textContent}]`;

        // Store the original empty state with caption in the payload for round-tripping
        const emptyPayload = {
            caption: cleanCaptionForPayload,
            width,
            height,
            src: '' // Empty src indicates it needs upload
        };
        const emptyEncoded = `${LF_IMAGE_MARKER}${base64EncodeUtf8(JSON.stringify(emptyPayload))}*/`;

        return `#align(${alignValue})[#block(width: ${width}, height: 8em, fill: rgb("#EFF6FF"), stroke: rgb("#93C5FD"), radius: 4pt, inset: 12pt)[${blockContent}]]${emptyEncoded}`;
    }


    // Check if the path looks like a placeholder or hallucinated path that won't exist
    // Valid paths should already exist in the project's images folder
    // Hallucinated paths often have Chinese characters or non-standard patterns
    const isLikelyHallucinated = (path: string): boolean => {
        // Strip query parameters (e.g., ?t=123456 for cache busting) before checking
        const pathWithoutQuery = path.split('?')[0];
        const filename = pathWithoutQuery.split('/').pop() || '';

        // Check for common hallucination patterns:
        // 1. Chinese characters in filename (DeepSeek often invents these)
        // 2. Placeholder-like names
        // 3. Illegal filesystem characters in the path (excluding query string)
        const hasChineseInFilename = /[\u4e00-\u9fa5]/.test(filename);
        const looksLikePlaceholder = /\[\[.*\]\]|待.*图|占位/.test(pathWithoutQuery);
        const hasIllegalChars = /[<>"|*]/.test(pathWithoutQuery); // Removed ? since it's valid in query string
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
        const warningText = captionText || '图片路径无效';
        // Escape special characters for Typst and truncate path
        const pathDisplay = (imagePath.length > 50 ? imagePath.slice(0, 50) + '…' : imagePath)
            .replace(/\\/g, '\\\\')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/"/g, '\\"');

        // Use single-line format to avoid parsing issues when nested in other blocks
        const textContent = `#text(fill: rgb("#DC2626"), weight: "bold")[图片缺失] #h(1em) #text(size: 0.8em, fill: rgb("#991B1B"))[${warningText}]`;
        return `#block(width: 100%, fill: rgb("#FEF2F2"), stroke: rgb("#FCA5A5"), inset: 12pt, radius: 4pt)[#align(center)[${textContent}]]${encoded}`;
    }


    // Use Typst native #figure for automatic numbering and consistent layout
    // This resolves issues where manual counting logic falls out of sync
    const imageContent = `image("${imagePath}", width: ${width}, height: ${height})`;

    // If no caption, just output the image
    if (!captionRaw) {
        return `#align(${alignValue})[#figure(${imageContent}, numbering: none)]`; // numbering: none prevents "Figure 1" if no caption
    }

    const numberingArg = settings.imageCaptionNumbering ? '' : ', numbering: none';
    // supplement="图" ensures "Figure" becomes "图". 
    // Usually handled by set text(lang: "zh") but we can be explicit or rely on global settings.
    // For now, let's assume global settings or defaults handled by previous manual logic match user expectation.
    // Specifying supplement explicitly is safer for "图".
    const supplementArg = ', supplement: "图"';

    const fontToCheck = block.captionFont || 'SimSun';
    // Use the already-cleaned caption (cleanCaptionForPayload) for the Typst output
    const captionContent = `#text(font: "${fontToCheck}")[${cleanCaptionForPayload}]`;
    const captionArg = `, caption: [${captionContent}]`;

    // Handle caption position via gap/local set if critical, but figure defaults to bottom. 
    // To support top caption, we'd need #show figure: set figure(caption-pos: top) in preamble or block scoped.
    // For block scoped: 
    let blockPrefix = '';
    if (settings.imageCaptionPosition === 'above') {
        blockPrefix = '#show figure: set figure(caption-pos: top)\n';
    }

    return `${blockPrefix}#align(${alignValue})[#figure(${imageContent}${captionArg}${numberingArg}${supplementArg})]${encoded}`;
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
