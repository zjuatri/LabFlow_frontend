import { DocumentSettings, defaultDocumentSettings, PersistedTablePayload, PersistedTableCell, TableStyle } from './types';

export const LF_MATH_MARKER = '/*LF_MATH:';
export const LF_TABLE_MARKER = '/*LF_TABLE:';
export const LF_IMAGE_MARKER = '/*LF_IMAGE:';
export const LF_DOC_MARKER = '/*LF_DOC:';

export function base64EncodeUtf8(input: string): string {
  // Browser-safe UTF-8 base64
  const utf8 = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return btoa(utf8);
}

export function base64DecodeUtf8(input: string): string {
  const bin = atob(input);
  const percent = Array.from(bin)
    .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`)
    .join('');
  return decodeURIComponent(percent);
}

export function generateId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function stripDocumentSettings(code: string): { code: string; settings: DocumentSettings } {
  const input = code ?? '';
  const m = input.match(/\/\*LF_DOC:([A-Za-z0-9+/=]+)\*\//);
  if (!m) return { code: input, settings: { ...defaultDocumentSettings } };

  let settings: DocumentSettings = { ...defaultDocumentSettings };
  try {
    const decoded = JSON.parse(base64DecodeUtf8(m[1])) as Partial<DocumentSettings>;
    settings = {
      tableCaptionNumbering: !!decoded.tableCaptionNumbering,
      imageCaptionNumbering: !!decoded.imageCaptionNumbering,
      imageCaptionPosition: decoded.imageCaptionPosition === 'above' ? 'above' : 'below',
    };
  } catch {
    settings = { ...defaultDocumentSettings };
  }

  const without = input.replace(m[0], '').replace(/^\s*\n/, '');
  return { code: without, settings };
}

export function injectDocumentSettings(code: string, settings: DocumentSettings): string {
  const stripped = stripDocumentSettings(code).code;
  const encoded = `${LF_DOC_MARKER}${base64EncodeUtf8(JSON.stringify(settings))}*/`;
  return `${encoded}\n${stripped}`;
}

export function defaultTablePayload(rows = 2, cols = 2): PersistedTablePayload {
  return {
    caption: '',
    style: 'normal',
    rows,
    cols,
    cells: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ content: '' } satisfies PersistedTableCell))
    ),
  };
}

export function safeParseTablePayload(content: string): PersistedTablePayload {
  try {
    const parsedUnknown: unknown = JSON.parse(content);

    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null;

    if (!isRecord(parsedUnknown)) return defaultTablePayload();
    const parsed = parsedUnknown;

    // Back-compat: { rows: string[][] }
    const rowsValue = parsed['rows'];
    if (Array.isArray(rowsValue) && rowsValue.every((r) => Array.isArray(r))) {
      const rowsArr: string[][] = rowsValue.map((r) =>
        (r as unknown[]).map((c) => (c ?? '').toString())
      );
      const rows = Math.max(1, rowsArr.length);
      const cols = Math.max(1, ...rowsArr.map((r) => r.length));
      const payload = defaultTablePayload(rows, cols);
      payload.cells = rowsArr.map((r) => {
        const rr = [...r];
        while (rr.length < cols) rr.push('');
        return rr.map((c) => ({ content: c }));
      });
      payload.rows = rows;
      payload.cols = cols;
      return payload;
    }

    const cellsValue = parsed['cells'];
    if (!Array.isArray(cellsValue)) return defaultTablePayload();

    const rows = Math.max(1, Number(parsed['rows']) || (cellsValue as unknown[]).length || 1);
    const firstRow = (cellsValue as unknown[])[0];
    const cols = Math.max(1, Number(parsed['cols']) || (Array.isArray(firstRow) ? firstRow.length : 1));
    const style: TableStyle = parsed['style'] === 'three-line' ? 'three-line' : 'normal';
    const caption = typeof parsed['caption'] === 'string' ? (parsed['caption'] as string) : '';

    const cells: PersistedTableCell[][] = Array.from({ length: rows }, (_, r) => {
      const rowIn = Array.isArray((cellsValue as unknown[])[r]) ? ((cellsValue as unknown[])[r] as unknown[]) : [];
      return Array.from({ length: cols }, (_, c) => {
        const cellIn = rowIn?.[c];
        if (cellIn && typeof cellIn === 'object') {
          const cellRec = cellIn as Record<string, unknown>;
          return {
            content: (cellRec['content'] ?? '').toString(),
            rowspan: cellRec['rowspan'] ? Number(cellRec['rowspan']) : undefined,
            colspan: cellRec['colspan'] ? Number(cellRec['colspan']) : undefined,
            hidden: !!cellRec['hidden'],
          };
        }
        return { content: (cellIn ?? '').toString() };
      });
    });

    return { caption, style, rows, cols, cells };
  } catch {
    return defaultTablePayload();
  }
}

export const defaultParagraphLeadingEm = 0.65;
export const supportedLineSpacingMultipliers = [0.8, 0.9, 1, 1.2, 1.5, 2] as const;

export const snapLineSpacingMultiplier = (m: number): number | undefined => {
  if (!Number.isFinite(m)) return undefined;
  let best: number = supportedLineSpacingMultipliers[0];
  let bestDiff = Math.abs(m - best);
  for (const opt of supportedLineSpacingMultipliers) {
    const d = Math.abs(m - opt);
    if (d < bestDiff) {
      bestDiff = d;
      best = opt as number;
    }
  }
  // Keep it conservative: if it's far from known options, treat as unset.
  if (bestDiff > 0.12) return undefined;
  if (best === 1) return undefined;
  return best;
};

export const leadingEmFromMultiplier = (m: number): number => {
  const v = defaultParagraphLeadingEm * m;
  return Math.round(v * 1000) / 1000;
};

export const inferLineSpacingMultiplier = (leadingEm: number): number | undefined => {
  if (!Number.isFinite(leadingEm)) return undefined;
  // If it exactly matches the default leading, treat as unset.
  if (Math.abs(leadingEm - defaultParagraphLeadingEm) < 1e-6) return undefined;

  // Legacy output used the multiplier directly as em (e.g. 1.2em).
  // New output uses defaultLeading * multiplier (e.g. 0.78em for 1.2x).
  let bestMultiplier: number | undefined = undefined;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const m of supportedLineSpacingMultipliers) {
    const legacyEm = m;
    const newEm = defaultParagraphLeadingEm * m;
    const d = Math.min(Math.abs(leadingEm - legacyEm), Math.abs(leadingEm - newEm));
    if (d < bestDiff) {
      bestDiff = d;
      bestMultiplier = m as number;
    }
  }

  if (bestDiff > 0.12) return undefined;
  if (bestMultiplier === 1) return undefined;
  return bestMultiplier;
};

export const detectParagraphListKind = (content: string): 'bullet' | 'ordered' | null => {
  const lines = (content ?? '').split(/\r?\n/);
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return null;

  const isBullet = nonEmpty.every((l) => /^[-*]\s+/.test(l));
  if (isBullet) return 'bullet';

  const isOrdered = nonEmpty.every((l) => /^\d+[.)]\s+/.test(l));
  if (isOrdered) return 'ordered';

  return null;
};

// Detect line type for mixed-content paragraph processing
// Handles both plain text and text wrapped in #text(fill: rgb(...))[...]
export type LineKind = 'bullet' | 'ordered' | 'text';

type ParagraphToken =
  | { kind: 'linebreak' }
  | { kind: 'textRun'; text: string }
  | { kind: 'raw'; text: string };

const isWhitespace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

const extractInnerText = (line: string): string => {
  const trimmed = line.trim();
  const textMatch = trimmed.match(/^#text\([^)]*\)\[([\s\S]*)\]$/);
  if (textMatch) return textMatch[1].trim();
  return trimmed;
};

const textRunPrefixAndInner = (
  run: string
): { prefix: string; inner: string } | null => {
  const m = run.match(/^(#text\([^)]*\)\[)([\s\S]*)(\])$/);
  if (!m) return null;
  return { prefix: m[1], inner: m[2] };
};

const stripLeadingPrefixFromTextRun = (run: string, kind: 'ordered' | 'bullet'): string => {
  const parts = textRunPrefixAndInner(run.trim());
  if (!parts) return run;

  if (kind === 'ordered') {
    const inner = parts.inner.replace(/^\s*\d+[.)]\s+/, '');
    return `${parts.prefix}${inner.trim()}]`;
  }

  const inner = parts.inner.replace(/^\s*[-*]\s+/, '');
  return `${parts.prefix}${inner.trim()}]`;
};

// Tokenize a paragraph string into #text runs, #linebreak() tokens, and raw text.
// This lets us split on line breaks without breaking the bracket structure.
const tokenizeParagraphMarkup = (content: string): ParagraphToken[] => {
  const s = content ?? '';
  const tokens: ParagraphToken[] = [];
  let i = 0;

  const pushRaw = (text: string) => {
    const t = text;
    if (!t) return;
    tokens.push({ kind: 'raw', text: t });
  };

  while (i < s.length) {
    if (s.startsWith('#linebreak()', i)) {
      tokens.push({ kind: 'linebreak' });
      i += '#linebreak()'.length;
      continue;
    }

    if (s.startsWith('#text(', i)) {
      const start = i;
      i += '#text('.length;
      let parenDepth = 1;
      while (i < s.length && parenDepth > 0) {
        const ch = s[i];
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        i++;
      }

      // If we didn't find the closing ')', bail out as raw.
      if (parenDepth !== 0) {
        pushRaw(s.slice(start));
        break;
      }

      // Skip whitespace
      while (i < s.length && isWhitespace(s[i])) i++;

      if (s[i] !== '[') {
        // Not a proper #text run.
        pushRaw(s.slice(start, i));
        continue;
      }

      // Parse bracket content with nesting.
      let bracketDepth = 0;
      while (i < s.length) {
        const ch = s[i];
        if (ch === '[') bracketDepth++;
        else if (ch === ']') {
          bracketDepth--;
          if (bracketDepth === 0) {
            i++; // include ']'
            break;
          }
        }
        i++;
      }

      const run = s.slice(start, i);
      tokens.push({ kind: 'textRun', text: run });
      continue;
    }

    // Raw chunk until next special token
    const nextText = s.indexOf('#text(', i);
    const nextLb = s.indexOf('#linebreak()', i);
    const next = [nextText, nextLb].filter((n) => n >= 0).sort((a, b) => a - b)[0];
    if (typeof next === 'number' && next >= 0) {
      pushRaw(s.slice(i, next));
      i = next;
    } else {
      pushRaw(s.slice(i));
      break;
    }
  }

  return tokens;
};

// Split paragraph markup into logical lines. Handles embedded #linebreak() inside a #text[...] run
// by splitting the inner content and producing multiple well-formed #text runs.
const splitParagraphMarkupIntoLines = (content: string): string[] => {
  const tokens = tokenizeParagraphMarkup(content);
  const lines: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const joined = current.join(' ').trim();
    if (joined) lines.push(joined);
    current = [];
  };

  const pushTokenText = (text: string) => {
    const t = text.trim();
    if (!t) return;
    current.push(t);
  };

  for (const tok of tokens) {
    if (tok.kind === 'linebreak') {
      flush();
      continue;
    }

    if (tok.kind === 'textRun') {
      const parts = textRunPrefixAndInner(tok.text.trim());
      if (parts && parts.inner.includes('#linebreak()')) {
        const innerPieces = parts.inner.split(/\s*#linebreak\(\)\s*/).map((p) => p.trim());
        for (let idx = 0; idx < innerPieces.length; idx++) {
          const piece = innerPieces[idx];
          if (idx > 0) flush();
          if (piece) pushTokenText(`${parts.prefix}${piece}]`);
        }
      } else {
        pushTokenText(tok.text);
      }
      continue;
    }

    // Raw text can contain real newlines and/or #linebreak(). Split on both.
    // We treat each newline as a hard line boundary.
    const newlinePieces = tok.text.split(/\r?\n/);
    for (let n = 0; n < newlinePieces.length; n++) {
      const chunk = newlinePieces[n];
      if (n > 0) flush();

      if (chunk.includes('#linebreak()')) {
        const pieces = chunk.split(/\s*#linebreak\(\)\s*/).map((p) => p.trim());
        for (let idx = 0; idx < pieces.length; idx++) {
          const piece = pieces[idx];
          if (idx > 0) flush();
          if (piece) pushTokenText(piece);
        }
      } else {
        pushTokenText(chunk);
      }
    }
  }

  flush();
  return lines;
};

const visiblePrefixKind = (line: string): LineKind => {
  // Only inspect the leading visible content of the line.
  // If it begins with a #text run, check its inner content.
  const trimmed = line.trim();
  const inner = extractInnerText(trimmed);
  if (/^[-*]\s+/.test(inner) || /^[-*]$/.test(inner)) return 'bullet';
  if (/^\d+[.)]\s+/.test(inner) || /^\d+[.)]$/.test(inner)) return 'ordered';
  return 'text';
};

export const detectLineKind = (line: string): LineKind => visiblePrefixKind(line);

// Convert a paragraph with mixed content (text + lists) into proper Typst
export const convertMixedParagraph = (content: string): string => {
  const lines = splitParagraphMarkupIntoLines(content);
  if (lines.length === 0) return '';

  // Group consecutive lines by their type
  type Segment = { kind: LineKind; lines: string[] };
  const segments: Segment[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const kind = visiblePrefixKind(trimmed);
    const lastSegment = segments[segments.length - 1];
    
    // Merge ordered and bullet together as 'list' segments for grouping purposes
    const isListKind = kind === 'bullet' || kind === 'ordered';
    const lastIsListKind = lastSegment && (lastSegment.kind === 'bullet' || lastSegment.kind === 'ordered');
    
    if (lastSegment && ((isListKind && lastIsListKind && lastSegment.kind === kind) || (!isListKind && !lastIsListKind))) {
      lastSegment.lines.push(trimmed);
    } else {
      segments.push({ kind, lines: [trimmed] });
    }
  }

  if (segments.length === 0) return '';

  // Convert each segment to Typst
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.kind === 'text') {
      // Plain text: keep original inline markup and join with explicit line breaks
      parts.push(seg.lines.join(' #linebreak() '));
    } else {
      // List segment: emit a function call (#enum/#list) so spacing/tightness is not
      // affected by markup-mode blank-line heuristics.
      const items = seg.lines.map((l) => {
        const line = l.trim();

        // Preserve original inline formatting in the item body by stripping the prefix
        // from the first #text run when present.
        if (seg.kind === 'ordered') {
          const stripped = stripLeadingPrefixFromTextRun(line, 'ordered');
          const visible = extractInnerText(line);
          const m = visible.match(/^\d+[.)]\s*([\s\S]*)$/);
          const after = (m?.[1] ?? '').trim();
          if (after.length === 0) return '';
          // If we successfully stripped inside the wrapper, use that; else fall back to plain text.
          return stripped !== line ? stripped : after;
        }

        const stripped = stripLeadingPrefixFromTextRun(line, 'bullet');
        const visible = extractInnerText(line);
        const m = visible.match(/^[-*]\s*([\s\S]*)$/);
        const after = (m?.[1] ?? '').trim();
        if (after.length === 0) return '';
        return stripped !== line ? stripped : after;
      });

      const normalized = items.map((x) => (x ?? '').replace(/\r?\n/g, ' #linebreak() ').trim());
      // For empty items, use an invisible zero-width element so nothing visible like "[]" is rendered.
      const children = normalized.map((x) => (x ? `[${x}]` : `[#h(0pt)]`)).join('');
      const listExpr = seg.kind === 'ordered'
        ? `#enum(tight: true)${children}`
        : `#list(tight: true)${children}`;

      // Don't force outer block spacing to 0; keep a normal gap to following content.
      parts.push(`#block[\n${listExpr}\n]`);
    }
  }

  return parts.join('\n');
};

export const inlineToSingleLine = (s: string): string => {
  // Table cells must not contain raw newlines, otherwise the whole `table(...)` spans
  // multiple lines and the marker-driven parser will treat fragments as paragraphs.
  // Use Typst's `linebreak()` element to preserve visual line breaks inline.
  return (s ?? '').replace(/\r?\n/g, ' #linebreak() ');
};
