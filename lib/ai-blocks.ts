import { type DocumentSettings, defaultDocumentSettings, type TypstBlock } from '@/lib/typst';

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

function normalizeBlock(raw: unknown, getNextId: () => string, projectId: string): TypstBlock | null {
  if (!isObject(raw)) return null;

  const type = asString(raw.type);
  if (!type || !allowedTypes.has(type as TypstBlock['type'])) return null;

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

  let finalContent = content;

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
    if (url.startsWith(placeholderPrefix)) {
      url = url.replace(placeholderPrefix, expectedPrefix);
    }
    url = url.split('?')[0];

    if (!url.startsWith(expectedPrefix)) {
      // Reject unsafe image urls.
      return null;
    }
    finalContent = url;
  }

  const out: TypstBlock = {
    id,
    type: type as TypstBlock['type'],
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
    if (mathTypst !== null) out.mathTypst = mathTypst;
    if (mathLines) out.mathLines = mathLines;
    if (typeof mathBrace === 'boolean') out.mathBrace = mathBrace;
  }

  return out;
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
    const nb = normalizeBlock(b, getNextId, projectId);
    if (nb) blocks.push(nb);
  }

  if (blocks.length === 0) {
    throw new Error('AI 输出的 blocks 均无效（请检查 type/id/content 字段）');
  }

  return { settings, blocks };
}
