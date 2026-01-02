import { TypstBlock, PersistedMathPayload } from './types';
import { base64DecodeUtf8, generateId } from './utils';
import { typstToLatexMath } from '../math-convert';

export function parseMathBlock(trimmed: string): TypstBlock | null {
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

    return {
        id: generateId(),
        type: 'math',
        content: mathTypst,
        mathFormat: payload?.format ?? 'latex',
        mathTypst,
        mathLatex,
        mathLines: payload?.lines,
        mathBrace: payload?.brace,
    };
}
