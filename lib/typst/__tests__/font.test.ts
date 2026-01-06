import { describe, it, expect } from 'vitest';
import { serializeParagraph, serializeHeading, serializeList } from '../serializers/text';
import { typstToBlocks } from '../parse';
import { TypstBlock } from '../types';

describe('Font Serialization', () => {
    it('serializes paragraph with specific font', () => {
        const block: TypstBlock = {
            id: '1',
            type: 'paragraph',
            content: 'Hello World',
            font: 'SimHei'
        };
        const result = serializeParagraph(block);
        expect(result).toBe('#text(font: "SimHei")[Hello World]');
    });

    it('serializes paragraph with multiple attributes (font + size)', () => {
        const block: TypstBlock = {
            id: '1',
            type: 'paragraph',
            content: 'Hello World',
            font: 'KaiTi',
            fontSize: '12pt'
        };
        // The order depends on implementation in serializers/text.ts
        // args.push(`font: "${font}"`);
        // if (size) args.push(`size: ${size}`);
        // join(', ')
        const result = serializeParagraph(block);
        expect(result).toBe('#text(font: "KaiTi", size: 12pt)[Hello World]');
    });

    it('serializes paragraph with default font (SimSun) - usually implies no wrapper if logic says so, but let\'s check impl', () => {
        // Looking at serializers/text.ts:
        // const font = (block.font ?? 'SimSun').trim();
        // if (font || size) { ... }
        // Wait, if it is SimSun, does it wrap?
        // Code: if (font || size) ... args.push.
        // If block.font is undefined, font='SimSun'.
        // So it always wraps?
        // Let's re-read text.ts
        // const font = (block.font ?? 'SimSun').trim();
        // if (font || size) { ... }
        // It seems it wraps even if it is SimSun?
        // Wait, `typstToBlocks` roundtrip usually expects clean output.
        // Let's check `roundtrip.test.ts` failure or success.
        // The `serializeParagraph` implementation:
        // const font = (block.font ?? 'SimSun').trim();
        // if (font || size) { ... }
        // So yes, it seems to wrap always if we pass it? 
        // Actually, if we pass nothing, font is 'SimSun'.
        // Then `if (font ...)` is true.
        // So it wraps `#text(font: "SimSun")[...]`?
        // Let's verify behavior.
        
        const block: TypstBlock = {
            id: '1',
            type: 'paragraph',
            content: 'Default Font'
            // font undefined -> "SimSun"
        };
        const result = serializeParagraph(block);
        // Based on code reading: it should wrap.
        expect(result).toBe('#text(font: "SimSun")[Default Font]');
    });

    it('serializes heading with font', () => {
        const block: TypstBlock = {
            id: '1',
            type: 'heading',
            content: 'My Title',
            level: 1,
            font: 'SimHei'
        };
        const result = serializeHeading(block);
        expect(result).toBe('= #text(font: "SimHei")[My Title]');
    });

    it('serializes list with font', () => {
        const block: TypstBlock = {
            id: '1',
            type: 'list',
            content: '- Item 1',
            font: 'KaiTi'
        };
        const result = serializeList(block);
        // List serialization wraps the whole list expr
        expect(result).toBe('#text(font: "KaiTi")[#list(tight: true)[Item 1]]');
    });
});

describe('Font Parsing (typstToBlocks)', () => {
    it('parses paragraph with font wrapper', () => {
        const code = '#text(font: "SimHei")[Hello World]';
        const blocks = typstToBlocks(code);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('paragraph');
        expect(blocks[0].content).toBe('Hello World');
        expect(blocks[0].font).toBe('SimHei');
    });

    it('parses paragraph with default font wrapper', () => {
        const code = '#text(font: "SimSun")[Hello World]';
        const blocks = typstToBlocks(code);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('paragraph');
        expect(blocks[0].font).toBe('SimSun');
    });

    it('parses paragraph with size and font', () => {
        const code = '#text(font: "KaiTi", size: 14pt)[Big Text]';
        const blocks = typstToBlocks(code);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].content).toBe('Big Text');
        expect(blocks[0].font).toBe('KaiTi');
        expect(blocks[0].fontSize).toBe('14pt');
    });

    it('parses nested alignment and font', () => {
        // Nesting order: align wraps text or text wraps align?
        // Serializer: align(text(...))
        const code = '#align(center)[#text(font: "SimHei")[Centered Text]]';
        const blocks = typstToBlocks(code);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].content).toBe('Centered Text');
        expect(blocks[0].align).toBe('center');
        expect(blocks[0].font).toBe('SimHei');
    });
    
    it('parses heading with inner text font wrapper', () => {
        const code = '= #text(font: "SimHei")[Heading Title]';
        const blocks = typstToBlocks(code);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('heading');
        expect(blocks[0].content).toBe('Heading Title');
        expect(blocks[0].font).toBe('SimHei');
    });

    it('parses list with outer text font wrapper', () => {
        // Serializer produces: #text(font: "KaiTi")[#list(...)]
        const code = '#text(font: "KaiTi")[#list(tight: true)[Item 1]]';
        const blocks = typstToBlocks(code);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('list');
        // List content should be clean
        expect(blocks[0].content).toContain('Item 1');
        expect(blocks[0].font).toBe('KaiTi');
    });
});
