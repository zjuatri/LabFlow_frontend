import { TypstBlock } from '../types';
import { LF_COMPOSITE_ROW_MARKER, base64DecodeUtf8, generateId } from '../utils';
import { typstToBlocks } from '../parse';
import { BlockParser } from '../core/block-parser';

export class CompositeRowParser implements BlockParser {
    parse(lines: string[], index: number): { block: TypstBlock; endIndex: number } | null {
        const trimmed = lines[index].trim();
        // Detect LF_COMPOSITE_ROW marker
        if (!trimmed.includes('/*LF_COMPOSITE_ROW:')) return null;

        const block = this.parseCompositeRowBlock(trimmed);
        if (block) {
            return { block, endIndex: index + 1 };
        }
        return null;
    }

    private parseCompositeRowBlock(trimmed: string): TypstBlock | null {
        const compositeRowMarker = trimmed.match(/\/\*LF_COMPOSITE_ROW:([A-Za-z0-9+/=]+)\*\//);
        if (!compositeRowMarker) return null;

        try {
            const payload = JSON.parse(base64DecodeUtf8(compositeRowMarker[1]));

            const beforeMarker = trimmed.slice(0, trimmed.indexOf(LF_COMPOSITE_ROW_MARKER));
            const childContents: string[] = [];

            // Check if it's the box format (space-between/around/evenly)
            const isBoxFormat = beforeMarker.startsWith('#box(width: 100%)');

            if (isBoxFormat) {
                // Extract content inside outer box: #box(width: 100%)[...]
                const outerMatch = beforeMarker.match(/^#box\(width:\s*100%\)\[(.*)\]$/);
                if (outerMatch) {
                    const innerContent = outerMatch[1];
                    // Find all #box()[...] patterns
                    const boxPattern = /#box\(\)\[/g;
                    let match;
                    while ((match = boxPattern.exec(innerContent)) !== null) {
                        const startIdx = match.index + match[0].length;
                        // Find matching closing bracket
                        let depth = 1;
                        let endIdx = startIdx;
                        for (let k = startIdx; k < innerContent.length && depth > 0; k++) {
                            if (innerContent[k] === '[') depth++;
                            else if (innerContent[k] === ']') depth--;
                            if (depth === 0) endIdx = k;
                        }
                        childContents.push(innerContent.slice(startIdx, endIdx));
                    }
                }
            } else {
                // Grid format: #align(left|center|right)[#grid(columns: ..., [child1], [child2], ...)]
                // Or just: #grid(columns: ..., [child1], [child2], ...)

                let gridContent = beforeMarker;
                const alignMatch = beforeMarker.match(/^#align\((left|center|right)\)\[(.+)\]$/);
                if (alignMatch) {
                    gridContent = alignMatch[2];
                }

                const gridMatch = gridContent.match(/#grid\([^[]+/);
                const gridParamsEnd = gridMatch ? gridMatch[0].length : 0;
                const childPart = gridContent.slice(gridParamsEnd);

                let depth = 0;
                let start = -1;
                for (let j = 0; j < childPart.length; j++) {
                    const ch = childPart[j];
                    if (ch === '[') {
                        if (depth === 0) start = j + 1;
                        depth++;
                    } else if (ch === ']') {
                        depth--;
                        if (depth === 0 && start >= 0) {
                            childContents.push(childPart.slice(start, j));
                            start = -1;
                        }
                    }
                }
            }

            const children: TypstBlock[] = [];
            for (const childCode of childContents) {
                const parsedChildren = typstToBlocks(childCode.trim());
                children.push(...parsedChildren);
            }

            return {
                id: generateId(),
                type: 'composite_row',
                content: '',
                children,
                compositeJustify: payload.justify || 'space-between',
                compositeGap: payload.gap || '8pt',
                compositeVerticalAlign: payload.verticalAlign || 'top',
            };
        } catch {
            return null;
        }
    }
}

