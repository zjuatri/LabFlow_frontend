import {
    DocumentSettings,
    defaultDocumentSettings,
} from './types';

export const LF_MATH_MARKER = '/*LF_MATH:';
export const LF_TABLE_MARKER = '/*LF_TABLE:';
export const LF_IMAGE_MARKER = '/*LF_IMAGE:';
export const LF_CHART_MARKER = '/*LF_CHART:';
export const LF_DOC_MARKER = '/*LF_DOC:';
export const LF_ANSWER_MARKER = '/*LF_ANSWER*/';

// Cover container markers (used to group cover elements inside a report)
export const LF_COVER_BEGIN_MARKER = '/*LF_COVER_BEGIN:';
export const LF_COVER_END_MARKER = '/*LF_COVER_END*/';

export function base64EncodeUtf8(input: string): string {
    // Browser-safe UTF-8 base64
    const utf8 = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
    );
    return btoa(utf8);
}

export function base64DecodeUtf8(input: string): string {
    const bin = atob(input);
    const percent = Array.from(bin)
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`)
        .join('');
    return decodeURIComponent(percent);
}

export function generateId(): string {
    return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function stripDocumentSettings(code: string): { code: string; settings: DocumentSettings } {
    const input = code ?? '';
    const m = input.match(/\/\*LF_DOC:([A-Za-z0-9+/=]+)\*\//);

    // Helper to strip the font size rule if present
    const stripFontSize = (c: string) => c.replace(/^\s*#set\s+text\s*\(\s*size\s*:\s*[\d.]+(?:pt|em)\s*\)\s*\n?/gm, '');

    if (!m) {
        return { code: stripFontSize(input), settings: { ...defaultDocumentSettings } };
    }

    let settings: DocumentSettings = { ...defaultDocumentSettings };
    try {
        const decoded = JSON.parse(base64DecodeUtf8(m[1])) as Partial<DocumentSettings>;
        settings = {
            tableCaptionNumbering: decoded.tableCaptionNumbering ?? true,
            imageCaptionNumbering: decoded.imageCaptionNumbering ?? true,
            imageCaptionPosition: decoded.imageCaptionPosition ?? 'below',
            verticalSpaceVisible: decoded.verticalSpaceVisible ?? false,
            fontSize: decoded.fontSize || '10.5pt',
        };
    } catch {
        settings = { ...defaultDocumentSettings };
    }

    let without = input.replace(m[0], '').replace(/^\s*\n/, '');
    without = stripFontSize(without);

    return { code: without, settings };
}

export function injectDocumentSettings(code: string, settings: DocumentSettings): string {
    const stripped = stripDocumentSettings(code).code;
    const encoded = `${LF_DOC_MARKER}${base64EncodeUtf8(JSON.stringify(settings))}*/`;
    return `${encoded}\n${stripped}`;
}

export function unwrapBlockDecorators(input: string): {
    content: string;
    align?: 'left' | 'center' | 'right';
    fontSize?: string;
    font?: string;
} {
    let current = input.trim();
    let align: 'left' | 'center' | 'right' | undefined;
    let fontSize: string | undefined;
    let font: string | undefined;

    // Safety break to prevent infinite loops (though regex matching should be safe)
    let ops = 0;
    while (ops++ < 10) {
        let changed = false;

        // Match #align(pos)[content] or #align(pos, content)
        // We use a simplified regex that assumes balanced brackets for the most common generated cases.
        // Capturing group 1: alignment, Group 2: content inside [] or ()

        // Case 1: #align(center)[ ... ]
        const alignDataMatch = current.match(/^#align\s*\(\s*(left|center|right)\s*\)\s*\[([\s\S]*)\]$/);
        if (alignDataMatch) {
            align = alignDataMatch[1] as any;
            current = alignDataMatch[2].trim();
            changed = true;
            continue;
        }

        // Case 2: #text(key: val)[ ... ]
        // We look for font or size or fill etc.
        const textMatch = current.match(/^#text\s*\(([^)]+)\)\s*\[([\s\S]*)\]$/);
        if (textMatch) {
            const args = textMatch[1];
            const inner = textMatch[2];

            // Extract size if present: size: 12pt
            const sizeM = args.match(/\bsize\s*:\s*([\d.]+(?:pt|em))/);
            if (sizeM) fontSize = sizeM[1];

            // Extract font if present: font: "SimSun"
            const fontM = args.match(/\bfont\s*:\s*"([^"]+)"/);
            if (fontM) font = fontM[1];

            current = inner.trim();
            changed = true;
            continue;
        }

        if (!changed) break;
    }

    return { content: current, align, fontSize, font };
}
