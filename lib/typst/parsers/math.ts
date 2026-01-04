import { TypstBlock, PersistedMathPayload } from '../types';
import { base64DecodeUtf8, generateId } from '../utils';
import { typstToLatexMath } from '../../math-convert';
import { BlockParser } from '../core/block-parser';

export class MathParser implements BlockParser {
    parse(lines: string[], index: number): { block: TypstBlock; endIndex: number } | null {
        const trimmed = lines[index].trim();
        if (!trimmed.startsWith('$')) return null;

        const m = trimmed.match(/^\$\s*([\s\S]*?)\s*\$(?:\/\*LF_MATH:([A-Za-z0-9+/=]+)\*\/)?$/);
        if (!m) return null;

        const typstMath = (m[1] ?? '').trim();
        const payloadB64 = m[2];

        let payload: PersistedMathPayload | null = null;
        if (payloadB64) {
            try {
                payload = JSON.parse(base64DecodeUtf8(payloadB64)) as PersistedMathPayload;
            } catch {
                payload = null;
            }
        }

        const mathTypst = (payload?.typst ?? typstMath).trim();
        const mathLatex = (payload?.latex ?? '').trim() || typstToLatexMath(mathTypst);

        const block: TypstBlock = {
            id: generateId(),
            type: 'math',
            content: mathTypst,
            mathFormat: payload?.format ?? 'latex',
            mathTypst,
            mathLatex,
            mathLines: payload?.lines,
            mathBrace: payload?.brace,
        };

        return { block, endIndex: index + 1 };
    }
}

// Keep the function for verification/legacy if needed, or remove it.
// For now, I'm replacing it with the class. The function parseMathBlock is removed.

