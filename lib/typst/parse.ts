import { TypstBlock, PersistedMathPayload, PersistedTablePayload } from './types';
import {
  LF_TABLE_MARKER, LF_IMAGE_MARKER, LF_CHART_MARKER, LF_DOC_MARKER,
  base64DecodeUtf8, generateId,
  defaultParagraphLeadingEm, inferLineSpacingMultiplier,
  LF_ANSWER_MARKER,
} from './utils';
import { parseMathBlock } from './parse-math';
import { parseChartBlock, parseImageBlock } from './parse-media';
import { parseTableFromMarker } from './parse-table';

/**
 * 将 Typst 源代码解析为块列表
 */
export function typstToBlocks(code: string): TypstBlock[] {
  if (!code.trim()) return [];

  const blocks: TypstBlock[] = [];
  const lines = code.split('\n');
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

    // Answer placeholder block (serialized as multi-line #block(...))
    // Detect when we hit the start of such a block and consume all lines until LF_ANSWER_MARKER
    if (trimmed.startsWith('#block(') && !trimmed.includes(LF_ANSWER_MARKER)) {
      // Check if this looks like an answer placeholder by looking ahead for the marker
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
        // Skip all lines up to and including the marker, emit a placeholder block
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        blocks.push({
          id: generateId(),
          type: 'paragraph',
          content: '\u200B', // Zero-width space
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

  return blocks;
}

function parseBlockList(lines: string[], startIndex: number): { items: string[]; endIndex: number } {
  const items: string[] = [];
  let j = startIndex + 1;
  let foundEnumOrListLine: string | null = null;

  for (; j < lines.length; j++) {
    const inner = lines[j].replace(/\r$/, '');
    const innerTrim = inner.trim();
    if (innerTrim === ']') break;
    if (innerTrim === '' || innerTrim.startsWith('#set ')) continue;

    if (innerTrim.startsWith('#enum(') || innerTrim.startsWith('#list(')) {
      foundEnumOrListLine = innerTrim;
      continue;
    }

    if (innerTrim.startsWith('-')) {
      const body = innerTrim.substring(1).trim();
      items.push(body.length === 0 ? '- ' : `- ${body}`);
      continue;
    }
    if (innerTrim.startsWith('+')) {
      const body = innerTrim.substring(1).trim();
      items.push(body.length === 0 ? '1. ' : `1. ${body}`);
      continue;
    }
  }

  if (items.length === 0 && foundEnumOrListLine) {
    const isEnum = foundEnumOrListLine.startsWith('#enum(');
    const s = foundEnumOrListLine;
    const outItems: string[] = [];
    let idx = s.indexOf(')');
    if (idx >= 0) {
      idx += 1;
      let depth = 0;
      let start = -1;
      for (; idx < s.length; idx++) {
        const ch = s[idx];
        if (ch === '[') {
          if (depth === 0) start = idx + 1;
          depth++;
        } else if (ch === ']') {
          depth--;
          if (depth === 0 && start >= 0) {
            const body = s.slice(start, idx).trim();
            outItems.push(body);
            start = -1;
          }
        }
      }
    }

    for (const body of outItems) {
      if (isEnum) {
        items.push(body.length === 0 ? '1. ' : `1. ${body}`);
      } else {
        items.push(body.length === 0 ? '- ' : `- ${body}`);
      }
    }
  }

  if (j < lines.length && lines[j].replace(/\r$/, '').trim() === ']') {
    return { items, endIndex: j };
  }

  return { items: [], endIndex: startIndex };
}



function parseListItem(
  trimmed: string,
  currentBlock: TypstBlock | null,
  currentParagraphIsList: boolean,
  pendingParagraphLeading: number | undefined
): { block: TypstBlock | null; isList: boolean; shouldFlush: boolean } {
  const content = trimmed.substring(1).trim();
  const asText = trimmed.startsWith('-') ? `- ${content}` : `1. ${content}`;

  if (currentBlock?.type === 'paragraph' && currentParagraphIsList) {
    currentBlock.content += '\n' + asText;
    return { block: currentBlock, isList: true, shouldFlush: false };
  }

  const newBlock: TypstBlock = {
    id: generateId(),
    type: 'paragraph',
    content: asText,
  };
  if (typeof pendingParagraphLeading === 'number') {
    newBlock.lineSpacing = pendingParagraphLeading;
  }
  return { block: newBlock, isList: true, shouldFlush: true };
}





function shouldSkipCaptionLine(lines: string[], currentIndex: number, skipNextCaption: boolean): boolean {
  const nextFew = Array.from({ length: 6 }, (_, k) => lines[currentIndex + 1 + k])
    .filter((x) => typeof x === 'string')
    .map((x) => (x as string).replace(/\r$/, '').trim());
  const prev = lines[currentIndex - 1]?.replace(/\r$/, '').trim() ?? '';

  if (nextFew.some((x) => x.includes(LF_TABLE_MARKER))) return true;
  if (nextFew.some((x) => x.includes(LF_IMAGE_MARKER))) return true;
  if (nextFew.some((x) => x.includes(LF_CHART_MARKER))) return true;
  if (skipNextCaption && prev.includes(LF_IMAGE_MARKER)) return true;
  if (skipNextCaption && prev.includes(LF_CHART_MARKER)) return true;

  return false;
}
