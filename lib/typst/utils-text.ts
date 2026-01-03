import { latexToTypstMath } from '../math-convert';

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
        const inner = parts.inner.replace(/^\s*\d+[.)]\s+/.test(parts.inner) ? /^\s*\d+[.)]\s+/ : /^/, '');
        // Wait, regex above had logic to strip prefix.
        // original: const inner = parts.inner.replace(/^\s*\d+[.)]\s+/, '');
        const innerClean = parts.inner.replace(/^\s*\d+[.)]\s+/, '');
        return `${parts.prefix}${innerClean.trim()}]`;
    }

    const inner = parts.inner.replace(/^\s*[-*]\s+/, '');
    return `${parts.prefix}${inner.trim()}]`;
};

// Tokenize a paragraph string into #text runs, #linebreak() tokens, and raw text.
// This lets us split on line breaks without breaking the bracket structure.
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

            // Check if this ordered list should be kept as plain text:
            // - Single item that doesn't start with "1." should not use #enum (it would renumber)
            // This handles cases like "10. xxx" which should stay as "10. xxx" not become "1. xxx"
            if (seg.kind === 'ordered' && seg.lines.length === 1) {
                const visible = extractInnerText(seg.lines[0]);
                const numMatch = visible.match(/^(\d+)[.)]/);
                const startNum = numMatch ? parseInt(numMatch[1], 10) : 1;

                // If it's not starting from 1, keep as plain text
                if (startNum !== 1) {
                    parts.push(seg.lines[0]);
                    continue;
                }
            }

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

            // Output single-line to prevent parser from splitting across lines during re-parse
            // Using inline format: just the list expression without outer block wrapper
            parts.push(listExpr);
        }
    }

    return parts.join('\n');
};

export const inlineToSingleLine = (s: string): string => {
    // Table cells must not contain raw newlines, otherwise the whole `table(...)` spans
    // multiple lines and the marker-driven parser will treat fragments as paragraphs.
    // Use Typst's `linebreak()` element to preserve visual line breaks inline.
    // Also convert literal `\n` (backslash + letter n, two chars) which AI sometimes outputs.
    return sanitizeTypstInlineMath((s ?? ''))
        .replace(/\\n/g, '\n')           // literal \n -> real newline first
        .replace(/\r?\n/g, ' #linebreak() ');
};

const UNIT_SUFFIXES = new Set([
    // length
    'mm', 'cm', 'm', 'km', 'um', 'nm',
    // mass
    'mg', 'g', 'kg',
    // time
    'ms', 's', 'min', 'h',
    // force/pressure
    'N', 'kN', 'Pa', 'kPa', 'MPa', 'GPa',
    // frequency
    'Hz', 'kHz', 'MHz', 'GHz',
    // electric
    'V', 'A', 'mA', 'W',
    // energy
    'J', 'kJ',
    // temperature (common latin fallbacks)
    'C',
]);

const KNOWN_MATH_FUNCTIONS = new Set([
    // Functions
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'coth',
    'ln', 'log', 'lg', 'exp',
    'lim', 'max', 'min', 'sup', 'inf',
    'det', 'trace', 'dim', 'ker', 'deg', 'gcd', 'lcm',
    'mod', 'sgn', 'arg', 'Re', 'Im',
    'sum', 'prod', 'int', 'oint',
    'sqrt', 'frac', 'binom', 'cases', 'mat', 'vec',
    'abs', 'norm', 'floor', 'ceil', 'round',
    'op', 'text', 'underline', 'overline', 'hat', 'tilde', 'dot', 'ddot', 'arrow',
    'upright', 'bold', 'italic', 'sans', 'serif', 'mono',
    // Greek letters (lowercase)
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
    // Greek letters (uppercase)
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
    'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
    // Special symbols
    'partial', 'nabla', 'infty', 'aleph', 'beth', 'ell',
    'in', 'notin', 'subset', 'subseteq', 'supset', 'supseteq', 'cup', 'cap',
    'forall', 'exists', 'nexists', 'top', 'bot', 'empty',
    'cdot', 'times', 'div', 'pm', 'mp',
    'approx', 'sim', 'cong', 'equiv', 'neq', 'leq', 'geq', 'll', 'gg',
    'leftarrow', 'rightarrow', 'leftrightarrow', 'Leftarrow', 'Rightarrow', 'Leftrightarrow',
    'to', 'maps', 'mapsto',
    // Custom unit whitelist (kept separate to avoid quoting them if they appear alone)
    'mm', 'cm', 'm', 'km', 'um', 'nm', 'mg', 'g', 'kg', 'ms', 's', 'min', 'h',
    'Hz', 'kHz', 'MHz', 'GHz', 'Pa', 'kPa', 'MPa', 'GPa', 'J', 'kJ', 'W', 'V', 'A', 'mA',
]);

export function sanitizeTypstMathSegment(segment: string): string {
    let s = segment ?? '';

    // 1. Convert trivial LaTeX-isms if detected
    if (/\\[A-Za-z]+/.test(s) || /\\frac\s*\{/.test(s) || /\\times\b/.test(s) || /[_^]\{/.test(s)) {
        s = latexToTypstMath(s);
    }

    // 2. Escape literal % to \% (comment char in Typst)
    s = s.replace(/(^|[^\\])%/g, (_m, p1) => `${p1}\\%`);

    // 3. Fix upright(mm) / bold(mm)
    s = s.replace(/\b(upright|bold|italic)\(\s*([A-Za-z0-9]+)\s*\)/g, (_m, fn, arg) => {
        return `${fn}("${arg}")`;
    });

    // 4. Quote unknown multi-letter variables (e.g. Kv -> "Kv", Mp -> "Mp")
    // Typst treats any 2+ char word as a function call or variable lookup. 
    // If it's not in the whitelist, we should quote it to treat it as text.
    // We use a regex that matches "words" (sequence of letters) but be careful about:
    // - single chars (don't quote 'x')
    // - quoted strings (don't quote '"text"')
    // - function calls 'sin(' (handled by looking ahead? no, Typst allows 'sin x')
    // Simpler approach: split by non-word chars and replace.

    // We process the string by finding variable-like tokens
    // A variable is [A-Za-z][A-Za-z0-9]* 
    // But we mostly care about [A-Za-z]{2,}
    // We must ignore tokens inside quotes.
    // This is a naive tokenizer.

    const tokens = s.split(/([A-Za-z]{2,})/);
    s = tokens.map((tok, idx) => {
        // Even indices are delimiters, Odd indices are identifiers (captured)
        if (idx % 2 === 0) return tok;

        // Check if it's already inside quotes? 
        // This simple split is dangerous if quotes exist. 
        // E.g. "foo bar" -> split -> "foo", " ", "bar" -> quoted "bar" inside quotes?
        // Let's rely on word boundary replacement which is safer if we assume input is mostly math expressions.
        // Typst math usually doesn't have many string literals unless manually added.

        if (KNOWN_MATH_FUNCTIONS.has(tok)) return tok;

        // Check context for function call syntax "func("
        const nextChar = tokens[idx + 1]?.trim().charAt(0);
        if (nextChar === '(') return tok; // likely a function call we missed or custom function

        return `"${tok}"`;
    }).join('');

    // 5. Fix number+unit spacing: 1700 "mm" -> 1700 "mm" (already quoted above)
    // If we quoted the unit above (e.g. "mm"), removing the quote again might be nice if we want space.
    // But "mm" is valid Typst string. 1700 "mm" renders as 1700mm text.
    // The previous logic put spaces before units.
    // Let's refine step 4:
    // Actually, for units like 'mm', we WANT them quoted.
    // The whitelist above INCLUDES units, so they weren't quoted by Step 4.
    // Step 5 adds quotes AND space if missing.

    s = s.replace(
        /(\d+(?:\.\d+)?)\s*([A-Za-z]{1,4})\b/g,
        (m, num, unit) => {
            if (UNIT_SUFFIXES.has(unit)) {
                // If it was whitelisted (unquoted), we add quotes and space here
                return `${num} "${unit}"`;
            }
            return m;
        }
    );

    return s;
}

export function sanitizeTypstInlineMath(input: string): string {
    const s = input ?? '';
    if (!s.includes('$')) return s;

    let out = '';
    let buf = '';
    let inMath = false;

    const flush = () => {
        if (buf.length === 0) return;
        out += inMath ? sanitizeTypstMathSegment(buf) : buf;
        buf = '';
    };

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        const prev = i > 0 ? s[i - 1] : '';
        if (ch === '$' && prev !== '\\') {
            flush();
            inMath = !inMath;
            out += '$';
            continue;
        }
        buf += ch;
    }

    flush();
    return out;
}
