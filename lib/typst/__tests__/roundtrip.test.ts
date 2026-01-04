import { describe, it, expect } from 'vitest';
import { typstToBlocks } from '../parse';
import { blocksToTypst } from '../serialize';
import { TypstBlock } from '../types';

// Helper to remove IDs and undefined values for comparison
function cleanIds<T>(obj: T): T {
    if (Array.isArray(obj)) {
        return obj.map(cleanIds) as T;
    } else if (obj !== null && typeof obj === 'object') {
        const newObj: Record<string, unknown> = {};
        for (const key in obj) {
            if (key === 'id') continue;
            const val = obj[key];
            if (val !== undefined) {
                // Special handling for content which might be a JSON string (for tables)
                // We want to compare the object, not the string, to avoid formatting differences
                if (key === 'content' && typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
                    try {
                        newObj[key] = cleanIds(JSON.parse(val));
                    } catch {
                        newObj[key] = cleanIds(val);
                    }
                } else {
                    newObj[key] = cleanIds(val);
                }
            }
        }
        return newObj as unknown as T;
    }
    return obj;
}

// Helper to check roundtrip: Block A -> Typst -> Block B. A should roughly equal B.
function assertRoundtrip(blocks: TypstBlock[]) {
    const serialized = blocksToTypst(blocks);
    const parsed = typstToBlocks(serialized);

    // Normalize IDs
    const cleanOriginal = cleanIds(blocks);
    const cleanParsed = cleanIds(parsed);

    try {
        // We use toMatchObject because the serializer might add default values (e.g. font: 'SimSun')
        // that were not present in the original block. We only care that the original data is preserved.
        expect(cleanParsed).toMatchObject(cleanOriginal);
    } catch (e) {
        console.log('Original:', JSON.stringify(cleanOriginal, null, 2));
        console.log('Parsed:', JSON.stringify(cleanParsed, null, 2));
        throw e;
    }
}

describe('Typst Parser/Serializer Roundtrip', () => {
    it('handles headings', () => {
        const blocks: TypstBlock[] = [
            { id: '1', type: 'heading', content: 'Heading 1', level: 1 },
            { id: '2', type: 'heading', content: 'Heading 2', level: 2 },
        ];
        assertRoundtrip(blocks);
    });

    it('handles paragraphs', () => {
        const blocks: TypstBlock[] = [
            { id: '1', type: 'paragraph', content: 'Hello World' },
            { id: '2', type: 'paragraph', content: 'Multiple\nLine\nParagraph' },
        ];
        assertRoundtrip(blocks);
    });

    it('handles lists', () => {
        const blocks: TypstBlock[] = [
            { id: '1', type: 'list', content: '- Item 1\n- Item 2' },
            { id: '2', type: 'list', content: '1. Ordered 1\n2. Ordered 2' },
        ];
        assertRoundtrip(blocks);
    });

    it('handles code blocks', () => {
        const blocks: TypstBlock[] = [
            {
                id: '1',
                type: 'code',
                content: 'print("Hello")',
                language: 'python'
            }
        ];
        assertRoundtrip(blocks);
    });

    it('handles math blocks', () => {
        const blocks: TypstBlock[] = [
            {
                id: '1',
                type: 'math',
                content: 'x^2 + y^2 = 1',
                mathTypst: 'x^2 + y^2 = 1',
                mathFormat: 'typst'
            }
        ];
        // Note: Math parser might add extra fields (mathLatex etc.), so loose comparison might be needed 
        // if serialize -> parse cycle enriches data.
        // For now, let's see. 
        // The parser adds matching latex if available in payload.
        // Serializer persists everything.
        assertRoundtrip(blocks);
    });

    it('handles basic table (marker based)', () => {
        // Construct a block that matches the internal structure
        // This is tricky because content is JSON stringified payload.
        const payload = {
            rows: 2, cols: 2,
            cells: [[{ content: "A" }, { content: "B" }], [{ content: "1" }, { content: "2" }]]
        };

        const blocks: TypstBlock[] = [
            {
                id: '1',
                type: 'table',
                content: JSON.stringify(payload),
                width: '50%'
            }
        ];
        assertRoundtrip(blocks);
    });

    it('handles images', () => {
        const blocks: TypstBlock[] = [
            {
                id: '1',
                type: 'image',
                content: 'test.png',
                width: '50%',
                caption: 'Test Caption'
            }
        ];
        assertRoundtrip(blocks);
    });
    it('handles empty paragraphs (persisted)', () => {
        const blocks: TypstBlock[] = [
            { id: '1', type: 'paragraph', content: 'Par 1' },
            { id: '2', type: 'paragraph', content: '' },
            { id: '3', type: 'paragraph', content: 'Par 2' },
        ];
        assertRoundtrip(blocks);
    });
});
