import { TypstBlock } from '../types';
import { LF_COVER_BEGIN_MARKER, LF_COVER_END_MARKER, base64DecodeUtf8, generateId } from '../utils';
import { typstToBlocks } from '../parse';

export function parseCoverBlock(
    lines: string[],
    startIndex: number
): { block: TypstBlock; endIndex: number } | null {
    const line = lines[startIndex].trim();
    if (!line.startsWith(LF_COVER_BEGIN_MARKER)) return null;

    const m = line.match(/\/\*LF_COVER_BEGIN:([A-Za-z0-9+/=]+)\*\//);
    if (!m) return null;

    let fixedOnePage = false;
    try {
        const payload = JSON.parse(base64DecodeUtf8(m[1])) as any;
        fixedOnePage = !!payload?.fixedOnePage;
    } catch {
        fixedOnePage = false;
    }

    let endIdx = -1;
    for (let j = startIndex + 1; j < lines.length; j++) {
        const t = lines[j].replace(/\r$/, '').trim();
        if (t === LF_COVER_END_MARKER) {
            endIdx = j;
            break;
        }
    }

    if (endIdx !== -1) {
        const innerCode = lines.slice(startIndex + 1, endIdx).join('\n');
        const children = innerCode.trim() ? typstToBlocks(innerCode) : [];

        // Absorb an immediate trailing #pagebreak() as fixedOnePage
        let k = endIdx + 1;
        while (k < lines.length && lines[k].replace(/\r$/, '').trim() === '') k++;
        if (k < lines.length) {
            const after = lines[k].replace(/\r$/, '').trim();
            if (/^#pagebreak\(\s*\)\s*$/.test(after)) {
                fixedOnePage = true;
                endIdx = k;
            }
        }

        return {
            block: {
                id: generateId(),
                type: 'cover',
                content: '',
                children,
                coverFixedOnePage: fixedOnePage,
                uiCollapsed: true,
            },
            endIndex: endIdx,
        };
    }

    return null;
}
