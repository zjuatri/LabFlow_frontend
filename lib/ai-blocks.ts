import { type DocumentSettings, defaultDocumentSettings, type TypstBlock } from '@/lib/typst';
import { latexToTypstMath } from './math-convert';

export type AiBlocksResponse = {
  settings?: Partial<DocumentSettings> | null;
  blocks?: unknown;
};

type NormalizeResult = {
  settings: DocumentSettings;
  blocks: TypstBlock[];
};

const allowedTypes = new Set<TypstBlock['type']>([
  'heading',
  'paragraph',
  'code',
  'math',
  'image',
  'list',
  'table',
  'chart',
]);

const ANSWER_PLACEHOLDER = '在此填写答案...';
const ZWSP = '\u200B';
const ANSWER_MARKERS = new Set(['[[ANSWER]]', '[ANSWER]', '<ANSWER>', '{{ANSWER}}', '<<ANSWER>>']);
// Pattern to detect Chinese placeholder phrases or standard placeholder patterns
const ANSWER_MARKER_REGEX = /^\[\[.*(?:PLACEHOLDER|待填写|待补充|待完成).*\]\]$|^（?请?在此.*填写.*）?$/i;

function isAnswerMarkerContent(content: string): boolean {
  const trimmed = content.trim();
  if (ANSWER_MARKERS.has(trimmed)) return true;
  if (ANSWER_MARKER_REGEX.test(trimmed)) return true;
  return false;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asAlign(v: unknown): 'left' | 'center' | 'right' | null {
  return v === 'left' || v === 'center' || v === 'right' ? v : null;
}

function normalizeSettings(raw: unknown): DocumentSettings {
  const base: DocumentSettings = { ...defaultDocumentSettings };
  if (!isObject(raw)) return base;

  const tableCaptionNumbering = raw.tableCaptionNumbering;
  const imageCaptionNumbering = raw.imageCaptionNumbering;
  const imageCaptionPosition = raw.imageCaptionPosition;

  return {
    tableCaptionNumbering: typeof tableCaptionNumbering === 'boolean' ? tableCaptionNumbering : base.tableCaptionNumbering,
    imageCaptionNumbering: typeof imageCaptionNumbering === 'boolean' ? imageCaptionNumbering : base.imageCaptionNumbering,
    imageCaptionPosition:
      imageCaptionPosition === 'above' || imageCaptionPosition === 'below' ? imageCaptionPosition : base.imageCaptionPosition,
  };
}

function nextIdFactory(existing: Set<string>) {
  let i = 1;
  return () => {
    let id = '';
    do {
      id = `ai-${i++}`;
    } while (existing.has(id));
    existing.add(id);
    return id;
  };
}

function stringifyPayload(obj: unknown): string {
  // Stable behavior: stringify with minimal whitespace.
  return JSON.stringify(obj ?? {});
}

function normalizeListToOrderedParagraph(rawList: unknown): string {
  // Models sometimes output a dedicated `list` block with newline-separated items.
  // Our editor renders true HTML lists when lines are prefixed with `- ` or `1. `.
  // User expectation: if the original content is numbered, keep it as an ordered list.
  // When ambiguous, ordered list is acceptable and more structured.
  if (typeof rawList !== 'string') return '';

  const text = rawList.replace(/\r\n/g, '\n');
  const rawLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const cnToInt = (cn: string): number | null => {
    // Minimal mapping for common cases (1-20). Extend if needed.
    const map: Record<string, number> = {
      '一': 1,
      '二': 2,
      '三': 3,
      '四': 4,
      '五': 5,
      '六': 6,
      '七': 7,
      '八': 8,
      '九': 9,
      '十': 10,
      '十一': 11,
      '十二': 12,
      '十三': 13,
      '十四': 14,
      '十五': 15,
      '十六': 16,
      '十七': 17,
      '十八': 18,
      '十九': 19,
      '二十': 20,
    };
    return map[cn] ?? null;
  };

  const normalizeLine = (line: string, fallbackIndex: number): { kind: 'ordered' | 'bullet' | 'plain'; line: string } => {
    // Bullet
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      return { kind: 'bullet', line: `- ${bulletMatch[1].trim()}` };
    }

    // Ordered: 1. / 1) / 1、 / 1． / （1） / (1)
    const arabicMatch = line.match(/^(?:\(?|（)?(\d+)(?:\)|）)?[\.|．|、|\)]\s*(.+)$/);
    if (arabicMatch) {
      const n = parseInt(arabicMatch[1] ?? '', 10);
      const rest = (arabicMatch[2] ?? '').trim();
      if (Number.isFinite(n) && rest) return { kind: 'ordered', line: `${n}. ${rest}` };
    }

    // Ordered: 一、 二、 ...
    const cnMatch = line.match(/^([一二三四五六七八九十]+)、\s*(.+)$/);
    if (cnMatch) {
      const n = cnToInt((cnMatch[1] ?? '').trim());
      const rest = (cnMatch[2] ?? '').trim();
      if (n && rest) return { kind: 'ordered', line: `${n}. ${rest}` };
    }

    // Plain line -> will be numbered later if we decide ordered.
    return { kind: 'plain', line: line.trim() };
  };

  const normalized = rawLines.map((l, i) => normalizeLine(l, i + 1));
  const hasBullet = normalized.some((x) => x.kind === 'bullet');
  const hasOrdered = normalized.some((x) => x.kind === 'ordered');

  // If any bullet lines exist and no ordered markers exist, keep bullets.
  if (hasBullet && !hasOrdered) {
    return normalized
      .map((x) => (x.kind === 'bullet' ? x.line : `- ${x.line}`))
      .join('\n');
  }

  // Default: ordered list.
  let counter = 1;
  return normalized
    .map((x) => {
      if (x.kind === 'ordered') return x.line;
      if (x.kind === 'bullet') {
        const rest = x.line.replace(/^[-*]\s+/, '').trim();
        const n = counter++;
        return `${n}. ${rest}`;
      }
      const n = counter++;
      return `${n}. ${x.line}`;
    })
    .join('\n');
}

function looksLikeMultiLineListParagraph(text: string): boolean {
  // Heuristic: if a paragraph contains multiple non-empty lines, it's usually a list
  // (e.g., 实验目的 1/2/3/4). Converting to an ordered list is acceptable and improves structure.
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.includes('\n')) return false;
  if (normalized.includes('\n\n')) return false;

  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return false;
  if (lines.length > 30) return false;
  if (lines.some((l) => l.length > 200)) return false;

  return true;
}

function normalizeBlockMany(raw: unknown, getNextId: () => string, projectId: string): TypstBlock[] {
  if (!isObject(raw)) {
    console.warn('[normalizeBlockMany] skipped non-object:', raw);
    return [];
  }

  const type = asString(raw.type);
  if (!type || !allowedTypes.has(type as TypstBlock['type'])) {
    console.warn('[normalizeBlockMany] skipped invalid type:', type, 'raw:', raw);
    return [];
  }

  // Debug: log table blocks
  if (type === 'table') {
    console.log('[normalizeBlockMany] processing table block:', (raw as Record<string, unknown>).id);
  }

  const id = asString(raw.id) ?? getNextId();
  const content = asString(raw.content) ?? '';

  const level = asNumber(raw.level);
  const language = asString(raw.language);
  const width = asString(raw.width);
  const height = asString(raw.height);
  const align = asAlign(raw.align);
  const caption = asString(raw.caption);
  const lineSpacing = asNumber(raw.lineSpacing);

  const mathFormat = raw.mathFormat === 'latex' || raw.mathFormat === 'typst' ? raw.mathFormat : undefined;
  const mathLatex = asString(raw.mathLatex);
  const mathTypst = asString(raw.mathTypst);
  const mathBrace = typeof raw.mathBrace === 'boolean' ? raw.mathBrace : undefined;

  const mathLines = Array.isArray(raw.mathLines)
    ? raw.mathLines
      .map((x) => {
        if (!isObject(x)) return null;
        const latex = asString(x.latex) ?? '';
        const typst = asString(x.typst) ?? '';
        return { latex, typst };
      })
      .filter((x): x is { latex: string; typst: string } => !!x)
    : undefined;

  // Friendly payload formats (recommended): tablePayload / chartPayload.
  const tablePayload = (raw as Record<string, unknown>).tablePayload;
  const chartPayload = (raw as Record<string, unknown>).chartPayload;

  // Compatibility: convert unsupported/ambiguous list blocks into bullet paragraphs.
  let normalizedType: TypstBlock['type'] = type as TypstBlock['type'];
  let finalContent = content;

  // Explicit answer marker emitted by prompt: convert to an editable blank.
  // Keep a zero-width space so it survives stringify/typst round-trips.
  if (normalizedType === 'paragraph' && isAnswerMarkerContent(finalContent)) {
    return [
      {
        id,
        type: 'paragraph',
        content: ZWSP,
        placeholder: ANSWER_PLACEHOLDER,
      },
    ];
  }

  if (normalizedType === 'list') {
    normalizedType = 'paragraph';
    finalContent = normalizeListToOrderedParagraph(finalContent);
  }

  if (type === 'table' && tablePayload !== undefined) {
    finalContent = stringifyPayload(tablePayload);
  }
  if (type === 'chart' && chartPayload !== undefined) {
    finalContent = stringifyPayload(chartPayload);
  }

  if (type === 'image') {
    // Enforce project-scoped static path. AI may output <project_id> placeholder.
    const expectedPrefix = `/static/projects/${projectId}/images/`;
    const placeholderPrefix = `/static/projects/<project_id>/images/`;

    let url = finalContent.trim();

    // Allow [[IMAGE_PLACEHOLDER...]] patterns through - these are valid placeholders
    if (/^\[\[\s*IMAGE_PLACEHOLDER/i.test(url)) {
      finalContent = url;
    } else {
      if (url.startsWith(placeholderPrefix)) {
        url = url.replace(placeholderPrefix, expectedPrefix);
      }
      url = url.split('?')[0];

      if (!url.startsWith(expectedPrefix)) {
        // Reject unsafe image urls.
        console.warn('[normalizeBlockMany] rejected image with invalid path:', url);
        return [];
      }
      finalContent = url;
    }
  }

  // NOTE: No heuristics/guessing here.
  // - “阐述型有序列表” vs “问答型有序列表” is decided by the model following the prompt.
  // - Question answer blanks must be emitted explicitly as a standalone paragraph: [[ANSWER]].

  const out: TypstBlock = {
    id,
    type: normalizedType,
    content: finalContent,
  };

  if (out.type === 'heading' && typeof level === 'number') out.level = Math.max(1, Math.min(6, Math.round(level)));
  if (language) out.language = language;
  if (width) out.width = width;
  if (height) out.height = height;
  if (align) out.align = align;
  if (caption !== null) out.caption = caption;
  if (typeof lineSpacing === 'number') out.lineSpacing = lineSpacing;

  if (out.type === 'math') {
    if (mathFormat) out.mathFormat = mathFormat;
    if (mathLatex !== null) out.mathLatex = mathLatex;

    // Auto-convert LaTeX to Typst if missing (AI enforced to output LaTeX)
    if (mathTypst !== null) {
      out.mathTypst = mathTypst;
    } else if (mathLatex !== null && (!mathFormat || mathFormat === 'latex')) {
      // Lazy import or import at top? We need to import at top. 
      // Since I cannot change top imports easily with this tool without context, 
      // I assume I will add the import in a separate step or I'll use require? 
      // Next.js client component... standard import is better. 
      // Wait, I can't use replace_file_content to add import easily if I don't target the top.
      // I'll assume I will add the import line in another call or just use a full file replacement logic if needed?
      // Actually I can just add the logic assuming the import exists, and then add the import.
      out.mathTypst = latexToTypstMath(mathLatex);
    }

    if (mathLines) {
      out.mathLines = mathLines.map(line => ({
        latex: line.latex,
        typst: line.typst || (line.latex ? latexToTypstMath(line.latex) : '')
      }));
    }
    if (typeof mathBrace === 'boolean') out.mathBrace = mathBrace;
  }

  return [out];
}

export function extractJsonFromModelText(text: string): unknown {
  // Models sometimes wrap JSON with extra text; try best-effort extraction.
  // 1) If it's already valid JSON, return it.
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  // 2) Try to extract the first top-level JSON object.
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // ignore
    }
  }

  throw new Error('AI 输出不是可解析的 JSON（请确保只输出 JSON）');
}

export function normalizeAiBlocksResponse(args: {
  raw: unknown;
  projectId: string;
}): NormalizeResult {
  const { raw, projectId } = args;

  if (!isObject(raw)) {
    throw new Error('AI 输出 JSON 根节点必须是对象');
  }

  const settings = normalizeSettings(raw.settings);

  const blocksRaw = raw.blocks;
  if (!Array.isArray(blocksRaw)) {
    throw new Error('AI 输出 JSON 必须包含 blocks 数组');
  }

  const ids = new Set<string>();
  for (const b of blocksRaw) {
    if (isObject(b)) {
      const id = asString(b.id);
      if (id) ids.add(id);
    }
  }
  const getNextId = nextIdFactory(ids);

  const blocks: TypstBlock[] = [];
  for (const b of blocksRaw) {
    const nb = normalizeBlockMany(b, getNextId, projectId);
    if (Array.isArray(nb) && nb.length > 0) {
      blocks.push(...nb);
    } else {
      console.warn('[normalizeAiBlocksResponse] block returned empty:', b);
    }
  }

  // Debug: log all table blocks
  const tableBlocks = blocks.filter(b => b.type === 'table');
  console.log('[normalizeAiBlocksResponse] total blocks:', blocks.length, 'table blocks:', tableBlocks.length);
  tableBlocks.forEach(tb => console.log('  table id:', tb.id, 'content length:', tb.content?.length));

  if (blocks.length === 0) {
    throw new Error('AI 输出的 blocks 均无效（请检查 type/id/content 字段）');
  }

  return { settings, blocks };
}
