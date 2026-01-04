
import { TypstBlock } from '../types';
import { generateId } from '../utils';
import { BlockParser } from '../core/block-parser';

export class HeadingParser implements BlockParser {
    parse(lines: string[], index: number): { block: TypstBlock; endIndex: number } | null {
        const trimmed = lines[index].trim();
        if (!trimmed.startsWith('=')) return null;

        const match = trimmed.match(/^(=+)\s+(.+)$/);
        if (match) {
            return {
                block: {
                    id: generateId(),
                    type: 'heading',
                    content: match[2],
                    level: match[1].length,
                },
                endIndex: index + 1
            };
        }
        return null;
    }
}
