
import { TypstBlock } from '../types';
import { generateId } from '../utils';
import { BlockParser } from '../core/block-parser';

export class CodeParser implements BlockParser {
    parse(lines: string[], index: number): { block: TypstBlock; endIndex: number } | null {
        const firstLine = lines[index].replace(/\r$/, '');
        const trimmed = firstLine.trim();

        if (!trimmed.startsWith('```')) return null;

        const language = trimmed.substring(3).trim() || 'python';
        const contentLines: string[] = [];
        let i = index + 1;

        // Single line code block case: ```python print("hi") ``` ? 
        // Typst usually separates valid code block with newlines if it's block-level.
        // Assuming block level iteration.

        // Actually, if the line ends with ``` it might be a single line block, 
        // but the current parser logic (in parse.ts) assumed multi-line state machine.
        // Let's handle generic case.


        // Let's implement the loop to find the closer
        for (; i < lines.length; i++) {
            const line = lines[i].replace(/\r$/, '');
            const lineTrimmed = line.trim();
            if (lineTrimmed.startsWith('```')) {
                // End of block
                return {
                    block: {
                        id: generateId(),
                        type: 'code',
                        content: contentLines.join('\n'),
                        language: language,
                    },
                    endIndex: i + 1
                };
            }
            contentLines.push(line);
        }

        // If we run out of lines without closing, return what we have (or fail pattern?)
        // The original parser would just consume until end.
        return {
            block: {
                id: generateId(),
                type: 'code',
                content: contentLines.join('\n'),
                language: language,
            },
            endIndex: i
        };
    }
}
