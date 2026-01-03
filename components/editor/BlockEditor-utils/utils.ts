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
    // Use \s* to match prefixes with or without trailing space
    const inner = parts.inner.replace(/^\s*\d+[.)]\s*/, '');
    return `${parts.prefix}${inner.trim()}]`;
  }

  const inner = parts.inner.replace(/^\s*[-*]\s*/, '');
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

  // If the string ended with a newline character, we should have pushed an empty line for the segment after it.
  // However, the loop above consumes the newline without pushing if the next char is not found.
  // We need to check if the last character processed was a newline or linebreak.
  // But checking regex on 's' is robust.

  if (s.endsWith('\n') || s.trimEnd().endsWith('#linebreak()')) {
    // Ensure we have an empty line at the end
    if (lines.length === 0 || lines[lines.length - 1] !== '') {
      lines.push('');
    }
  }

  // Remove the trailing empty line ONLY if it's NOT due to an explicit newline boundary?
  // Actually, if we want A\n to be ['A', ''], we should keep the empty line.
  // The previous logic was:
  // while (lines.length > 0 && lines[lines.length - 1] === '' && !/[\n]$/.test(s) && !s.trimEnd().endsWith('#linebreak()')) {
  //   lines.pop();
  // }
  // This logic says: pop empty lines UNLESS the string really ends with newline.
  // So if s='A\n' (ends with \n), we should NOT pop.
  // But my manual trace `current` was empty, loop finished. `lines` was ['A'].
  // So we never pushed the empty line in the first place?
  // Ah, `flush()` only pushes `current`. If `current` is empty, it pushes nothing?
  // Nope, `pushTokenText` pushes to `current`. `flush` pushes `joined`.
  // If `\n` is hit: `flush()` happens.
  // If `s='A\n'`. 'A' -> current=['A']. `\n` -> flush() -> lines=['A'], current=[].
  // Match ends. `if (current.length > 0)` is false.
  // So `lines`=['A'].
  // We need to verify `s` ends with `\n` and push explicitly.
  // If everything was empty, return a single empty line.
  if (lines.length === 0) return [''];
  return lines;
};

/**
 * Convert Typst inline markup to HTML for display in contenteditable.
 * @param typst - The Typst markup string
 * @param opts - Optional settings
 * @param opts.skipListDetection - If true, don't auto-detect and convert numbered/bulleted lines to HTML lists.
 *                                  Use this for list-type blocks where content already has "1. xxx" format.
 */
export const typstInlineToHtml = (typst: string, opts?: { skipListDetection?: boolean }): string => {
  const s = typst ?? '';
  const skipListDetection = opts?.skipListDetection ?? false;

  const parse = (input: string, inDisplayMode = false): string => {
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

      // [[PLACEHOLDER]] detection
      if (input.startsWith('[[', i)) {
        const end = input.indexOf(']]', i);
        if (end !== -1) {
          const fullMatch = input.slice(i, end + 2);
          // Only style if it looks like a known placeholder pattern
          if (fullMatch.includes('ANSWER') || fullMatch.includes('IMAGE_PLACEHOLDER') || fullMatch.includes('PLACEHOLDER')) {
            out += `<span class="inline-block px-2 py-0.5 mx-1 rounded text-xs font-mono bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 select-all" contenteditable="false">${escapeHtml(fullMatch)}</span>`;
            i = end + 1;
            continue;
          }
        }
      }

      // #strike[...]
      if (input.startsWith('#strike[', i)) {
        const openIdx = i + '#strike'.length;
        if (input[openIdx] === '[') {
          const end = findMatching(input, openIdx, '[', ']');
          if (end !== -1) {
            const inner = input.slice(openIdx + 1, end);
            out += `<span style="text-decoration: line-through;">${parse(inner, inDisplayMode)}</span>`;
            i = end;
            continue;
          }
        }
      }

      // #underline[...]
      if (input.startsWith('#underline[', i)) {
        const openIdx = i + '#underline'.length;
        if (input[openIdx] === '[') {
          const end = findMatching(input, openIdx, '[', ']');
          if (end !== -1) {
            const inner = input.slice(openIdx + 1, end);
            // using <u> tag which is standard for execCommand('underline')
            out += `<u>${parse(inner, inDisplayMode)}</u>`;
            i = end;
            continue;
          }
        }
      }

      // #block[...] - simply unwrap
      if (input.startsWith('#block[', i) || input.startsWith('#block(', i)) {
        let start = i + '#block'.length;
        // Skip optional args (...)
        if (input[start] === '(') {
          const endArgs = findMatching(input, start, '(', ')');
          if (endArgs !== -1) {
            start = endArgs + 1;
          } else {
            // Malformed args
            out += '#block';
            i += '#block'.length - 1;
            continue;
          }
        }

        // Skip whitespace
        while (start < input.length && /\s/.test(input[start])) start++;

        if (input[start] === '[') {
          const end = findMatching(input, start, '[', ']');
          if (end !== -1) {
            const inner = input.slice(start + 1, end);
            // Recurse, result is just the inner content (block is layout mostly)
            out += parse(inner, inDisplayMode);
            i = end;
            continue;
          }
        }
      }

      // #enum / #list
      if (input.startsWith('#enum', i) || input.startsWith('#list', i)) {
        const isEnum = input.startsWith('#enum', i);
        const keyword = isEnum ? '#enum' : '#list';
        let curr = i + keyword.length;

        // Skip optional args (...)
        if (input[curr] === '(') {
          const endArgs = findMatching(input, curr, '(', ')');
          if (endArgs !== -1) {
            curr = endArgs + 1;
          } else {
            out += keyword;
            i += keyword.length - 1;
            continue;
          }
        }

        // Look for sequence of [...]
        const items: string[] = [];
        let matchedAny = false;

        while (true) {
          // Skip whitespace
          let scan = curr;
          while (scan < input.length && /\s/.test(input[scan])) scan++;

          if (scan < input.length && input[scan] === '[') {
            const end = findMatching(input, scan, '[', ']');
            if (end !== -1) {
              const inner = input.slice(scan + 1, end);
              items.push(inner);
              curr = end + 1;
              matchedAny = true;
              continue;
            }
          }
          break;
        }

        if (matchedAny) {
          const tag = isEnum ? 'ol' : 'ul';
          const listItems = items.map(item => `<li>${parse(item)}</li>`).join('');
          out += `<${tag}>${listItems}</${tag}>`;
          i = curr - 1; // loop increment will bring it to curr
          continue;
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
                out += `<span style="color: ${escapeHtml(color)};">${parse(inner, inDisplayMode)}</span>`;
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
              out += `<span style="color: ${escapeHtml(color)};">${parse(inner, inDisplayMode)}</span>`;
              i += legacyMatch[0].length - 1;
              continue;
            }
          }
        }
      }

      // *bold*
      // IMPORTANT: We need to be careful not to match asterisks that are part of comment markers /*...*/ 
      if (ch === '*') {
        // Check if this is part of a comment marker /*
        if (i > 0 && input[i - 1] === '/') {
          // This is likely a comment opening /*, skip this *
          out += escapeHtml(ch);
          continue;
        }

        // Find closing * but skip any * that is part of /*...*/ pattern
        let end = -1;
        for (let j = i + 1; j < input.length; j++) {
          if (input[j] === '*') {
            // Check if this * is preceded by / (comment open /*) - skip it
            if (j > 0 && input[j - 1] === '/') {
              continue;
            }
            // Check if this * is followed by / (comment close */) - skip it
            if (j + 1 < input.length && input[j + 1] === '/') {
              j++; // Skip past the /
              continue;
            }
            end = j;
            break;
          }
        }

        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          out += `<strong>${parse(inner, inDisplayMode)}</strong>`;
          i = end;
          continue;
        }
      }

      // _italic_
      // Similar fix for underscore in LF_LATEX marker
      if (ch === '_') {
        // Check if this is part of LF_LATEX marker
        if (input.slice(Math.max(0, i - 2), i + 1).includes('LF_')) {
          out += escapeHtml(ch);
          continue;
        }

        const end = input.indexOf('_', i + 1);
        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          out += `<em>${parse(inner, inDisplayMode)}</em>`;
          i = end;
          continue;
        }
      }

      // $math$
      if (ch === '$') {
        const end = input.indexOf('$', i + 1);
        if (end !== -1) {
          const innerRaw = input.slice(i + 1, end);

          let inner = innerRaw;
          let isDisplay = inDisplayMode; // Inherit from parent (e.g. if we kept #display wrapper logic, but we removed it above)
          // Actually we removed #display logic, so inDisplayMode is mostly false unless passed from somewhere else.
          // But we want to detect '$ display(...) $' pattern.

          const trimmedInner = inner.trim();
          // Detect '$ display(...) $' pattern
          if (trimmedInner.startsWith('display(')) {
            const openIdx = trimmedInner.indexOf('('); // should be 7
            const closeIdx = findMatching(trimmedInner, openIdx, '(', ')');
            // Ensure the closing parenthesis is at the end
            if (closeIdx === trimmedInner.length - 1) {
              isDisplay = true;
              let extractedInner = trimmedInner.slice(openIdx + 1, closeIdx);
              // Convert escaped commas "," back to regular commas for display in editor
              extractedInner = extractedInner.replace(/","/g, ',');
              inner = extractedInner;
            }
          }

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

          // CRITICAL: Clean up any existing markers from both inner and latex to prevent accumulation
          // Match all variations of the marker (with/without asterisks, with/without underscore)
          // Patterns: /*LF_LATEX:...*/  /LF_LATEX:.../  /LFLATEX:.../  etc.
          const markerCleanup = (s: string): string => {
            return s
              // Standard format: /*LF_LATEX:base64*/
              .replace(/\/\*LF_LATEX:[A-Za-z0-9+/=]*\*\//g, '')
              // Without closing */
              .replace(/\/\*LF_LATEX:[A-Za-z0-9+/=]*/g, '')
              // Without asterisks: /LF_LATEX:base64/
              .replace(/\/LF_LATEX:[A-Za-z0-9+/=]*\//g, '')
              // Without underscore: /LFLATEX:base64/
              .replace(/\/\*?LFLATEX:[A-Za-z0-9+/=]*\*?\/?/g, '')
              // Any remaining LF_LATEX or LFLATEX patterns
              .replace(/\/?L\s*F\s*_?\s*L\s*A\s*T\s*E\s*X\s*:[A-Za-z0-9+/=\s]*\/?/gi, '')
              .trim();
          };
          const cleanLatex = markerCleanup(latex || typstToLatexMath(inner));
          const cleanInner = markerCleanup(inner);

          // When we have stored LaTeX, re-convert to get correct Typst (fixes old corrupted data)
          const correctTypst = latex ? latexToTypstMath(cleanLatex) : cleanInner;
          /* Use a zero-width space wrapper span before the pill to allow cursor positioning before inline math at line start.
             The wrapper span ensures the ZWSP stays on the same line and provides a clickable target. */
          const displayAttr = isDisplay ? ' data-display-mode="true"' : '';
          out += `<span class="inline-math-spacer">\u200B</span><span class="inline-math-pill" data-inline-math-id="${escapeHtml(id)}" data-format="latex" data-typst="${escapeHtml(correctTypst)}" data-latex="${escapeHtml(cleanLatex)}"${displayAttr} contenteditable="false">∑</span>\u200B`;
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
    // When skipListDetection is true, treat all lines as text to avoid double numbering
    const kind = skipListDetection ? 'text' : detectInlineLineKind(line);
    const last = segs[segs.length - 1];
    if (!last || last.kind !== kind) segs.push({ kind, lines: [line] });
    else last.lines.push(line);
  }

  const renderTextLine = (line: string): string => {
    const html = parse(line ?? '');
    // Use div blocks so Enter behavior and line detection are stable in contentEditable.
    // Check for content but don't trim the actual html (preserve spacer spans and ZWSP for cursor positioning)
    const hasContent = html.replace(/\u200B/g, '').replace(/<span class="inline-math-spacer"[^>]*><\/span>/g, '').trim();
    return hasContent ? `<div>${html}</div>` : `<div><br/></div>`;
  };

  const stripPrefix = (line: string, kind: 'ordered' | 'bullet'): string => {
    const trimmed = (line ?? '').trim();
    const parts = textRunPrefixAndInner(trimmed);
    if (parts) return stripLeadingPrefixFromTextRun(trimmed, kind);
    // Use \s* (zero or more) instead of \s+ to match prefixes with or without trailing space
    if (kind === 'ordered') return trimmed.replace(/^\s*\d+[.)]\s*/, '');
    return trimmed.replace(/^\s*[-*]\s*/, '');
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
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u200B/g, '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') return '\n';

    // Skip spacer spans used for cursor positioning
    if (el.classList.contains('inline-math-spacer')) {
      return '';
    }

    // List items are handled by the parent <ol>/<ul>, but keep this in case
    // a caller walks an <li> directly.
    if (tag === 'li') {
      return Array.from(el.childNodes).map(walk).join('');
    }

    if (el.classList.contains('inline-math-pill')) {
      const typst = (el.getAttribute('data-typst') ?? '').trim();
      let latex = (el.getAttribute('data-latex') ?? '').trim();
      const isDisplay = el.getAttribute('data-display-mode') === 'true';

      // CRITICAL: Strip any existing LF_LATEX markers to prevent marker accumulation
      // Match all variations (with/without asterisks, with/without underscore)
      const markerCleanup = (s: string): string => {
        return s
          .replace(/\/\*LF_LATEX:[A-Za-z0-9+/=]*\*\//g, '')
          .replace(/\/\*LF_LATEX:[A-Za-z0-9+/=]*/g, '')
          .replace(/\/LF_LATEX:[A-Za-z0-9+/=]*\//g, '')
          .replace(/\/\*?LFLATEX:[A-Za-z0-9+/=]*\*?\/?/g, '')
          .replace(/\/?L\s*F\s*_?\s*L\s*A\s*T\s*E\s*X\s*:[A-Za-z0-9+/=\s]*\/?/gi, '')
          .trim();
      };
      latex = markerCleanup(latex);

      // When we have stored LaTeX, ALWAYS re-convert from LaTeX to get correct Typst
      // This fixes issues where old conversions had bugs (e.g., pm -> plus.minus, text splitting)
      const resolvedTypst = latex ? latexToTypstMath(latex) : markerCleanup(typst);
      const latexMarker = latex ? `${INLINE_MATH_LATEX_MARKER}${base64EncodeUtf8(latex)}*/` : '';

      // For display mode, escape top-level commas (not inside parentheses) as ","
      // to prevent them from being interpreted as argument separators in display()
      let content: string;
      if (isDisplay) {
        // Escape top-level commas by converting them to quoted strings
        let result = '';
        let depth = 0;
        for (const ch of resolvedTypst) {
          if (ch === '(' || ch === '[' || ch === '{') {
            depth++;
            result += ch;
          } else if (ch === ')' || ch === ']' || ch === '}') {
            depth--;
            result += ch;
          } else if (ch === ',' && depth === 0) {
            result += '","';
          } else {
            result += ch;
          }
        }
        content = `display(${result})`;
      } else {
        content = resolvedTypst;
      }
      return `$${content}$${latexMarker}`;
    }

    const inner = Array.from(el.childNodes).map(walk).join('');

    if (tag === 'strong' || tag === 'b') {
      return `*${inner}*`;
    }
    if (tag === 'em' || tag === 'i') return `_${inner}_`;
    if (tag === 's' || tag === 'strike') return `#strike[${inner}]`;
    if (tag === 'u') return `#underline[${inner}]`;

    const style = (el.getAttribute('style') ?? '').toLowerCase();
    const colorMatch = style.match(/color\s*:\s*([^;]+)/);
    let color = colorMatch?.[1]?.trim();

    // Handle <font color="...">
    if (tag === 'font' && el.hasAttribute('color')) {
      color = el.getAttribute('color') ?? undefined;
    }

    const hasStrike = style.includes('line-through');
    const hasUnderline = style.includes('underline');

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
    if (hasUnderline) {
      out = `#underline[${out}]`;
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
          let item = inner.replace(/\n+/g, ' #linebreak() ').trim();

          // Strip any existing number/bullet prefix from the item content
          // This prevents duplicate numbering when content already has "1. xxx" format
          if (isOrdered) {
            item = item.replace(/^\s*\d+[.)]\s*/, '');
          } else {
            item = item.replace(/^\s*[-*•]\s*/, '');
          }

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
  // Do NOT aggressively strip trailing newlines. contentEditable usually adds a trailing \n via <br> or block div.
  // We should trim START, but keep trailing if it exists?
  // Actually, random whitespace might be an issue.
  // If we have `<div>A</div><div><br></div>`, we have `\nA\n\n`.
  // If we strip ALL, we get `A`. That is bad.
  // If we leave it, we get `A\n\n`.
  // If we save `A\n\n`, it loads as `A` + empty line + empty line?
  // `A\n` should be sufficient for one new line.
  // Let's replace multiple trailing newlines with just one??
  // Or just trimEmptyLines from start, and allow ONE trailing newline?

  const trimmedStart = raw.replace(/^\n+/, '');
  // If it ends with multiple \n, collapse to just one?
  // But if user WANTS multiple empty lines?
  // Let's safe-trim: remove only if > 2?
  // Or simply: don't trim end. The user's input is the user's input.
  // Typst treats single newline as space, double newline as par break.
  // But here we are in "inline" context mostly inside a #block usually?
  // No, `typstToBlocks` handles main blocks. This is `htmlToTypstInline` used in `TextBlockEditor`.

  // If we return `A\n`, and save it.
  // Next load: `A\n`. split -> `['A', '']`.
  // HTML: `<div>A</div><div><br></div>`.
  // User presses Enter. DOM: `<div>A</div><div><br></div>`.
  // `raw`: `\nA\n\n`.
  // If we assume `div` always adds overhead.

  return trimmedStart.replace(/\n+$/, '\n').trimEnd(); // Wait, trimEnd removes all \n.

  // Let's just remove the aggressive trimEnd and see.
  // But we might want to consolidate multiple \n's if they are artifacts?
  // Let's try replacing multiple trailing newlines with exactly one if there is any.
  // return trimmedStart.replace(/\n+$/, '\n');
  // Actually, if content is "A", we get "A".
  // If content is "A\n\n" (from `<div>A</div><div><br></div>`), we get "A\n".
  // "A\n" -> split -> `['A', '']`. Correct.
  // If content is "A\n\n\n" -> "A\n".
  // What if user WANTS two empty lines? "A\n\n" in Typst.
  // Then we shouldn't squash.

  return trimmedStart; // Let's try raw (trimmed start only).
};
