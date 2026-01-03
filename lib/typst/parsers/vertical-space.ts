import { TypstBlock } from '../types';
import { generateId } from '../utils';

export function parseVerticalSpaceBlock(trimmed: string): TypstBlock | null {
    // Check for our marker first
    const vsMarker = trimmed.match(/\/\*LF_VS:([A-Za-z0-9+/=]+)\*\//);
    if (vsMarker) {
        // It's a managed vertical space block
        try {
            // We might have metadata but vertical_space relies on global settings now.
            // Still parse content (height)
            let height = '1em';
            const vMatch = trimmed.match(/^#v\((.+)\)/);
            const blockMatch = trimmed.match(/^#block\(height:\s*([^,]+)/);
            if (vMatch) height = vMatch[1].trim();
            else if (blockMatch) height = blockMatch[1].trim();

            return {
                id: generateId(),
                type: 'vertical_space',
                content: height,
            };
        } catch {
            // Fallback
        }
    } else if (trimmed.startsWith('#v(')) {
        // Legacy or manual #v(...) without marker
        const match = trimmed.match(/^#v\((.+)\)$/);
        if (match) {
            return {
                id: generateId(),
                type: 'vertical_space',
                content: match[1],
            };
        }
    } else if (trimmed.startsWith('#block(height:')) {
        // Block-based vertical space (new format for consistent rendering)
        const match = trimmed.match(/^#block\(height:\s*([^,]+)/);
        if (match) {
            return {
                id: generateId(),
                type: 'vertical_space',
                content: match[1].trim(),
            };
        }
    }
    return null;
}
