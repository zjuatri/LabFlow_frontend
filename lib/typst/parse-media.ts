import { TypstBlock } from './types';
import { base64DecodeUtf8, generateId } from './utils';

export function parseChartBlock(trimmed: string, markerB64: string): TypstBlock | null {
    try {
        const decoded: unknown = JSON.parse(base64DecodeUtf8(markerB64));
        const payload = (decoded && typeof decoded === 'object') ? (decoded as Record<string, unknown>) : {};

        const match = trimmed.match(/#align\(\s*(left|center|right)\s*,\s*image\("([^"]+)"/);
        const align = (match?.[1] as 'left' | 'center' | 'right' | undefined) ?? 'center';
        const imageUrl = match?.[2] ?? '';

        const widthMatch = trimmed.match(/\bwidth\s*:\s*([^,\)\]]+)/);
        const widthFromCode = widthMatch?.[1]?.trim();

        const merged = {
            ...(payload && typeof payload === 'object' ? payload : {}),
            imageUrl: (typeof payload['imageUrl'] === 'string' ? (payload['imageUrl'] as string) : imageUrl) || imageUrl,
        };

        return {
            id: generateId(),
            type: 'chart',
            content: JSON.stringify(merged),
            align,
            width: widthFromCode || '50%',
        };
    } catch {
        return null;
    }
}

export function parseImageBlock(trimmed: string): TypstBlock | null {
    // Handle new placeholder block format: #block(...)[...]/*LF_IMAGE:...*/
    const placeholderMatch = trimmed.match(/^#block\(.*\)\[.*\](?:\/\*LF_IMAGE:([A-Za-z0-9+/=]+)\*\/)$/);
    if (placeholderMatch) {
        try {
            const payload = JSON.parse(base64DecodeUtf8(placeholderMatch[1])) as {
                caption?: string;
                width?: string;
                height?: string;
                src?: string;
            };

            const widthMatch = trimmed.match(/width:\s*([^,)\s]+)/);

            return {
                id: generateId(),
                type: 'image',
                // Critical: Restore original placeholder src if available, otherwise fallback
                content: payload.src || '[[IMAGE_PLACEHOLDER]]',
                align: 'center',
                width: (payload.width ?? widthMatch?.[1] ?? '50%'),
                height: 'auto',
                caption: (payload.caption ?? '').toString(),
            };
        } catch {
            // ignore
        }
    }

    // Handle simple placeholder format: #align(center)[text]/*LF_IMAGE:...*/
    // This is used for empty images without content
    const simplePlaceholderMatch = trimmed.match(/^#align\(\s*(left|center|right)\s*\)\[([^\]]*)\](?:\/\*LF_IMAGE:([A-Za-z0-9+/=]+)\*\/)$/);
    if (simplePlaceholderMatch) {
        try {
            const payload = JSON.parse(base64DecodeUtf8(simplePlaceholderMatch[3])) as {
                caption?: string;
                width?: string;
                height?: string;
                src?: string;
            };
            return {
                id: generateId(),
                type: 'image',
                content: payload.src || '', // Empty path for placeholder
                align: (simplePlaceholderMatch[1] as 'left' | 'center' | 'right') ?? 'center',
                width: payload.width || '50%',
                height: 'auto',
                caption: payload.caption || '',
            };
        } catch {
            // ignore
        }
    }

    const imgMarker = trimmed.match(/\/\*LF_IMAGE:([A-Za-z0-9+/=]+)\*\//);
    if (imgMarker) {
        try {
            const payload = JSON.parse(base64DecodeUtf8(imgMarker[1])) as {
                caption?: string;
                width?: string;
                height?: string;
                src?: string; // Support src in normal images too if present
            };
            const match = trimmed.match(/#align\(\s*(left|center|right)\s*,\s*image\("([^"]+)"(?:,\s*width:\s*([^,}]+))?(?:,\s*height:\s*([^)]+))?\)\)/);
            if (match) {
                return {
                    id: generateId(),
                    type: 'image',
                    content: payload.src || match[2],
                    align: (match[1] as 'left' | 'center' | 'right') ?? 'center',
                    width: (payload.width ?? match[3]?.trim() ?? '50%'),
                    height: 'auto',
                    caption: (payload.caption ?? '').toString(),
                };
            }
        } catch {
            // ignore
        }
    }

    // Match #align(..)[#figure(..)] pattern
    // Generated format: #align(center)[#figure(image("...", width: 50%, height: auto), caption: [#text(font: "SimSun")[...]], ...)]

    // First, try to match the outer #align wrapper which is common
    // use [\s\S] instead of . with s flag to support older TS targets
    const alignMatch = trimmed.match(/^#align\(\s*(left|center|right)\s*\)\s*\[([\s\S]*)\]$/);
    if (alignMatch) {
        const align = (alignMatch[1] as 'left' | 'center' | 'right') ?? 'center';
        const inner = alignMatch[2].trim();

        // Check if inner is #figure
        if (inner.startsWith('#figure(')) {
            return parseFigureInner(inner, align, trimmed);
        }
    }

    // Also try matching raw #figure if align is omitted or implied
    if (trimmed.startsWith('#figure(')) {
        return parseFigureInner(trimmed, 'center', trimmed);
    }

    // Fallback to legacy #align(..., image(...))
    const match = trimmed.match(/#align\(\s*(left|center|right)\s*,\s*image\("([^"]+)"(?:,\s*width:\s*([^,}]+))?(?:,\s*height:\s*([^)]+))?\)\)/);
    if (match) {
        return {
            id: generateId(),
            type: 'image',
            content: match[2],
            align: (match[1] as 'left' | 'center' | 'right') ?? 'center',
            width: match[3]?.trim() || '50%',
            height: 'auto',
        };
    }

    return null;
}

function parseFigureInner(inner: string, align: 'left' | 'center' | 'right', originalText: string): TypstBlock | null {
    // Basic regex extraction for figure content
    // This is not a full parser, assuming standard generation format
    // #figure(image("PATH", width: W, height: H), caption: [...], ...)

    // Extract image part: image("...", ...)
    const imgMatch = inner.match(/image\("([^"]+)"/);
    if (!imgMatch) return null;
    const imageUrl = imgMatch[1];

    // Extract width
    const widthMatch = inner.match(/width:\s*([^,)]+)/);
    const width = widthMatch ? widthMatch[1].trim() : '50%';

    // Extract height
    const heightMatch = inner.match(/height:\s*([^,)]+)/);
    const height = heightMatch ? heightMatch[1].trim() : 'auto';

    // Extract caption: caption: [...]
    // This is tricky with nested brackets. We assume standard generation: caption: [#text(...)[]] or caption: [text]
    // We'll look for `caption: [` and take until matching `]`.
    // Since we don't have a balanced bracket parser util here, we might need a simple one or regex assumption.
    // Generated: caption: [#text(font: "SimSun")[My Caption]]

    let caption = '';
    let captionFont = undefined;

    const capStart = inner.indexOf('caption: [');
    if (capStart !== -1) {
        // Simple balanced bracket finding
        let depth = 0;
        let capContent = '';
        for (let i = capStart + 9; i < inner.length; i++) { // "caption: " is 9 chars? No, "caption: [" is 10 chars
            const c = inner[i]; // Start after '['
            if (c === '[') depth++;
            else if (c === ']') {
                if (depth === 0) break;
                depth--;
            }
            capContent += c;
        }

        // Parse caption content for font: #text(font: "SimSun")[RawCaption]
        const fontMatch = capContent.match(/#text\(font:\s*"([^"]+)"\)\s*\[([\s\S]*)\]/);
        if (fontMatch) {
            captionFont = fontMatch[1];
            caption = fontMatch[2]; // Inner text
        } else {
            // Raw text or cleanup
            caption = capContent;
        }
    }

    // Attempt to restore LF_IMAGE marker if it exists in the original text (serialized at end)
    const markerMatch = originalText.match(/\/\*LF_IMAGE:([A-Za-z0-9+/=]+)\*\//);
    let extraData = {};
    if (markerMatch) {
        try {
            extraData = JSON.parse(base64DecodeUtf8(markerMatch[1]));
        } catch { }
    }

    return {
        id: generateId(),
        type: 'image',
        content: imageUrl,
        align,
        width,
        height,
        caption,
        captionFont,
        ...extraData // This restores placeholders etc if they are in the marker
    };

    return null;
}
