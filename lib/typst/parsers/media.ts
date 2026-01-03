import { TypstBlock } from '../types';
import { base64DecodeUtf8, generateId } from '../utils';

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
    // Handle placeholder block format (may be wrapped in #align):
    // - Old: #block(...)[...]/*LF_IMAGE:...*/
    // - New: #align(...)[#block(...)[...]]/*LF_IMAGE:...*/
    const placeholderMatch = trimmed.match(/^(?:#align\([^)]*\)\[)?#block\(.*\)\[.*\]\]?(?:\/\*LF_IMAGE:([A-Za-z0-9+/=]+)\*\/)$/);
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

    // Handle #figure(image(...), caption: [...], supplement: "...") format
    // Example: #figure(image("/static/.../xxx.jpg", width: 50%, height: auto), caption: [标题], supplement: "图")
    // Also handle #align(...)[#figure(...)]
    // Note: caption may contain nested brackets like [#text(font: "SimSun")[内容]], so we use fallback parser below
    const figureMatch = trimmed.match(
        /^(?:#align\(\s*(left|center|right)\s*\)\s*\[\s*)?#figure\(\s*image\(\s*"([^"]+)"(?:\s*,\s*width\s*:\s*([^,)]+))?(?:\s*,\s*height\s*:\s*([^,)]+))?\s*\)/
    );
    if (figureMatch && trimmed.includes('#figure(') && trimmed.includes('image(')) {
        // Use the fallback parser which handles nested brackets properly
        // This block intentionally falls through to the fallback below
    } else if (figureMatch) {
        const alignFromOuter = figureMatch[1] as 'left' | 'center' | 'right' | undefined;
        const imagePath = figureMatch[2];
        const widthRaw = figureMatch[3]?.trim();

        return {
            id: generateId(),
            type: 'image',
            content: imagePath,
            align: alignFromOuter ?? 'center',
            width: widthRaw || '50%',
            height: 'auto',
            caption: '',
        };
    }

    // Fallback: more relaxed figure parsing for edge cases
    // Match #figure(image("path"...) with any trailing content
    if (trimmed.includes('#figure(') && trimmed.includes('image(')) {
        // Extract image path
        const pathMatch = trimmed.match(/image\(\s*"([^"]+)"/);
        if (pathMatch) {
            const imagePath = pathMatch[1];
            
            // Extract width
            const widthMatch = trimmed.match(/width\s*:\s*([^,)\s]+)/);
            const width = widthMatch?.[1]?.trim() || '50%';
            
            // Extract caption using balanced bracket matching
            let caption = '';
            let captionFont: string | undefined = undefined;
            const capStart = trimmed.indexOf('caption: [');
            if (capStart !== -1) {
                let depth = 0;
                let capFull = '';
                for (let i = capStart + 9; i < trimmed.length; i++) {
                    const c = trimmed[i];
                    if (c === '[') depth++;
                    else if (c === ']') depth--;
                    capFull += c;
                    if (depth === 0) break;
                }
                // Strip outer brackets
                let capContent = capFull;
                if (capFull.startsWith('[') && capFull.endsWith(']')) {
                    capContent = capFull.slice(1, -1);
                }
                // Recursively strip #text(font:...) wrappers
                while (capContent.match(/^#text\(font:\s*"([^"]+)"\)\s*\[/)) {
                    const prefixMatch = capContent.match(/^#text\(font:\s*"([^"]+)"\)\s*\[/);
                    if (!prefixMatch) break;
                    captionFont = prefixMatch[1];
                    const afterPrefix = capContent.slice(prefixMatch[0].length);
                    let d = 1, end = -1;
                    for (let i = 0; i < afterPrefix.length; i++) {
                        if (afterPrefix[i] === '[') d++;
                        else if (afterPrefix[i] === ']') { d--; if (d === 0) { end = i; break; } }
                    }
                    capContent = end !== -1 ? afterPrefix.slice(0, end) : afterPrefix;
                }
                caption = capContent;
            }
            
            // Extract align from outer wrapper if present
            const alignMatch = trimmed.match(/^#align\(\s*(left|center|right)\s*\)/);
            const align = (alignMatch?.[1] as 'left' | 'center' | 'right') ?? 'center';

            return {
                id: generateId(),
                type: 'image',
                content: imagePath,
                align,
                width,
                height: 'auto',
                caption,
                captionFont,
            };
        }
    }

    return null;
}
