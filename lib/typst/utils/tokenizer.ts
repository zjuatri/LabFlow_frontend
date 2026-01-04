
export type LineKind = 'bullet' | 'ordered' | 'text';

export type ParagraphToken =
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
        const innerClean = parts.inner.replace(/^\s*\d+[.)]\s+/, '');
        return `${parts.prefix}${innerClean.trim()}]`;
    }

    const inner = parts.inner.replace(/^\s*[-*]\s+/, '');
    return `${parts.prefix}${inner.trim()}]`;
};

// Tokenize a paragraph string into #text runs, #linebreak() tokens, and raw text.
export const tokenizeParagraphMarkup = (content: string): ParagraphToken[] => {
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

            if (parenDepth !== 0) {
                pushRaw(s.slice(start));
                break;
            }

            while (i < s.length && isWhitespace(s[i])) i++;

            if (s[i] !== '[') {
                pushRaw(s.slice(start, i));
                continue;
            }

            let bracketDepth = 0;
            while (i < s.length) {
                const ch = s[i];
                if (ch === '[') bracketDepth++;
                else if (ch === ']') {
                    bracketDepth--;
                    if (bracketDepth === 0) {
                        i++;
                        break;
                    }
                }
                i++;
            }

            const run = s.slice(start, i);
            tokens.push({ kind: 'textRun', text: run });
            continue;
        }

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

export const splitParagraphMarkupIntoLines = (content: string): string[] => {
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
    const trimmed = line.trim();
    const inner = extractInnerText(trimmed);
    if (/^[-*]\s+/.test(inner) || /^[-*]$/.test(inner)) return 'bullet';
    if (/^\d+[.)]\s+/.test(inner) || /^\d+[.)]$/.test(inner)) return 'ordered';
    return 'text';
};

export const detectLineKind = (line: string): LineKind => visiblePrefixKind(line);

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

export const convertMixedParagraph = (content: string): string => {
    const lines = splitParagraphMarkupIntoLines(content);
    if (lines.length === 0) return '';

    type Segment = { kind: LineKind; lines: string[] };
    const segments: Segment[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') continue;

        const kind = visiblePrefixKind(trimmed);
        const lastSegment = segments[segments.length - 1];

        const isListKind = kind === 'bullet' || kind === 'ordered';
        const lastIsListKind = lastSegment && (lastSegment.kind === 'bullet' || lastSegment.kind === 'ordered');

        if (lastSegment && ((isListKind && lastIsListKind && lastSegment.kind === kind) || (!isListKind && !lastIsListKind))) {
            lastSegment.lines.push(trimmed);
        } else {
            segments.push({ kind, lines: [trimmed] });
        }
    }

    if (segments.length === 0) return '';

    const parts: string[] = [];
    for (const seg of segments) {
        if (seg.kind === 'text') {
            parts.push(seg.lines.join(' #linebreak() '));
        } else {
            if (seg.kind === 'ordered' && seg.lines.length === 1) {
                const visible = extractInnerText(seg.lines[0]);
                const numMatch = visible.match(/^(\d+)[.)]/);
                const startNum = numMatch ? parseInt(numMatch[1], 10) : 1;
                if (startNum !== 1) {
                    parts.push(seg.lines[0]);
                    continue;
                }
            }

            const items = seg.lines.map((l) => {
                const line = l.trim();
                if (seg.kind === 'ordered') {
                    const stripped = stripLeadingPrefixFromTextRun(line, 'ordered');
                    const visible = extractInnerText(line);
                    const m = visible.match(/^\d+[.)]\s*([\s\S]*)$/);
                    const after = (m?.[1] ?? '').trim();
                    if (after.length === 0) return '';
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
            const children = normalized.map((x) => (x ? `[${x}]` : `[#h(0pt)]`)).join('');
            const listExpr = seg.kind === 'ordered'
                ? `#enum(tight: true)${children}`
                : `#list(tight: true)${children}`;

            parts.push(listExpr);
        }
    }

    return parts.join('\n');
};
