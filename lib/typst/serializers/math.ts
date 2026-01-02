import { TypstBlock, PersistedMathPayload } from '../types';
import { base64EncodeUtf8, sanitizeTypstMathSegment, LF_MATH_MARKER } from '../utils';

export function serializeMath(block: TypstBlock): string {
    const payload: PersistedMathPayload = {
        format: block.mathFormat ?? 'latex',
        latex: (block.mathLatex ?? '').trim(),
        typst: (block.mathTypst ?? block.content ?? '').trim(),
        lines: block.mathLines?.map((l) => ({ latex: l.latex, typst: l.typst })) ?? undefined,
        brace: block.mathBrace ?? undefined,
    };
    const encoded = `${LF_MATH_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;

    if (block.mathLines && block.mathLines.length > 0) {
        const lines = block.mathLines.map(line => line.typst.trim()).filter(l => l);
        if (lines.length === 0) {
            return '';
        }
        if (block.mathBrace) {
            return `$ cases(${lines.join(', ')}) $${encoded}`;
        } else {
            return `$ ${lines.join(' \\ ')} $${encoded}`;
        }
    }

    return `$ ${sanitizeTypstMathSegment((block.mathTypst ?? block.content).trim())} $${encoded}`;
}
