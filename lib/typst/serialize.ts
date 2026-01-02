/**
 * @file serialize.ts
 * @description Main entry point for converting blocks to Typst source code.
 * Delegates actual serialization to modular files in ./serializers/
 */

import { TypstBlock, DocumentSettings, defaultDocumentSettings } from './types';

// Import specialized serializers
import { serializeCover, serializeCompositeRow, serializeVerticalSpace } from './serializers/layout';
import { serializeHeading, serializeParagraph, serializeList } from './serializers/text';
import { serializeCode } from './serializers/code';
import { serializeMath } from './serializers/math';
import { serializeImage, serializeChart } from './serializers/media';
import { serializeTable } from './serializers/table';
import { serializeInputField } from './serializers/form';

// Re-export preamble utilities for consumers
export { CJK_FONTS_NEED_FAKE_STYLE, generateCjkStylePreamble } from './serializers/preamble';

/**
 * 将块列表转换为 Typst 源代码
 */
export function blocksToTypst(blocks: TypstBlock[], opts?: { settings?: DocumentSettings, target?: 'storage' | 'preview' | 'export' }): string {
  const settings = opts?.settings ?? defaultDocumentSettings;
  const target = opts?.target ?? 'storage';
  let tableIndex = 0;
  let imageIndex = 0;

  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'cover':
        // Pass recursively blocksToTypst as the callback to handle nested children
        out.push(serializeCover(block, opts, blocksToTypst));
        break;

      case 'heading':
        out.push(serializeHeading(block));
        break;

      case 'paragraph':
        out.push(serializeParagraph(block));
        break;

      case 'code':
        out.push(serializeCode(block));
        break;

      case 'math':
        out.push(serializeMath(block));
        break;

      case 'image': {
        // Only increment image index if the image has a caption
        const hasCaption = (block.caption ?? '').trim().length > 0;
        if (hasCaption) {
          imageIndex += 1;
        }
        out.push(serializeImage(block, hasCaption ? imageIndex : 0, settings));
        break;
      }

      case 'chart':
        out.push(serializeChart(block));
        break;

      case 'list':
        out.push(serializeList(block));
        break;

      case 'table':
        tableIndex += 1;
        out.push(serializeTable(block, tableIndex, settings));
        break;

      case 'vertical_space':
        out.push(serializeVerticalSpace(block, target, settings));
        break;

      case 'input_field':
        out.push(serializeInputField(block));
        break;

      case 'composite_row':
        // Pass recursively blocksToTypst as the callback to handle nested children
        out.push(serializeCompositeRow(block, opts, blocksToTypst));
        break;

      default:
        out.push(block.content);
        break;
    }
  }

  return out.join('\n\n');
}
