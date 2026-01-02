import { TypstBlock, PersistedTablePayload } from './types';
import { base64DecodeUtf8, generateId } from './utils';

export function parseTableFromMarker(trimmed: string): TypstBlock | null {
    const m = trimmed.match(/\/\*LF_TABLE:([A-Za-z0-9+/=]+)\*\//);
    if (!m) return null;

    // Match both old format block(width: ...) and new format #block(width: ...)
    const widthMatch = trimmed.match(/#?block\(\s*width\s*:\s*([^\)\]]+)/);
    const widthFromCode = widthMatch?.[1]?.trim();

    try {
        const payload = JSON.parse(base64DecodeUtf8(m[1])) as PersistedTablePayload;
        if (payload && Array.isArray(payload.cells)) {
            return {
                id: generateId(),
                type: 'table',
                content: JSON.stringify(payload),
                width: widthFromCode || '50%',
            };
        }
    } catch {
        // ignore
    }

    return null;
}
