/**
 * @file parse.ts
 * @description Main entry point for parsing Typst source code into blocks.
 * Delegates actual parsing to modular files in ./parsers/
 */

import { TypstBlock } from './types';
import {
  LF_TABLE_MARKER, LF_IMAGE_MARKER, LF_CHART_MARKER, LF_DOC_MARKER,
  generateId,
  defaultParagraphLeadingEm, inferLineSpacingMultiplier,
  LF_ANSWER_MARKER,
  unwrapBlockDecorators,
} from './utils';
import { parseMathBlock } from './parsers/math';
import { parseChartBlock, parseImageBlock } from './parsers/media';
import { parseTableFromMarker } from './parsers/table';
import { parseBlockList, parseListItem, parseInlineEnumOrList } from './parsers/list';
import { shouldSkipCaptionLine } from './parsers/utils';

// Import extracted parsers
import { cleanupMalformedTypst } from './cleanup';
import { parseCoverBlock } from './parsers/cover';
import { parseCompositeRowBlock } from './parsers/composite-row';
import { parseInputFieldBlock } from './parsers/input-field';
import { parseVerticalSpaceBlock } from './parsers/vertical-space';

export { typstToBlocks }; // Export specifically as referenced by sub-modules

/**
 * 将 Typst 源代码解析为块列表
 */
function typstToBlocks(code: string): TypstBlock[] {
  // Pre-process to fix malformed patterns from older serialization bugs
  const cleaned = cleanupMalformedTypst(code);
  if (!cleaned.trim()) return [];

  const blocks: TypstBlock[] = [];
  const lines = cleaned.split('\n');
  let currentBlock: TypstBlock | null = null;
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = '';
  let pendingParagraphLeading: number | undefined = undefined;
  let skipNextCaptionBecausePreviousImage = false;
  let skippingTableUntilMarker = false;
  let currentParagraphIsList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const trimmed = line.trim();

    // Cover container block
    const coverResult = parseCoverBlock(lines, i);
    if (coverResult) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
        currentParagraphIsList = false;
      }
      blocks.push(coverResult.block);
      i = coverResult.endIndex;
      continue;
    }

    // 解析生成的紧凑列表包装器
    if (/^#block(?:\([^)]*\))?\[$/.test(trimmed)) {
      const result = parseBlockList(lines, i);
      if (result.items.length > 0) {
        if (currentBlock) blocks.push(currentBlock);
        blocks.push({
          id: generateId(),
          type: 'paragraph',
          content: result.items.join('\n'),
        });
        currentBlock = null;
        currentParagraphIsList = false;
        i = result.endIndex;
        continue;
      }
    }

    // 解析单行 #enum(...)/#list(...) 格式
    if (trimmed.startsWith('#enum(') || trimmed.startsWith('#list(') ||
      (trimmed.startsWith('#text(') && (trimmed.includes('#enum(') || trimmed.includes('#list(')))) {
      const listBlock = parseInlineEnumOrList(trimmed);
      if (listBlock) {
        if (currentBlock) blocks.push(currentBlock);
        blocks.push(listBlock);
        currentBlock = null;
        currentParagraphIsList = false;
        continue;
      }
    }

    const isTypstListItem = trimmed.startsWith('-') || trimmed.startsWith('+');
    if (!isTypstListItem && currentParagraphIsList && trimmed !== '') {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = null;
      currentParagraphIsList = false;
    }

    // 跳过多行表格直到找到标记
    if (skippingTableUntilMarker) {
      if (trimmed.includes(LF_TABLE_MARKER)) {
        const tableBlock = parseTableFromMarker(trimmed);
        if (tableBlock) blocks.push(tableBlock);
        skippingTableUntilMarker = false;
      }
      continue;
    }

    // 跳过文档设置标记
    if (trimmed.startsWith(LF_DOC_MARKER)) {
      continue;
    }

    // 处理段落前导设置
    if (trimmed === `#set par(leading: ${defaultParagraphLeadingEm}em)` || trimmed === '#set par(leading: auto)') {
      pendingParagraphLeading = undefined;
      continue;
    }
    const leadingMatch = trimmed.match(/^#set\s+par\(\s*leading\s*:\s*([0-9.]+)em\s*\)\s*$/);
    if (leadingMatch) {
      const v = Number(leadingMatch[1]);
      pendingParagraphLeading = Number.isFinite(v) ? inferLineSpacingMultiplier(v) : undefined;
      continue;
    }

    // 输入字段
    const inputBlock = parseInputFieldBlock(trimmed);
    if (inputBlock) {
      blocks.push(inputBlock);
      continue;
    }

    // 复合行 (Composite Row)
    const compositeRowBlock = parseCompositeRowBlock(trimmed);
    if (compositeRowBlock) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push(compositeRowBlock);
      continue;
    }

    // 垂直间距
    const verticalSpaceBlock = parseVerticalSpaceBlock(trimmed);
    if (verticalSpaceBlock) {
      blocks.push(verticalSpaceBlock);
      continue;
    }

    // 代码块
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = trimmed.substring(3).trim() || 'python';
        codeContent = [];
      } else {
        inCodeBlock = false;
        blocks.push({
          id: generateId(),
          type: 'code',
          content: codeContent.join('\n'),
          language: codeLanguage,
        });
        codeContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // 标题
    if (trimmed.startsWith('=')) {
      const match = trimmed.match(/^(=+)\s+(.+)$/);
      if (match) {
        blocks.push({
          id: generateId(),
          type: 'heading',
          content: match[2],
          level: match[1].length,
        });
        continue;
      }
    }

    // 数学公式
    if (trimmed.startsWith('$')) {
      const mathBlock = parseMathBlock(trimmed);
      if (mathBlock) {
        blocks.push(mathBlock);
        continue;
      }
    }

    // 列表项
    if (trimmed.startsWith('-') || trimmed.startsWith('+')) {
      const listBlock = parseListItem(trimmed, currentBlock, currentParagraphIsList, pendingParagraphLeading);
      if (listBlock.shouldFlush && currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = listBlock.block;
      currentParagraphIsList = listBlock.isList;
      continue;
    }

    // 图表块
    const chartMarker = trimmed.match(/\/\*LF_CHART:([A-Za-z0-9+/=]+)\*\//);
    if (chartMarker) {
      const chartBlock = parseChartBlock(trimmed, chartMarker[1]);
      if (chartBlock) {
        blocks.push(chartBlock);
        skipNextCaptionBecausePreviousImage = true;
        continue;
      }
    }

    // 图片 (通过标记注释) - Catch placeholder blocks and marked images
    if (trimmed.includes(LF_IMAGE_MARKER)) {
      const imageBlock = parseImageBlock(trimmed);
      if (imageBlock) {
        blocks.push(imageBlock);
        skipNextCaptionBecausePreviousImage = true;
        continue;
      }
    }

    // New Image Format: #figure(...) or #align(..)[#figure(...)]
    if (trimmed.startsWith('#figure(') ||
      (/^#align\(\s*(?:left|center|right)\s*\)\s*\[\s*#figure\(/.test(trimmed))) {
      const imageBlock = parseImageBlock(trimmed);
      if (imageBlock) {
        blocks.push(imageBlock);
        skipNextCaptionBecausePreviousImage = true;
        continue;
      }
    }

    // 图片 - (Legacy/Manual) 支持 #align(left|center|right, image(...))
    if (/^#align\(\s*(left|center|right)\s*,\s*image\(/.test(trimmed)) {
      const imageBlock = parseImageBlock(trimmed);
      if (imageBlock) {
        blocks.push(imageBlock);
        skipNextCaptionBecausePreviousImage = true;
        continue;
      }
    } else if (trimmed.startsWith('#image(')) {
      const match = trimmed.match(/#image\("(.+)"\)/);
      if (match) {
        blocks.push({
          id: generateId(),
          type: 'image',
          content: match[1],
          width: '50%',
          height: 'auto',
        });
        continue;
      }
    }

    // 跳过图片/表格/图表的标题行
    if (trimmed.startsWith('#align(center)[')) {
      if (shouldSkipCaptionLine(lines, i, skipNextCaptionBecausePreviousImage)) {
        skipNextCaptionBecausePreviousImage = false;
        continue;
      }
      skipNextCaptionBecausePreviousImage = false;
    }

    // 检测多行表格表达式的开始
    if (
      (trimmed.startsWith('#align(center)[#block(width:') ||
        trimmed.startsWith('#align(center, block(width:') ||
        trimmed.startsWith('#align(center)[#table(') ||
        trimmed.startsWith('#align(center, table(') ||
        trimmed.startsWith('#table(')) &&
      !trimmed.includes(LF_TABLE_MARKER)
    ) {
      skippingTableUntilMarker = true;
      continue;
    }

    // 表格（通过标记注释）
    if (trimmed.includes(LF_TABLE_MARKER)) {
      const tableBlock = parseTableFromMarker(trimmed);
      if (tableBlock) {
        blocks.push(tableBlock);
        continue;
      }
    }

    // Answer placeholder block
    if (trimmed.startsWith('#block(') && !trimmed.includes(LF_ANSWER_MARKER)) {
      // Check if this looks like an answer placeholder
      let foundMarker = false;
      let endIdx = i;
      for (let peek = i; peek < Math.min(i + 20, lines.length); peek++) {
        const peekLine = lines[peek].replace(/\r$/, '');
        if (peekLine.includes(LF_ANSWER_MARKER)) {
          foundMarker = true;
          endIdx = peek;
          break;
        }
      }
      if (foundMarker) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        blocks.push({
          id: generateId(),
          type: 'paragraph',
          content: '\u200B',
          placeholder: '在此填写答案...',
        });
        i = endIdx;
        continue;
      }
    }

    // Single-line answer placeholder with marker
    if (trimmed.includes(LF_ANSWER_MARKER) && trimmed.includes('#block(')) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push({
        id: generateId(),
        type: 'paragraph',
        content: '\u200B',
        placeholder: '在此填写答案...',
      });
      continue;
    }

    // 空行
    if (trimmed === '') {
      if (currentBlock) {
        if (currentBlock.type === 'paragraph' && typeof pendingParagraphLeading === 'number') {
          currentBlock.lineSpacing = pendingParagraphLeading;
        }
        blocks.push(currentBlock);
        currentBlock = null;
        currentParagraphIsList = false;
      }
      continue;
    }

    // 段落
    const paragraphLine = line.replace(/ \\s*$/g, '');
    const hasAnswerMarker = paragraphLine.includes(LF_ANSWER_MARKER);
    const paragraphText = paragraphLine
      .replace(LF_ANSWER_MARKER, '')
      .replace(
        /\s*#linebreak\(\s*(?:justify\s*:\s*(?:true|false)\s*)?\)\s*/g,
        '\n'
      );

    if (currentBlock?.type === 'paragraph') {
      currentBlock.content += '\n' + paragraphText;
    } else {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        id: generateId(),
        type: 'paragraph',
        content: paragraphText,
      };
      if (hasAnswerMarker) {
        currentBlock.placeholder = '在此填写答案...';
      }
      if (typeof pendingParagraphLeading === 'number') {
        currentBlock.lineSpacing = pendingParagraphLeading;
      }
    }
  }

  // 添加最后一个块
  if (currentBlock) {
    if (currentBlock.type === 'paragraph' && typeof pendingParagraphLeading === 'number') {
      currentBlock.lineSpacing = pendingParagraphLeading;
    }
    blocks.push(currentBlock);
  }

  return blocks.map(b => {
    if (b.type === 'paragraph' || b.type === 'heading') {
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
