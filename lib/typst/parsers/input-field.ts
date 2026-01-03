import { TypstBlock } from '../types';
import { base64DecodeUtf8, generateId } from '../utils';

export function parseInputFieldBlock(trimmed: string): TypstBlock | null {
    const inputMarker = trimmed.match(/\/\*LF_INPUT:([A-Za-z0-9+/=]+)\*\//);
    if (!inputMarker) return null;

    try {
        const payload = JSON.parse(base64DecodeUtf8(inputMarker[1]));
        // Support both old single-line format and new multi-line format
        const inputLines = payload.lines || (payload.label !== undefined || payload.value !== undefined
            ? [{ label: payload.label || '', value: payload.value || '' }]
            : [{ label: '', value: '' }]);

        return {
            id: generateId(),
            type: 'input_field',
            content: '',
            inputLines,
            inputSeparator: payload.separator ?? '：',
            inputShowUnderline: payload.showUnderline !== false,
            inputWidth: payload.width || '50%',
            inputAlign: payload.align || 'center',
            inputFontSize: payload.fontSize || '',
            inputFontFamily: payload.fontFamily || '',
        };
    } catch {
        return null;
    }
}
