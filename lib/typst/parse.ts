/**
 * @file parse.ts
 * @description Main entry point for parsing Typst source code into blocks.
 * Delegates actual parsing to modular files in ./parsers/
 */

import { TypstBlock } from './types';
import {
  LF_TABLE_MARKER, LF_IMAGE_MARKER, LF_CHART_MARKER, LF_DOC_MARKER,
  base64DecodeUtf8, generateId,
  defaultParagraphLeadingEm, inferLineSpacingMultiplier,
  LF_ANSWER_MARKER,
  unwrapBlockDecorators,
  LF_COVER_BEGIN_MARKER,
  LF_COVER_END_MARKER,
  LF_COMPOSITE_ROW_MARKER,
} from './utils';
import { parseMathBlock } from './parsers/math';
import { parseChartBlock, parseImageBlock } from './parsers/media';
import { parseTableFromMarker } from './parsers/table';
import { parseBlockList, parseListItem, parseInlineEnumOrList } from './parsers/list';
import { shouldSkipCaptionLine } from './parsers/utils';

/**
 * Cleanup malformed Typst patterns from older serialization bugs.
 * Handles patterns like:
 *   #text(font: "SimSun")[#text(font: "SimSun")[#block[]
 *   #text(font: "SimSun")[#block[
 *   #enum(tight: true)[...][...]
 *   ]]
 *   #text(font: "SimSun")[]]
 * 
 * And converts them to clean inline format.
 */
function cleanupMalformedTypst(code: string): string {
  if (!code) return '';

  let result = code;

  // Pattern 1: Remove lines that are just opening malformed wrappers
  // #text(font: "SimSun")[#text(font: "SimSun")[#block[]
  result = result.replace(/^#text\s*\([^)]*\)\s*\[\s*#text\s*\([^)]*\)\s*\[\s*#block\s*\[\s*\]\s*$/gm, '');

  // Pattern 2: Remove lines that are just #text(font: "...")[#block[
  result = result.replace(/^#text\s*\([^)]*\)\s*\[\s*#block\s*\[\s*$/gm, '');

  // Pattern 3: Remove trailing empty wrapper closures
  // #text(font: "SimSun")[]] or just ]]
  result = result.replace(/^#text\s*\([^)]*\)\s*\[\s*\]\s*\]*\s*$/gm, '');

  // Pattern 4: Remove lone ]] that aren't part of valid structures
  result = result.replace(/^\s*\]\]\s*$/gm, '');

  // Pattern 5: Clean up the inline enum/list that might have extra wrapper: 
  // #text(font: "SimSun")[#block[ followed by #enum on next line, then ]] on following line
  // Replace with just the #enum line
  result = result.replace(
    /^(#text\s*\([^)]*\)\s*\[\s*#block\s*\[)\s*\n\s*(#(?:enum|list)\([^)]*\)(?:\[[^\]]*\])+)\s*\n\s*\]\]\s*$/gm,
    (_match, _wrapper, listExpr) => listExpr
  );

  // Clean up excessive blank lines left behind
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * 将 Typst 源代码解析为块列表
 */
export function typstToBlocks(code: string): TypstBlock[] {
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
    // Format:
    //   /*LF_COVER_BEGIN:<base64-json>*/
    //   ...children typst...
    //   /*LF_COVER_END*/
    //   #pagebreak()   (optional, indicates fixedOnePage)
    if (trimmed.startsWith(LF_COVER_BEGIN_MARKER)) {
      const m = trimmed.match(/\/\*LF_COVER_BEGIN:([A-Za-z0-9+/=]+)\*\//);
      if (m) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
          currentParagraphIsList = false;
        }

        let fixedOnePage = false;
        try {
          const payload = JSON.parse(base64DecodeUtf8(m[1])) as any;
          fixedOnePage = !!payload?.fixedOnePage;
        } catch {
          fixedOnePage = false;
        }

        let endIdx = -1;
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j].replace(/\r$/, '').trim();
          if (t === LF_COVER_END_MARKER) {
            endIdx = j;
            break;
          }
        }

        if (endIdx !== -1) {
          const innerCode = lines.slice(i + 1, endIdx).join('\n');
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

          blocks.push({
            id: generateId(),
            type: 'cover',
            content: '',
            children,
            coverFixedOnePage: fixedOnePage,
            uiCollapsed: true,
          });

          i = endIdx;
          continue;
        }
      }
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

    // 解析单行 #enum(...)/#list(...) 格式，包括 #text(font: "...")[#enum(...)]
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
    // Detect LF_INPUT marker
    const inputMarker = trimmed.match(/\/\*LF_INPUT:([A-Za-z0-9+/=]+)\*\//);
    if (inputMarker) {
      try {
        const payload = JSON.parse(base64DecodeUtf8(inputMarker[1]));
        // Support both old single-line format and new multi-line format
        const inputLines = payload.lines || (payload.label !== undefined || payload.value !== undefined
          ? [{ label: payload.label || '', value: payload.value || '' }]
          : [{ label: '', value: '' }]);
        blocks.push({
          id: generateId(),
          type: 'input_field',
          content: '',
          inputLines,
          inputSeparator: payload.separator ?? '：',
          inputShowUnderline: payload.showUnderline !== false,
          inputWidth: payload.width || '50%',
          inputAlign: payload.align || 'center',
          inputFontSize: payload.fontSize || '',
          inputFontFamily: payload.fontFamily || '',
        });
        continue;
      } catch {
        // Fallback if parse fails
      }
    }

    // 复合行 (Composite Row)
    // Detect LF_COMPOSITE_ROW marker
    const compositeRowMarker = trimmed.match(/\/\*LF_COMPOSITE_ROW:([A-Za-z0-9+/=]+)\*\//);
    if (compositeRowMarker) {
      try {
        const payload = JSON.parse(base64DecodeUtf8(compositeRowMarker[1]));

        // Extract children from either:
        // 1. #grid(columns: ..., [child1], [child2], ...) - for left/center/right
        // 2. #box(width: 100%)[#box()[child1] #h(1fr) #box()[child2]] - for space-*
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
          // We need to extract only the children [...] from inside the grid, not the outer #align[...] wrapper

          // First, find the grid content - skip over #align(...)[...] if present
          let gridContent = beforeMarker;
          const alignMatch = beforeMarker.match(/^#align\((left|center|right)\)\[(.+)\]$/);
          if (alignMatch) {
            gridContent = alignMatch[2];
          }

          // Now find the grid children: look for pattern after #grid(..., 
          // The grid params end where the first [...] starts
          const gridMatch = gridContent.match(/#grid\([^[]+/);
          const gridParamsEnd = gridMatch ? gridMatch[0].length : 0;
          const childPart = gridContent.slice(gridParamsEnd);

          // Extract all [...] from the child part
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

        // Parse each child content as blocks
        const children: TypstBlock[] = [];
        for (const childCode of childContents) {
          const parsedChildren = typstToBlocks(childCode.trim());
          children.push(...parsedChildren);
        }

        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }

        blocks.push({
          id: generateId(),
          type: 'composite_row',
          content: '',
          children,
          compositeJustify: payload.justify || 'space-between',
          compositeGap: payload.gap || '8pt',
          compositeVerticalAlign: payload.verticalAlign || 'top',
        });
        continue;
      } catch {
        // Fallback if parse fails
      }
    }

    // 垂直间距
    // Detect either #v(...) or the #block(...) variant used for preview
    // Check for our marker first
    const vsMarker = trimmed.match(/\/\*LF_VS:([A-Za-z0-9+/=]+)\*\//);
    if (vsMarker) {
      // It's a managed vertical space block
      try {
        // We might have metadata but vertical_space relies on global settings now.
        // Still parse content (height)
        let height = '1em';
        const vMatch = trimmed.match(/^#v\((.+)\)/);
        const blockMatch = trimmed.match(/^#block\(height:\s*([^,]+)/);
        if (vMatch) height = vMatch[1].trim();
        else if (blockMatch) height = blockMatch[1].trim();

        blocks.push({
          id: generateId(),
          type: 'vertical_space',
          content: height,
        });
        continue;
      } catch {
        // Fallback if marker parse fails
      }
    } else if (trimmed.startsWith('#v(')) {
      // Legacy or manual #v(...) without marker
      const match = trimmed.match(/^#v\((.+)\)$/);
      if (match) {
        blocks.push({
          id: generateId(),
          type: 'vertical_space',
          content: match[1],
        });
        continue;
      }
    } else if (trimmed.startsWith('#block(height:')) {
      // Block-based vertical space (new format for consistent rendering)
      const match = trimmed.match(/^#block\(height:\s*([^,]+)/);
      if (match) {
        blocks.push({
          id: generateId(),
          type: 'vertical_space',
          content: match[1].trim(),
        });
        continue;
      }
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

  return blocks.map(b => {
    if (b.type === 'paragraph' || b.type === 'heading') {
      const unwrapped = unwrapBlockDecorators(b.content);
      // Only apply if we found decorators, to avoid unnecessary updates/re-renders or loss of other props
      // Actually we should always apply if we want to clean up even simple content if it was wrapped.
      // Merging properties safely.
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
