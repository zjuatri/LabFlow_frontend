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
    if (!m) return { code: input, settings: { ...defaultDocumentSettings } };

    let settings: DocumentSettings = { ...defaultDocumentSettings };
    try {
        const decoded = JSON.parse(base64DecodeUtf8(m[1])) as Partial<DocumentSettings>;
        settings = {
            tableCaptionNumbering: !!decoded.tableCaptionNumbering,
            imageCaptionNumbering: !!decoded.imageCaptionNumbering,
            imageCaptionPosition: decoded.imageCaptionPosition === 'above' ? 'above' : 'below',
        };
    } catch {
        settings = { ...defaultDocumentSettings };
    }

    const without = input.replace(m[0], '').replace(/^\s*\n/, '');
    return { code: without, settings };
}

export function injectDocumentSettings(code: string, settings: DocumentSettings): string {
    const stripped = stripDocumentSettings(code).code;
    const encoded = `${LF_DOC_MARKER}${base64EncodeUtf8(JSON.stringify(settings))}*/`;
    return `${encoded}\n${stripped}`;
}
