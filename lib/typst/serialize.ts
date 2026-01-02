import { TypstBlock, DocumentSettings, defaultDocumentSettings, PersistedMathPayload, PersistedTableCell } from './types';
import {
  LF_MATH_MARKER, LF_TABLE_MARKER, LF_IMAGE_MARKER, LF_CHART_MARKER,
  base64EncodeUtf8,
  defaultParagraphLeadingEm, snapLineSpacingMultiplier, leadingEmFromMultiplier,
  inlineToSingleLine, safeParseTablePayload, safeParseChartPayload,
  convertMixedParagraph, sanitizeTypstInlineMath, sanitizeTypstMathSegment,
  LF_ANSWER_MARKER
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
  let body = `${'='.repeat(level)} ${block.content}`;

  // Apply font if set (default is SimSun, don't output if default)
  const font = (block.font ?? 'SimSun').trim();
  const align = block.align;

  // Typst syntax for heading styling is a bit different.
  // We can't wrap `#= Heading` inside `#align` or `#text` directly effectively for the structure.
  // BUT valid Typst allows `#align(center)[= Heading]` which aligns the heading node itself.

  // Apply settings
  if (font) {
    // For headings, font is usually set via show rule, but we can wrap the content if needed?
    // Actually `#text(font: "...")` around the heading content works but might be stripped by the heading structure parsing.
    // Safer way for inline heading style: `= #text(font: "...")[Heading Content]`
    body = `${'='.repeat(level)} #text(font: "${font}")[${block.content}]`;
  }

  // Apply alignment
  if (align && align !== 'left') {
    // Wrap the entire heading in align
    body = `#align(${align})[${body}]`;
  }

  return body;
}

function serializeParagraph(block: TypstBlock): string {
  const raw = block.content ?? '';
  const isAnswerBlank = !!block.placeholder && raw.replace(/\u200B/g, '').trim().length === 0;
  let body = sanitizeTypstInlineMath(convertMixedParagraph(raw));

  if (isAnswerBlank) {
    // Stylized placeholder box
    const placeholderBlock = `#block(
  width: 100%,
  height: 2em,
  fill: rgb("#EFF6FF"), // Light blue bg
  stroke: (paint: rgb("#BFDBFE"), dash: "dashed"), // Blue dashed border
  radius: 4pt,
  inset: 8pt,
  above: 12pt,
  below: 12pt
)[
  #align(center + horizon)[
    #text(fill: rgb("#93C5FD"), size: 0.9em)[( 请在此处填写答案 )]
  ]
]${LF_ANSWER_MARKER}`;

    // If it has leading setting (rare for empty block), wrap it? usually not needed for block.
    // Typst blocks handle their own spacing (above/below).
    return placeholderBlock;
  }

  const multiplierRaw = typeof block.lineSpacing === 'number' && Number.isFinite(block.lineSpacing)
    ? block.lineSpacing
    : undefined;
  const multiplier = typeof multiplierRaw === 'number' ? snapLineSpacingMultiplier(multiplierRaw) : undefined;

  // Apply font if set (default is SimSun, don't output if default)
  const font = (block.font ?? 'SimSun').trim();
  if (font) {
    body = `#text(font: "${font}")[${body}]`;
  }

  // Apply alignment if set (default is left, don't output if default)
  const align = block.align;
  if (align && align !== 'left') {
    body = `#align(${align})[${body}]`;
  }

  if (typeof multiplier === 'number') {
    const leadingEm = leadingEmFromMultiplier(multiplier);
    return `#set par(leading: ${leadingEm}em)\n${body}\n#set par(leading: ${defaultParagraphLeadingEm}em)`;
  }

  return `${body}`;
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

  return `$ ${sanitizeTypstMathSegment((block.mathTypst ?? block.content).trim())} $${encoded}`;
}

function serializeImage(block: TypstBlock, imageIndex: number, settings: DocumentSettings): string {
  const width = block.width || '50%';
  const height = 'auto';
  const align = block.align || 'center';
  const captionRaw = (block.caption ?? '').trim();
  const label = settings.imageCaptionNumbering ? `图${imageIndex} ` : '';
  const captionText = (label + captionRaw).trim() ? (label + captionRaw) : '';
  const payload = {
    caption: block.caption ?? '',
    width,
    height,
  };
  const encoded = `${LF_IMAGE_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;
  const alignValue = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';

  // If image path is empty, output a placeholder text instead of image("") which causes compilation error
  const imagePath = (block.content ?? '').trim();
  if (!imagePath) {
    const placeholderText = captionText || '(待上传图片)';
    return `#align(${alignValue})[${placeholderText}]${encoded}`;
  }

  // Check if the path looks like a placeholder or hallucinated path that won't exist
  // Valid paths should already exist in the project's images folder
  // Hallucinated paths often have Chinese characters or non-standard patterns
  const isLikelyHallucinated = (path: string): boolean => {
    // Check for common hallucination patterns:
    // 1. Chinese characters in filename (DeepSeek often invents these)
    // 2. Paths that don't start with /static/projects/ but look like static paths
    // 3. Placeholder-like names
    const hasChineseInFilename = /[\u4e00-\u9fa5]/.test(path.split('/').pop() || '');
    const looksLikePlaceholder = /\[\[.*\]\]|待.*图|占位/.test(path);
    const hasIllegalChars = /[<>"|?*]/.test(path);
    return hasChineseInFilename || looksLikePlaceholder || hasIllegalChars;
  };

  // Explicitly handle [[IMAGE_PLACEHOLDER...]] tags as a valid placeholder state
  // Relaxed regex to catch various spacing or casing
  if (/\[\[\s*IMAGE_PLACEHOLDER/i.test(imagePath)) {
    // Extract hint text if possible, otherwise default
    const match = imagePath.match(/\[\[\s*IMAGE_PLACEHOLDER\s*:\s*(.*?)\s*\]\]/i);
    // For placeholders, we use a single-line block to avoid parsing issues / newline replacement loops
    // caused by typstToBlocks treating unknown multi-line blocks as paragraphs.
    const hint = match ? match[1] : '(点击此处上传图片)';
    const placeholderText = hint || '图片占位符';
    const textContent = `#text(fill: rgb("#3B82F6"), weight: "bold", size: 1.5em)[+] #text(fill: rgb("#3B82F6"), size: 0.9em)[${placeholderText}]`;
    // Use the selected alignment (alignValue) instead of hardcoded center
    const blockContent = `#align(${alignValue} + horizon)[${textContent}]`;

    // We explicitly store the 'src' (block.content) in the payload so the parser can restore the 
    // [[IMAGE_PLACEHOLDER]] value even though it's not in the visual Typst code (which only shows the hint).
    const payload = {
      caption: block.caption,
      width: block.width,
      height: block.height,
      src: block.content
    };
    const encoded = `/*LF_IMAGE:${base64EncodeUtf8(JSON.stringify(payload))}*/`;

    // Compact single-line block - use alignValue for the outer #align as well
    return `#align(${alignValue})[#block(width: ${width}, height: 8em, fill: rgb("#EFF6FF"), stroke: rgb("#93C5FD"), radius: 4pt, inset: 12pt)[${blockContent}]]${encoded}`;
  }

  // If path looks hallucinated, output a styled placeholder instead
  if (isLikelyHallucinated(imagePath)) {
    const warningText = captionText || '(图片路径无效)';
    const pathDisplay = imagePath.length > 60 ? imagePath.slice(0, 60) + '...' : imagePath;
    return `#block(width: 100%, fill: rgb("#FEF2F2"), stroke: rgb("#FCA5A5"), inset: 12pt, radius: 4pt)[
  #align(center)[
    #text(fill: rgb("#DC2626"), weight: "bold")[图片缺失]
    #linebreak()
    #text(size: 0.8em, fill: rgb("#991B1B"))[路径: ${pathDisplay}]
  ]
]${encoded}`;
  }

  const imageLine = `#align(${alignValue}, image("${imagePath}", width: ${width}, height: ${height}))${encoded}`;
  const captionLine = captionText ? `#align(${alignValue})[${captionText}]` : '';

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
  const align = block.align || 'center';
  const alignValue = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';

  if (!imageUrl) {
    return `#align(${alignValue})[(未生成图表)]${encoded}`;
  }

  const width = block.width || '50%';
  const imageLine = `#align(${alignValue}, image("${imageUrl}", width: ${width}, height: auto))${encoded}`;
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
  const width = block.width || '50%';

  // Evenly distribute column widths within the table width.
  const columns = `(${Array.from({ length: Math.max(1, cols) }, () => '1fr').join(', ')})`;

  const stroke = style === 'three-line'
    ? `stroke: (x: 0pt, y: 0pt), table.hline(y: 0, stroke: 1.6pt), table.hline(y: 1, stroke: 0.8pt), table.hline(y: ${rows}, stroke: 1.6pt)`
    : 'stroke: 0.8pt';

  // Default table cell alignment: left horizontally, centered vertically.
  // In Typst's alignment system, `center` is horizontal center, and `horizon` is vertical center.
  const align = 'align: left + horizon';

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
  // Use #table directly inside #align, with width on individual columns or wrap table in a box.
  // Correct Typst syntax: #align(center)[#block(width: ...)[#table(...)]]
  const tableLine = `#align(center)[#block(width: ${width})[#table(columns: ${columns}, ${align}, ${stroke}, ${flatArgs.join(', ')})]]${encoded}`;
  return `${captionLine}${tableLine}`;
}
