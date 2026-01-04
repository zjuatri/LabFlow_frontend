import { TypstBlock } from '../types';
import { LF_COVER_BEGIN_MARKER, LF_COVER_END_MARKER, base64DecodeUtf8, generateId } from '../utils';
import { typstToBlocks } from '../parse';
import { BlockParser } from '../core/block-parser';

export class CoverParser implements BlockParser {
    parse(lines: string[], index: number): { block: TypstBlock; endIndex: number } | null {
        const line = lines[index].trim();
        if (!line.startsWith(LF_COVER_BEGIN_MARKER)) return null;

        const blockWrapper = this.parseCoverBlock(lines, index);
        if (blockWrapper) {
            return blockWrapper;
        }
        return null;
    }

    private parseCoverBlock(
        lines: string[],
        startIndex: number
    ): { block: TypstBlock; endIndex: number } | null {
        const line = lines[startIndex].trim();
        // Validation redundant but safe
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
                endIndex: endIdx + 1, // Consume the end line (and pagebreak?)
                // Wait, original logic said: `i = coverResult.endIndex; continue;`
                // loop does i++. so endIndex should be the index of the LAST consumed line.
                // My interface expects `endIndex` to be the index of the START of the NEXT block.
                // So endIndex should be k + 1 (if absorbed) or check `endIdx`.
                // Original logic returned `endIdx` which was the index of `LF_COVER_END_MARKER` OR the index of `#pagebreak`.
                // If original loop: `i = coverResult.endIndex`. Loop does `i++` -> `i` becomes `endIndex + 1`.
                // So original `endIndex` was the LAST PROCESSED line.
                // My interface `endIndex` is the NEXT START line.
                // So I should return `originalEndIndex + 1`.

                // Let's re-verify existing code.
                /*
                 i = coverResult.endIndex;
                 continue; 
                 // next loop iteration `i++` happens? 
                 // In a for loop `for (let i=0; i<lines.length; i++)`, `continue` jumps to `i++`.
                 // So `i` becomes `endIndex + 1`.
                 // Correct.
                */
                // In `parse.ts`: `const coverResult = parseCoverBlock(lines, i); ... i = coverResult.endIndex; continue;`
                // In `cover.ts`: `return { ..., endIndex: endIdx }` (where endIdx is the index of LF_COVER_END_MARKER or pagebreak).
                // So my `endIndex` (BlockParser) should be `endIdx + 1`. 
                // Wait, `k` logic: `endIdx = k`.
                // So yes, I return `endIdx + 1`.
            };
        }

        return null;
    }
}

