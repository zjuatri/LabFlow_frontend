import { TypstBlock, DocumentSettings, defaultDocumentSettings, PersistedMathPayload, PersistedTablePayload, PersistedTableCell } from './types';
import {
  LF_MATH_MARKER, LF_TABLE_MARKER, LF_IMAGE_MARKER, LF_CHART_MARKER,
  base64EncodeUtf8,
  defaultParagraphLeadingEm, snapLineSpacingMultiplier, leadingEmFromMultiplier,
  inlineToSingleLine, safeParseTablePayload, safeParseChartPayload,
  convertMixedParagraph
} from './utils';

/**
 * 将块列表转换为 Typst 源代码
 */
export function blocksToTypst(blocks: TypstBlock[], opts?: { settings?: DocumentSettings }): string {
  const settings = opts?.settings ?? defaultDocumentSettings;
  let tableIndex = 0;
  let imageIndex = 0;

  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
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
      
      case 'image':
        imageIndex += 1;
        out.push(serializeImage(block, imageIndex, settings));
        break;

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
      
      default:
        out.push(block.content);
        break;
    }
  }

  return out.join('\n\n');
}

function serializeHeading(block: TypstBlock): string {
  const level = block.level || 1;
  return `${'='.repeat(level)} ${block.content}`;
}

function serializeParagraph(block: TypstBlock): string {
  const raw = block.content ?? '';
  const body = convertMixedParagraph(raw);
  
  const multiplierRaw = typeof block.lineSpacing === 'number' && Number.isFinite(block.lineSpacing)
    ? block.lineSpacing
    : undefined;
  const multiplier = typeof multiplierRaw === 'number' ? snapLineSpacingMultiplier(multiplierRaw) : undefined;

  if (typeof multiplier === 'number') {
    const leadingEm = leadingEmFromMultiplier(multiplier);
    return `#set par(leading: ${leadingEm}em)\n${body}\n#set par(leading: ${defaultParagraphLeadingEm}em)`;
  }
  
  return body;
}

function serializeCode(block: TypstBlock): string {
  const lang = block.language || 'python';
  return `\`\`\`${lang}\n${block.content}\n\`\`\``;
}

function serializeMath(block: TypstBlock): string {
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
      return '';
    }
    if (block.mathBrace) {
      return `$ cases(${lines.join(', ')}) $${encoded}`;
    } else {
      return `$ ${lines.join(' \\ ')} $${encoded}`;
    }
  }

  return `$ ${(block.mathTypst ?? block.content).trim()} $${encoded}`;
}

function serializeImage(block: TypstBlock, imageIndex: number, settings: DocumentSettings): string {
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
    return `${captionLine}\n${imageLine}`;
  } else if (captionLine && settings.imageCaptionPosition === 'below') {
    return `${imageLine}\n${captionLine}`;
  }
  
  return imageLine;
}

function serializeChart(block: TypstBlock): string {
  const payload = safeParseChartPayload(block.content ?? '');
  const imageUrl = (payload.imageUrl ?? '').trim();
  const encoded = `${LF_CHART_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;

  if (!imageUrl) {
    return `#align(center)[(未生成图表)]${encoded}`;
  }

  const width = block.width || '100%';
  const imageLine = `#align(center, image("${imageUrl}", width: ${width}, height: auto))${encoded}`;
  return imageLine;
}

function serializeList(block: TypstBlock): string {
  return block.content.split('\n').map(line => `- ${line}`).join('\n');
}

function serializeTable(block: TypstBlock, tableIndex: number, settings: DocumentSettings): string {
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
  return `${captionLine}${tableLine}`;
}
