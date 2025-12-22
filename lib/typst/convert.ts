import { TypstBlock, DocumentSettings, defaultDocumentSettings, PersistedMathPayload, PersistedTablePayload, PersistedTableCell } from './types';
import {
  LF_MATH_MARKER, LF_TABLE_MARKER, LF_IMAGE_MARKER, LF_CHART_MARKER, LF_DOC_MARKER,
  base64EncodeUtf8, base64DecodeUtf8, generateId,
  defaultParagraphLeadingEm, snapLineSpacingMultiplier, leadingEmFromMultiplier,
  inlineToSingleLine, safeParseTablePayload, safeParseChartPayload, inferLineSpacingMultiplier,
  convertMixedParagraph
} from './utils';
import { typstToLatexMath } from '../math-convert';

// 块列表 → Typst 源代码
export function blocksToTypst(blocks: TypstBlock[], opts?: { settings?: DocumentSettings }): string {
  const settings = opts?.settings ?? defaultDocumentSettings;
  let tableIndex = 0;
  let imageIndex = 0;

  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        const level = block.level || 1;
        // Ensure there is a space after the equals signs
        out.push(`${'='.repeat(level)} ${block.content}`);
        break;
      
      case 'paragraph':
        // Handle mixed content paragraphs (text + lists) properly
        {
          const raw = block.content ?? '';
          const body = convertMixedParagraph(raw);
          
          const multiplierRaw = typeof block.lineSpacing === 'number' && Number.isFinite(block.lineSpacing)
            ? block.lineSpacing
            : undefined;
          const multiplier = typeof multiplierRaw === 'number' ? snapLineSpacingMultiplier(multiplierRaw) : undefined;

          if (typeof multiplier === 'number') {
            const leadingEm = leadingEmFromMultiplier(multiplier);
            out.push(`#set par(leading: ${leadingEm}em)\n${body}\n#set par(leading: ${defaultParagraphLeadingEm}em)`);
          } else {
            out.push(body);
          }
        }
        break;
      
      case 'code':
        const lang = block.language || 'python';
        out.push(`\`\`\`${lang}\n${block.content}\n\`\`\``);
        break;
      
      case 'math':
        {
          const payload: PersistedMathPayload = {
            format: block.mathFormat ?? 'latex',
            latex: (block.mathLatex ?? '').trim(),
            typst: (block.mathTypst ?? block.content ?? '').trim(),
            lines: block.mathLines?.map((l) => ({ latex: l.latex, typst: l.typst })) ?? undefined,
            brace: block.mathBrace ?? undefined,
          };
          const encoded = `${LF_MATH_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;

          if (block.mathLines && block.mathLines.length > 0) {
            const lines = block.mathLines.map(line => line.typst.trim()).filter(l => l);
            if (lines.length === 0) {
              out.push('');
              break;
            }
            if (block.mathBrace) {
              out.push(`$ cases(${lines.join(', ')}) $${encoded}`);
              break;
            } else {
              out.push(`$ ${lines.join(' \\ ')} $${encoded}`);
              break;
            }
          }

          out.push(`$ ${(block.mathTypst ?? block.content).trim()} $${encoded}`);
          break;
        }
      
      case 'image':
        {
          imageIndex += 1;
          const width = block.width || '100%';
          const height = 'auto';
          const captionRaw = (block.caption ?? '').trim();
          const label = settings.imageCaptionNumbering ? `图${imageIndex} ` : '';
          const captionText = (label + captionRaw).trim() ? (label + captionRaw) : '';
          const payload = {
            caption: block.caption ?? '',
            width,
            height,
          };
          const encoded = `${LF_IMAGE_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;
          const imageLine = `#align(center, image("${block.content}", width: ${width}, height: ${height}))${encoded}`;
          const captionLine = captionText ? `#align(center)[${captionText}]` : '';

          if (captionLine && settings.imageCaptionPosition === 'above') {
            out.push(`${captionLine}\n${imageLine}`);
          } else if (captionLine && settings.imageCaptionPosition === 'below') {
            out.push(`${imageLine}\n${captionLine}`);
          } else {
            out.push(imageLine);
          }
          break;
        }

      case 'chart':
        {
          const payload = safeParseChartPayload(block.content ?? '');
          const imageUrl = (payload.imageUrl ?? '').trim();
          const encoded = `${LF_CHART_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;

          if (!imageUrl) {
            out.push(`#align(center)[(未生成图表)]${encoded}`);
            break;
          }

          const width = block.width || '100%';
          const imageLine = `#align(center, image("${imageUrl}", width: ${width}, height: auto))${encoded}`;
          out.push(imageLine);
          break;
        }
      
      case 'list':
        out.push(block.content.split('\n').map(line => `- ${line}`).join('\n'));
        break;

      case 'table': {
        tableIndex += 1;
        const payload = safeParseTablePayload(block.content ?? '');
        const rows = payload.rows;
        const cols = payload.cols;
        const style = payload.style ?? 'normal';

        const stroke = style === 'three-line'
          ? `stroke: (x: 0pt, y: 0pt), table.hline(y: 0, stroke: 1.6pt), table.hline(y: 1, stroke: 0.8pt), table.hline(y: ${rows}, stroke: 1.6pt)`
          : 'stroke: 0.8pt';

        const flatArgs: string[] = [];

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cell = payload.cells?.[r]?.[c] ?? ({ content: '' } as PersistedTableCell);
            if (cell.hidden) continue;
            const rs = Math.max(1, Number(cell.rowspan || 1));
            const cs = Math.max(1, Number(cell.colspan || 1));
            const body = inlineToSingleLine((cell.content ?? '').trim());

            const cellArgs: string[] = [];
            if (rs > 1) cellArgs.push(`rowspan: ${rs}`);
            if (cs > 1) cellArgs.push(`colspan: ${cs}`);

            if (cellArgs.length > 0) {
              flatArgs.push(`table.cell(${cellArgs.join(', ')})[${body}]`);
            } else {
              flatArgs.push(`[${body}]`);
            }
          }
        }

        const encoded = `${LF_TABLE_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;

        const captionRaw = (payload.caption ?? '').trim();
        const label = settings.tableCaptionNumbering ? `表${tableIndex} ` : '';
        const captionText = (label + captionRaw).trim() ? (label + captionRaw) : '';
        const captionLine = captionText ? `#align(center)[${captionText}]\n` : '';
        const tableLine = `#align(center, table(columns: ${cols}, ${stroke}, ${flatArgs.join(', ')}))${encoded}`;
        out.push(`${captionLine}${tableLine}`);
        break;
      }
      
      default:
        out.push(block.content);
        break;
    }
  }

  return out.join('\n\n');
}

// Typst 源代码 → 块列表（简单解析）
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
    // Remove carriage return if present (Windows compatibility)
    const line = lines[i].replace(/\r$/, '');
    const trimmed = line.trim();

    // Parse our generated tight-list wrapper:
    // #block(spacing: 0em)[
    // #set enum(...)
    // #set list(...)
    // #set par(...)
    // + Item
    // - Item
    // ]
    // This ensures code saved from visual mode can be parsed back into blocks.
    if (/^#block(?:\([^)]*\))?\[$/.test(trimmed)) {
      const items: string[] = [];
      let j = i + 1;
      let foundEnumOrListLine: string | null = null;
      for (; j < lines.length; j++) {
        const inner = lines[j].replace(/\r$/, '');
        const innerTrim = inner.trim();
        if (innerTrim === ']') break;
        if (innerTrim === '' || innerTrim.startsWith('#set ')) continue;

        // New format: #enum(...)[][...], #list(...)[][...]
        if (innerTrim.startsWith('#enum(') || innerTrim.startsWith('#list(')) {
          foundEnumOrListLine = innerTrim;
          continue;
        }

        // Legacy format: markup list items
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

      // If we saw #enum/#list, parse bracketed children as items.
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

      if (j < lines.length && lines[j].replace(/\r$/, '').trim() === ']' && items.length > 0) {
        if (currentBlock) blocks.push(currentBlock);
        blocks.push({
          id: generateId(),
          type: 'paragraph',
          content: items.join('\n'),
        });
        currentBlock = null;
        currentParagraphIsList = false;
        i = j;
        continue;
      }
    }

    const isTypstListItem = trimmed.startsWith('-') || trimmed.startsWith('+');
    if (!isTypstListItem && currentParagraphIsList && trimmed !== '') {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = null;
      currentParagraphIsList = false;
    }

    // If we are inside a multi-line table expression, ignore everything until we see the
    // persisted payload marker. This prevents partial `table(...)` fragments from being
    // interpreted as paragraphs on round-trips.
    if (skippingTableUntilMarker) {
      if (trimmed.includes(LF_TABLE_MARKER)) {
        const m = trimmed.match(/\/\*LF_TABLE:([A-Za-z0-9+/=]+)\*\//);
        if (m) {
          try {
            const payload = JSON.parse(base64DecodeUtf8(m[1])) as PersistedTablePayload;
            if (payload && Array.isArray(payload.cells)) {
              blocks.push({
                id: generateId(),
                type: 'table',
                content: JSON.stringify(payload),
              });
            }
          } catch {
            // ignore
          }
        }
        skippingTableUntilMarker = false;
      }
      continue;
    }

    // Document settings marker is handled outside editor; ignore in block parsing.
    if (trimmed.startsWith(LF_DOC_MARKER)) {
      continue;
    }

    // Paragraph leading setter / resetter (used for per-paragraph line spacing)
    // Note: Typst's default leading is 0.65em.
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

    // 代码块开始
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = trimmed.substring(3).trim() || 'python';
        codeContent = [];
      } else {
        // 代码块结束
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

    // 在代码块内
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
      // Supports persisted payload: $ ... $/*LF_MATH:<base64-json>*/
      const m = trimmed.match(/^\$\s*([\s\S]*?)\s*\$(?:\/\*LF_MATH:([A-Za-z0-9+/=]+)\*\/)?$/);
      if (m) {
        const typstMath = (m[1] ?? '').trim();
        const payloadB64 = m[2];

        let payload: PersistedMathPayload | null = null;
        if (payloadB64) {
          try {
            payload = JSON.parse(base64DecodeUtf8(payloadB64)) as PersistedMathPayload;
          } catch {
            payload = null;
          }
        }

        const mathTypst = (payload?.typst ?? typstMath).trim();
        const mathLatex = (payload?.latex ?? '').trim() || typstToLatexMath(mathTypst);

        blocks.push({
          id: generateId(),
          type: 'math',
          content: mathTypst,
          mathFormat: payload?.format ?? 'latex',
          mathTypst,
          mathLatex,
          mathLines: payload?.lines,
          mathBrace: payload?.brace,
        });
        continue;
      }
    }

    // 列表项
    if (trimmed.startsWith('-') || trimmed.startsWith('+')) {
      const content = trimmed.substring(1).trim();
      const asText = trimmed.startsWith('-') ? `- ${content}` : `1. ${content}`;

      if (currentBlock?.type === 'paragraph' && currentParagraphIsList) {
        currentBlock.content += '\n' + asText;
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          id: generateId(),
          type: 'paragraph',
          content: asText,
        };
        if (typeof pendingParagraphLeading === 'number') {
          currentBlock.lineSpacing = pendingParagraphLeading;
        }
        currentParagraphIsList = true;
      }
      continue;
    }

    // 图表块（带图片或未生成）
    const chartMarker = trimmed.match(/\/\*LF_CHART:([A-Za-z0-9+/=]+)\*\//);
    if (chartMarker) {
      try {
        const decoded: unknown = JSON.parse(base64DecodeUtf8(chartMarker[1]));
        const payload = (decoded && typeof decoded === 'object') ? (decoded as Record<string, unknown>) : {};
        
        // 提取图片 URL（如果有）
        const match = trimmed.match(/#align\(center,\s*image\("([^"]+)"/);
        const imageUrl = match?.[1] ?? '';
        
        const merged = {
          ...(payload && typeof payload === 'object' ? payload : {}),
          imageUrl: (typeof payload['imageUrl'] === 'string' ? (payload['imageUrl'] as string) : imageUrl) || imageUrl,
        };

        blocks.push({
          id: generateId(),
          type: 'chart',
          content: JSON.stringify(merged),
        });

        // Skip the next title/caption line if present (we store title in the payload).
        skipNextCaptionBecausePreviousImage = true;
        continue;
      } catch {
        // fall through
      }
    }

    // 图片
    if (trimmed.startsWith('#align(center, image(')) {

      // If a caption line is directly above the image (position=above), skip it.
      if (i > 0) {
        const prev = lines[i - 1].replace(/\r$/, '').trim();
        if (prev.startsWith('#align(center)[') && trimmed.includes(LF_IMAGE_MARKER)) {
          // prev will be handled/ignored; keep going.
        }
      }

      const imgMarker = trimmed.match(/\/\*LF_IMAGE:([A-Za-z0-9+/=]+)\*\//);
      if (imgMarker) {
        try {
          const payload = JSON.parse(base64DecodeUtf8(imgMarker[1])) as { caption?: string; width?: string; height?: string };
          const match = trimmed.match(/#align\(center,\s*image\("([^"]+)"(?:,\s*width:\s*([^,}]+))?(?:,\s*height:\s*([^)]+))?\)\)/);
          if (match) {
            blocks.push({
              id: generateId(),
              type: 'image',
              content: match[1],
              width: (payload.width ?? match[2]?.trim() ?? '100%'),
              height: 'auto',
              caption: (payload.caption ?? '').toString(),
            });
            // If caption is below, skip next caption line
            skipNextCaptionBecausePreviousImage = true;
            continue;
          }
        } catch {
          // ignore
        }
      }

      // Parse legacy images without marker
      const match = trimmed.match(/#align\(center,\s*image\("([^"]+)"(?:,\s*width:\s*([^,}]+))?(?:,\s*height:\s*([^)]+))?\)\)/);
      if (match) {
        blocks.push({
          id: generateId(),
          type: 'image',
          content: match[1],
          width: match[2]?.trim() || '100%',
          height: 'auto',
        });
        continue;
      }
    } else if (trimmed.startsWith('#image(')) {
      // Fallback for old format #image("path")
      const match = trimmed.match(/#image\("(.+)"\)/);
      if (match) {
        blocks.push({
          id: generateId(),
          type: 'image',
          content: match[1],
          width: '100%',
          height: 'auto',
        });
        continue;
      }
    }

    // Skip caption line if it's adjacent to a table or image with persisted payload.
    if (trimmed.startsWith('#align(center)[')) {
      const nextFew = Array.from({ length: 6 }, (_, k) => lines[i + 1 + k])
        .filter((x) => typeof x === 'string')
        .map((x) => (x as string).replace(/\r$/, '').trim());
      const prev = lines[i - 1]?.replace(/\r$/, '').trim() ?? '';
      if (nextFew.some((x) => x.includes(LF_TABLE_MARKER))) continue;
      if (nextFew.some((x) => x.includes(LF_IMAGE_MARKER))) continue;
      if (nextFew.some((x) => x.includes(LF_CHART_MARKER))) continue;
      if (skipNextCaptionBecausePreviousImage && prev.includes(LF_IMAGE_MARKER)) {
        skipNextCaptionBecausePreviousImage = false;
        continue;
      }
      if (skipNextCaptionBecausePreviousImage && prev.includes(LF_CHART_MARKER)) {
        skipNextCaptionBecausePreviousImage = false;
        continue;
      }
      skipNextCaptionBecausePreviousImage = false;
    }

    // Detect the start of a multi-line table expression produced by older versions
    // (e.g. when a cell contains raw newlines). Skip until the LF_TABLE marker line.
    if (
      (trimmed.startsWith('#align(center, table(') || trimmed.startsWith('#table(')) &&
      !trimmed.includes(LF_TABLE_MARKER)
    ) {
      skippingTableUntilMarker = true;
      continue;
    }

    // 表格（通过标记注释无损还原）
    if (trimmed.includes(LF_TABLE_MARKER)) {
      const m = trimmed.match(/\/\*LF_TABLE:([A-Za-z0-9+/=]+)\*\//);
      if (m) {
        try {
          const payload = JSON.parse(base64DecodeUtf8(m[1])) as PersistedTablePayload;
          if (payload && Array.isArray(payload.cells)) {
            blocks.push({
              id: generateId(),
              type: 'table',
              content: JSON.stringify(payload),
            });
            continue;
          }
        } catch {
          // ignore
        }
      }
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
    // Back-compat: Strip Typst explicit line break markers produced by older blocksToTypst.
    // This prevents accumulating `\` when switching between source and visual views.
    const paragraphLine = line.replace(/ \\\s*$/g, '');

    // Convert single-line `#linebreak()` tokens back into internal newlines.
    // Accept optional justify arg for robustness.
    const paragraphText = paragraphLine.replace(
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

// 默认块
export function getDefaultBlocks(): TypstBlock[] {
  return [
    {
      id: generateId(),
      type: 'heading',
      content: 'Hello Typst!',
      level: 1,
    },
    {
      id: generateId(),
      type: 'paragraph',
      content: 'This is a *bold* text and _italic_ text.',
    },
  ];
}
