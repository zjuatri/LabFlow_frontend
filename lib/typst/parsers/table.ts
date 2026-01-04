import { TypstBlock, PersistedTablePayload } from '../types';
import { base64DecodeUtf8, generateId } from '../utils';
import { BlockParser } from '../core/block-parser';

export class TableParser implements BlockParser {
    parse(lines: string[], index: number): { block: TypstBlock; endIndex: number } | null {
        let currentIndex = index;
        let trimmed = lines[currentIndex].trim();

        // Optional: consume preceding caption/align line if it looks like one and next line is table
        // This prevents "Skipping unparsed line" for the caption.
        // Caption usually: #align(center)[...]
        if (trimmed.startsWith('#align(center)[') && (currentIndex + 1 < lines.length)) {
            const nextTrimmed = lines[currentIndex + 1].trim();
            if (nextTrimmed.includes('/*LF_TABLE:')) {
                // Consume this line and move to next
                currentIndex++;
                trimmed = nextTrimmed;
            }
        }

        // Check if it has the table marker
        if (!trimmed.includes('/*LF_TABLE:')) return null;

        const block = this.parseTableFromMarker(trimmed);
        if (block) {
            return { block, endIndex: currentIndex + 1 };
        }
        return null;
    }

    private parseTableFromMarker(trimmed: string): TypstBlock | null {
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
}

