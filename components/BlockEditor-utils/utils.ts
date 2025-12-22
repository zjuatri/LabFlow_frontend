import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';

export const INLINE_MATH_LATEX_MARKER = '/*LF_LATEX:';

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const base64EncodeUtf8 = (input: string): string => {
  const utf8 = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return btoa(utf8);
};

export const base64DecodeUtf8 = (input: string): string => {
  const bin = atob(input);
  const percent = Array.from(bin)
    .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`)
    .join('');
  return decodeURIComponent(percent);
};

export const findMatching = (input: string, start: number, open: string, close: string) => {
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
};

export const generateInlineMathId = () => `im-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

type InlineLineKind = 'text' | 'bullet' | 'ordered';

const textRunPrefixAndInner = (run: string): { prefix: string; inner: string } | null => {
  const m = run.match(/^(#text\([^)]*\)\[)([\s\S]*)(\])$/);
  if (!m) return null;
  return { prefix: m[1], inner: m[2] };
};

const extractVisibleLeadingText = (line: string): string => {
  const trimmed = (line ?? '').trim();
  const parts = textRunPrefixAndInner(trimmed);
  if (parts) return parts.inner.trim();
  return trimmed;
};

const detectInlineLineKind = (line: string): InlineLineKind => {
  const inner = extractVisibleLeadingText(line);
  if (/^[-*]\s+/.test(inner) || /^[-*]$/.test(inner)) return 'bullet';
  if (/^\d+[.)]\s+/.test(inner) || /^\d+[.)]$/.test(inner)) return 'ordered';
  return 'text';
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

// Split inline Typst markup into logical lines without breaking #text(...)[...] runs.
// Treat both real newlines and #linebreak() as hard line boundaries.
const splitInlineMarkupIntoLines = (content: string): string[] => {
  const s = (content ?? '').replace(/\r\n/g, '\n');
  const lines: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const joined = current.join(' ').trim();
    lines.push(joined);
    current = [];
  };

  const pushTokenText = (text: string) => {
    const t = text.trim();
    if (!t) return;
    current.push(t);
  };

  let i = 0;
  while (i < s.length) {
    if (s.startsWith('#linebreak()', i)) {
      flush();
      i += '#linebreak()'.length;
      continue;
    }

    const ch = s[i];
    if (ch === '\n') {
      flush();
      i++;
      continue;
    }

    if (s.startsWith('#text(', i)) {
      const start = i;
      const parenStart = i + '#text'.length;
      if (s[parenStart] !== '(') {
        pushTokenText(s[i]);
        i++;
        continue;
      }

      const parenEnd = findMatching(s, parenStart, '(', ')');
      if (parenEnd === -1) {
        // malformed, treat as raw
        pushTokenText(s.slice(i));
        break;
      }

      let after = parenEnd + 1;
      while (after < s.length && /\s/.test(s[after])) after++;
      if (s[after] !== '[') {
        pushTokenText(s.slice(start, after));
        i = after;
        continue;
      }

      const bracketEnd = findMatching(s, after, '[', ']');
      if (bracketEnd === -1) {
        pushTokenText(s.slice(start));
        break;
      }

      const run = s.slice(start, bracketEnd + 1);
      const parts = textRunPrefixAndInner(run);
      if (parts && parts.inner.includes('#linebreak()')) {
        const innerPieces = parts.inner.split(/\s*#linebreak\(\)\s*/).map((p) => p.trim());
        for (let idx = 0; idx < innerPieces.length; idx++) {
          const piece = innerPieces[idx];
          if (idx > 0) flush();
          if (piece) pushTokenText(`${parts.prefix}${piece}]`);
          else pushTokenText(`${parts.prefix}]`);
        }
      } else {
        pushTokenText(run);
      }

      i = bracketEnd + 1;
      continue;
    }

    // raw chunk until next special token
    const nextText = s.indexOf('#text(', i);
    const nextLb = s.indexOf('#linebreak()', i);
    const nextNl = s.indexOf('\n', i);
    const next = [nextText, nextLb, nextNl].filter((n) => n >= 0).sort((a, b) => a - b)[0];
    if (typeof next === 'number' && next >= 0) {
      pushTokenText(s.slice(i, next));
      i = next;
    } else {
      pushTokenText(s.slice(i));
      break;
    }
  }

  // Keep a stable representation: if the input ends with a linebreak, we want an empty final line.
  // Our flush() pushes even empty strings.
  if (current.length > 0) flush();
  // Remove the trailing empty line when content doesn't end with a boundary.
  while (lines.length > 0 && lines[lines.length - 1] === '' && !/[\n]$/.test(s) && !s.trimEnd().endsWith('#linebreak()')) {
    lines.pop();
  }
  // If everything was empty, return a single empty line.
  if (lines.length === 0) return [''];
  return lines;
};

export const typstInlineToHtml = (typst: string): string => {
  const s = typst ?? '';

  const parse = (input: string): string => {
    let out = '';
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (input.startsWith('#linebreak()', i)) {
        out += '<br/>';
        i += '#linebreak()'.length - 1;
        continue;
      }

      if (ch === '\n') {
        out += '<br/>';
        continue;
      }

      // #strike[...]
      if (input.startsWith('#strike[', i)) {
        const openIdx = i + '#strike'.length;
        if (input[openIdx] === '[') {
          const end = findMatching(input, openIdx, '[', ']');
          if (end !== -1) {
            const inner = input.slice(openIdx + 1, end);
            out += `<span style="text-decoration: line-through;">${parse(inner)}</span>`;
            i = end;
            continue;
          }
        }
      }

      // #text(fill: rgb("#RRGGBB"))[...]
      if (input.startsWith('#text(', i)) {
        const parenStart = i + '#text'.length;
        if (input[parenStart] === '(') {
          const parenEnd = findMatching(input, parenStart, '(', ')');
          if (parenEnd !== -1) {
            const args = input.slice(parenStart + 1, parenEnd);
            const after = parenEnd + 1;

            const bracketStart = input[after] === '[' ? after : -1;
            if (bracketStart !== -1) {
              const bracketEnd = findMatching(input, bracketStart, '[', ']');
              if (bracketEnd !== -1) {
                const inner = input.slice(bracketStart + 1, bracketEnd);
                const colorMatch = args.match(/fill\s*:\s*rgb\(\s*"([^"]+)"\s*\)/i);
                const color = colorMatch?.[1] ?? '#000000';
                out += `<span style="color: ${escapeHtml(color)};">${parse(inner)}</span>`;
                i = bracketEnd;
                continue;
              }
            }

            // Back-compat: #text(fill: rgb("#"), [text])
            const legacy = input.slice(i, Math.min(input.length, i + 2000));
            const legacyMatch = legacy.match(/^#text\(\s*fill\s*:\s*rgb\(\s*"([^"]+)"\s*\)\s*,\s*\[([\s\S]*?)\]\s*\)/);
            if (legacyMatch) {
              const color = legacyMatch[1];
              const inner = legacyMatch[2];
              out += `<span style="color: ${escapeHtml(color)};">${parse(inner)}</span>`;
              i += legacyMatch[0].length - 1;
              continue;
            }
          }
        }
      }

      // *bold*
      if (ch === '*') {
        const end = input.indexOf('*', i + 1);
        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          out += `<strong>${parse(inner)}</strong>`;
          i = end;
          continue;
        }
      }

      // _italic_
      if (ch === '_') {
        const end = input.indexOf('_', i + 1);
        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          out += `<em>${parse(inner)}</em>`;
          i = end;
          continue;
        }
      }

      // $math$
      if (ch === '$') {
        const end = input.indexOf('$', i + 1);
        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          // Optional: $...$/*LF_LATEX:<base64>*/ preserves original LaTeX losslessly.
          let latex = '';
          let nextIdx = end + 1;
          if (input.startsWith(INLINE_MATH_LATEX_MARKER, nextIdx)) {
            const close = input.indexOf('*/', nextIdx);
            if (close !== -1) {
              const payload = input.slice(nextIdx + INLINE_MATH_LATEX_MARKER.length, close);
              try {
                latex = base64DecodeUtf8(payload);
              } catch {
                latex = '';
              }
              nextIdx = close + 2;
            }
          }

          const id = generateInlineMathId();
          const inferredLatex = latex || typstToLatexMath(inner);
          out += `<span class="inline-math-pill" data-inline-math-id="${escapeHtml(id)}" data-format="latex" data-typst="${escapeHtml(inner)}" data-latex="${escapeHtml(inferredLatex)}" contenteditable="false">∑</span>`;
          i = nextIdx - 1;
          continue;
        }
      }

      out += escapeHtml(ch);
    }
    return out;
  };

  const normalized = s.replace(/\r\n/g, '\n');
  const rawLines = splitInlineMarkupIntoLines(normalized);
  const lines = rawLines.map((l) => (l ?? '')).filter((l) => l !== undefined);

  // Group consecutive lines by kind so we can render real HTML lists for bullets/numbers.
  type Seg = { kind: InlineLineKind; lines: string[] };
  const segs: Seg[] = [];
  for (const line of lines) {
    const kind = detectInlineLineKind(line);
    const last = segs[segs.length - 1];
    if (!last || last.kind !== kind) segs.push({ kind, lines: [line] });
    else last.lines.push(line);
  }

  const renderTextLine = (line: string): string => {
    const html = parse(line ?? '');
    // Use div blocks so Enter behavior and line detection are stable in contentEditable.
    return html.trim() ? `<div>${html}</div>` : `<div><br/></div>`;
  };

  const stripPrefix = (line: string, kind: 'ordered' | 'bullet'): string => {
    const trimmed = (line ?? '').trim();
    const parts = textRunPrefixAndInner(trimmed);
    if (parts) return stripLeadingPrefixFromTextRun(trimmed, kind);
    if (kind === 'ordered') return trimmed.replace(/^\s*\d+[.)]\s+/, '');
    return trimmed.replace(/^\s*[-*]\s+/, '');
  };

  const renderList = (kind: 'ordered' | 'bullet', items: string[]): string => {
    if (kind === 'ordered') {
      const firstVisible = extractVisibleLeadingText(items[0] ?? '');
      const m = firstVisible.match(/^\s*(\d+)[.)]/);
      const start = m ? Math.max(1, parseInt(m[1], 10)) : 1;
      const startAttr = start !== 1 ? ` start="${start}"` : '';
      return (
        `<ol${startAttr}>` +
        items
          .map((l) => {
            const body = stripPrefix(l, 'ordered');
            const html = parse(body);
            return `<li>${html.trim() ? html : '<br/>'}</li>`;
          })
          .join('') +
        `</ol>`
      );
    }

    return (
      `<ul>` +
      items
        .map((l) => {
          const body = stripPrefix(l, 'bullet');
          const html = parse(body);
          return `<li>${html.trim() ? html : '<br/>'}</li>`;
        })
        .join('') +
      `</ul>`
    );
  };

  return segs
    .map((seg) => {
      if (seg.kind === 'text') return seg.lines.map(renderTextLine).join('');
      if (seg.kind === 'ordered') return renderList('ordered', seg.lines);
      return renderList('bullet', seg.lines);
    })
    .join('');
};

export const typstInlineToPlainText = (typst: string): string => {
  if (typeof document === 'undefined') return (typst ?? '').toString();
  const div = document.createElement('div');
  div.innerHTML = typstInlineToHtml(typst ?? '');
  return (div.textContent ?? '').replace(/\u00A0/g, ' ');
};

export const htmlToTypstInline = (root: HTMLElement): string => {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') return '\n';

    // List items are handled by the parent <ol>/<ul>, but keep this in case
    // a caller walks an <li> directly.
    if (tag === 'li') {
      return Array.from(el.childNodes).map(walk).join('');
    }

    // Handle inline math pill
    if (el.classList.contains('inline-math-pill')) {
      const typst = (el.getAttribute('data-typst') ?? '').trim();
      const latex = (el.getAttribute('data-latex') ?? '').trim();
      const resolvedTypst = typst || (latex ? latexToTypstMath(latex) : '');
      const latexMarker = latex ? `${INLINE_MATH_LATEX_MARKER}${base64EncodeUtf8(latex)}*/` : '';
      return `$${resolvedTypst}$${latexMarker}`;
    }

    const inner = Array.from(el.childNodes).map(walk).join('');

    if (tag === 'strong' || tag === 'b') {
      return `*${inner}*`;
    }
    if (tag === 'em' || tag === 'i') return `_${inner}_`;
    if (tag === 's' || tag === 'strike') return `#strike[${inner}]`;

    const style = (el.getAttribute('style') ?? '').toLowerCase();
    const colorMatch = style.match(/color\s*:\s*([^;]+)/);
    let color = colorMatch?.[1]?.trim();

    // Handle <font color="...">
    if (tag === 'font' && el.hasAttribute('color')) {
      color = el.getAttribute('color') ?? undefined;
    }

    const hasStrike = style.includes('line-through');

    let out = inner;
    if (color) {
      // Convert rgb(r, g, b) to hex if needed
      if (color.startsWith('rgb')) {
        const rgb = color.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const r = parseInt(rgb[0]).toString(16).padStart(2, '0');
          const g = parseInt(rgb[1]).toString(16).padStart(2, '0');
          const b = parseInt(rgb[2]).toString(16).padStart(2, '0');
          color = `#${r}${g}${b}`;
        }
      }
      out = `#text(fill: rgb("${color}"))[${out}]`;
    }
    if (hasStrike) {
      out = `#strike[${out}]`;
    }
    return out;
  };

  const normalize = (node: Node): string => {
    if (node.nodeType !== Node.ELEMENT_NODE) return walk(node);
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'ol' || tag === 'ul') {
      const isOrdered = tag === 'ol';
      const startAttr = isOrdered ? Number(el.getAttribute('start') || '1') : 1;
      const start = Number.isFinite(startAttr) && startAttr > 0 ? startAttr : 1;
      const items = Array.from(el.children)
        .filter((c) => (c as HTMLElement).tagName.toLowerCase() === 'li')
        .map((liEl, idx) => {
          const li = liEl as HTMLElement;
          const inner = Array.from(li.childNodes).map(normalize).join('');
          // Newlines inside an item should become inline linebreaks, not new list lines.
          const item = inner.replace(/\n+/g, ' #linebreak() ').trim();
          const prefix = isOrdered ? `${start + idx}. ` : '- ';
          return `${prefix}${item}`.trimEnd();
        });
      return '\n' + items.join('\n');
    }

    if (tag === 'div' || tag === 'p') {
      const txt = Array.from(el.childNodes).map(normalize).join('');
      return '\n' + txt;
    }
    return walk(node);
  };

  const raw = Array.from(root.childNodes).map(normalize).join('');
  return raw.replace(/^\n+/, '').replace(/\n+$/g, '');
};
