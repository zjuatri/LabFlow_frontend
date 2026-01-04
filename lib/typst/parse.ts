/**
 * @file parse.ts
 * @description Main entry point for parsing Typst source code into blocks.
 * Delegates actual parsing to modular files in ./parsers/
 */

import { TypstBlock } from './types';
import { cleanupMalformedTypst } from './cleanup';
import { unwrapBlockDecorators } from './utils';
import { globalRegistry } from './core/parser-registry';

// Note: Specific parser imports are now handled in parser-registry.ts
// We keep types import.

export { typstToBlocks };

/**
 * 将 Typst 源代码解析为块列表
 */
function typstToBlocks(code: string): TypstBlock[] {
  // Pre-process to fix malformed patterns from older serialization bugs
  const cleaned = cleanupMalformedTypst(code);
  if (!cleaned.trim()) return [];

  const blocks: TypstBlock[] = [];
  const lines = cleaned.split('\n');
  const parsers = globalRegistry.getParsers();

  let i = 0;
  while (i < lines.length) {
    // Skip empty lines at top level? 
    // ParagraphParser handles empty lines by stopping.
    // However, if we are at top level and see empty line, no parser (except maybe ParagraphParser?) picks it up?
    // ParagraphParser consumes until empty line. 
    // If we start at an empty line, ParagraphParser returns null (because it checks `i > currentIndex` for breaks, but initially content empty?).
    // Actually `ParagraphParser` returns null if contentLines is empty.
    // So empty lines are skipped.
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      i++;
      continue;
    }

    // Check built-in markers that might not be handled by parsers?
    // LF_DOC_MARKER is skipped in original loop.
    if (trimmed.startsWith('/*LF_DOC_Settings:')) {
      i++;
      continue;
    }

    let match = false;
    for (const parser of parsers) {
      const result = parser.parse(lines, i);
      if (result) {
        if (result.block) {
          blocks.push(result.block);
        }
        i = result.endIndex;
        match = true;
        break;
      }
    }

    if (!match) {
      // If no parser matched (should rarely happen given ParagraphParser is catch-all),
      // we advance index to avoid infinite loop.
      // ParagraphParser catches "valid text".
      // If line is NOT valid text (e.g. some obscure Typst we don't handle), we skip it.
      // OR we treat it as raw text paragraph?
      // ParagraphParser is pretty permissible, but it rejects lines starting with `=` etc.
      // If matching failed, it means it looked like a block but failed specific parsing?
      // e.g. `#image(...)` but malformed? MediaParser returns null. 
      // Then ParagraphParser sees `#image` and rejects it.
      // So we skip the line.
      console.warn('Skipping unparsed line:', lines[i]);
      i++;
    }
  }

  // Final pass to unwrap decorators (align, font, etc.)
  return blocks.map(b => {
    if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'list') {
      // Note: list type might also need unwrapping if it was wrapped in #text?
      // ParseInlineEnumOrList handles local wrapper. 
      // Logic in original parse.ts applied to 'paragraph' and 'heading'.
      const unwrapped = unwrapBlockDecorators(b.content);
      return {
        ...b,
        content: unwrapped.content,
        align: unwrapped.align ?? b.align,
        fontSize: unwrapped.fontSize ?? b.fontSize,
        font: unwrapped.font ?? b.font,
      };
    }
    return b;
  });
}

