// Best-effort conversion between LaTeX and Typst math.
// This is intentionally conservative: unsupported constructs are left as-is.

const LATEX_TO_TYPST_TOKENS: Record<string, string> = {
  // big operators
  '\\sum': 'sum',
  '\\Sigma': 'Sigma',
  '\\prod': 'product',
  '\\int': 'integral',
  '\\oint': 'integral.cont',
  '\\iint': 'integral.double',
  '\\iiint': 'integral.triple',
  '\\lim': 'lim',
  '\\infty': 'oo',

  // functions
  '\\log': 'log',
  '\\ln': 'ln',
  '\\sin': 'sin',
  '\\cos': 'cos',
  '\\tan': 'tan',
  '\\exp': 'exp',

  // operators and symbols
  '\\cdot': 'dot',
  '\\times': 'times',
  '\\pm': 'plus.minus',
  '\\leq': '<=',
  '\\geq': '>=',
  '\\le': '<=',
  '\\ge': '>=',
  '\\ll': '<<',
  '\\gg': '>>',
  '\\neq': '!=',
  '\\nabla': 'nabla',
  '\\partial': 'diff',
  '\\approx': 'approx',
  '\\equiv': 'equiv',
  '\\in': 'in',
  '\\subset': 'subset',
  '\\supset': 'supset',
  '\\cup': 'union',
  '\\cap': 'sect',
  '\\emptyset': 'emptyset',
  '\\forall': 'forall',
  '\\exists': 'exists',

  // arrows
  '\\Rightarrow': '=>',
  '\\rightarrow': '->',
  '\\Leftarrow': 'arrow.l.double',
  '\\leftarrow': '<-',
  '\\Leftrightarrow': '<=>',
  '\\leftrightarrow': '<->',
  '\\longrightarrow': '-->',
  '\\Longrightarrow': '==>',
  '\\mapsto': '|->',
  '\\to': '->',

  // dots
  '\\dots': 'dots',
  '\\ldots': 'dots',
  '\\cdots': 'dots',
  '\\vdots': 'dots.v',
  '\\ddots': 'dots.down',

  // greek letters (common)
  '\\alpha': 'alpha',
  '\\beta': 'beta',
  '\\gamma': 'gamma',
  '\\Gamma': 'Gamma',
  '\\delta': 'delta',
  '\\Delta': 'Delta',
  '\\epsilon': 'epsilon',
  '\\varepsilon': 'epsilon.alt',
  '\\zeta': 'zeta',
  '\\eta': 'eta',
  '\\theta': 'theta',
  '\\Theta': 'Theta',
  '\\iota': 'iota',
  '\\kappa': 'kappa',
  '\\lambda': 'lambda',
  '\\Lambda': 'Lambda',
  '\\mu': 'mu',
  '\\nu': 'nu',
  '\\xi': 'xi',
  '\\Xi': 'Xi',
  '\\pi': 'pi',
  '\\Pi': 'Pi',
  '\\rho': 'rho',
  '\\sigma': 'sigma',
  '\\tau': 'tau',
  '\\upsilon': 'upsilon',
  '\\Upsilon': 'Upsilon',
  '\\phi': 'phi',
  '\\varphi': 'phi.alt',
  '\\Phi': 'Phi',
  '\\chi': 'chi',
  '\\psi': 'psi',
  '\\Psi': 'Psi',
  '\\omega': 'omega',
  '\\Omega': 'Omega',
};

const TYPST_TO_LATEX_TOKENS: Record<string, string> = Object.fromEntries(
  Object.entries(LATEX_TO_TYPST_TOKENS).map(([k, v]) => [v, k])
);


function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingBrace(input: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    const ch = input[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelCommaArgs(input: string): string[] {
  const args: string[] = [];
  let depthParen = 0;
  let depthBrace = 0;
  let current = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);

    if (ch === ',' && depthParen === 0 && depthBrace === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export function latexToTypstMath(latex: string): string {
  let s = (latex ?? '').trim();
  if (!s) return '';

  console.log('[latexToTypstMath] Input:', JSON.stringify(s));

  // Normalize escaped backslashes: \\command -> \command
  // This handles cases where LaTeX was stored with escaped backslashes (e.g., \\pm -> \pm)
  s = s.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
  console.log('[latexToTypstMath] After normalize backslashes:', JSON.stringify(s));

  // FIRST: Convert \text{...} to Typst quoted strings immediately
  // Use a unique Unicode marker to protect them from splitLetters
  // We use \uE000-\uE001 (private use area) as delimiters
  s = s.replace(/\\text\{([^}]+)\}/g, (_, content) => `\uE000${content}\uE001`);
  console.log('[latexToTypstMath] After \\text protection:', JSON.stringify(s));

  // Handle matrix environments first (bmatrix, pmatrix, vmatrix, matrix)
  // Convert \begin{bmatrix}...\end{bmatrix} to mat(delim: "[", ...)
  s = s.replace(/\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/g, (_, content) => {
    const rows = content.trim().split(/\\\\/g).map((row: string) =>
      row
        .trim()
        .split(/&/)
        .map((cell: string) => latexToTypstMath(cell.trim()))
        .join(', ')
    ).filter((row: string) => row);
    return `mat(delim: "[", ${rows.join('; ')})`;
  });

  s = s.replace(/\\begin\{pmatrix\}([\s\S]*?)\\end\{pmatrix\}/g, (_, content) => {
    const rows = content.trim().split(/\\\\/g).map((row: string) =>
      row
        .trim()
        .split(/&/)
        .map((cell: string) => latexToTypstMath(cell.trim()))
        .join(', ')
    ).filter((row: string) => row);
    return `mat(delim: "(", ${rows.join('; ')})`;
  });

  s = s.replace(/\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/g, (_, content) => {
    const rows = content.trim().split(/\\\\/g).map((row: string) =>
      row
        .trim()
        .split(/&/)
        .map((cell: string) => latexToTypstMath(cell.trim()))
        .join(', ')
    ).filter((row: string) => row);
    return `mat(delim: "|", ${rows.join('; ')})`;
  });

  s = s.replace(/\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}/g, (_, content) => {
    const rows = content.trim().split(/\\\\/g).map((row: string) =>
      row
        .trim()
        .split(/&/)
        .map((cell: string) => latexToTypstMath(cell.trim()))
        .join(', ')
    ).filter((row: string) => row);
    return `mat(${rows.join('; ')})`;
  });

  // Remove other LaTeX environments (align, equation, gather, etc.)
  s = s.replace(/\\begin\{[^}]+\}/g, '');
  s = s.replace(/\\end\{[^}]+\}/g, '');

  // Convert line breaks (\\) to single backslash for Typst
  // In Typst math, single \ is used for line breaks
  s = s.replace(/\\\\/g, ' \\ ');

  // Convert literal forward slashes (/) to escaped slashes (\/)
  // In Typst math, / is a fraction operator. To render a literal slash, we must escape it.
  s = s.replace(/\//g, ' \\/ ');

  // Handle \mathbf{X} -> bold(X) in Typst
  s = s.replace(/\\mathbf\{([^}]+)\}/g, 'bold($1)');

  // Handle \mathrm{X} -> upright("X") in Typst when it's a plain identifier.
  // This commonly represents units like \mathrm{mm}.
  s = s.replace(/\\mathrm\{([^}]+)\}/g, (_m, inner) => {
    const v = String(inner ?? '').trim();
    if (/^[A-Za-z]{1,16}$/.test(v)) return `upright("${v}")`;
    return `upright(${v})`;
  });

  // NOTE: \text{...} was already converted to placeholder above

  // Normalize common wrappers
  s = s.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');

  // Handle \frac{A}{B} and \sqrt{A} recursively
  // We repeatedly replace from left to right.
  for (let guard = 0; guard < 500; guard++) {
    const fracIndex = s.indexOf('\\frac');
    const sqrtIndex = s.indexOf('\\sqrt');
    const nextIndex =
      fracIndex === -1 ? sqrtIndex : sqrtIndex === -1 ? fracIndex : Math.min(fracIndex, sqrtIndex);
    if (nextIndex === -1) break;

    if (nextIndex === fracIndex) {
      const after = fracIndex + '\\frac'.length;
      if (s[after] !== '{') {
        // malformed, skip
        break;
      }
      const aEnd = findMatchingBrace(s, after);
      if (aEnd === -1) break;
      const bStart = aEnd + 1;
      if (s[bStart] !== '{') break;
      const bEnd = findMatchingBrace(s, bStart);
      if (bEnd === -1) break;
      const a = latexToTypstMath(s.slice(after + 1, aEnd));
      const b = latexToTypstMath(s.slice(bStart + 1, bEnd));
      s = `${s.slice(0, fracIndex)}frac(${a}, ${b})${s.slice(bEnd + 1)}`;
      continue;
    }

    if (nextIndex === sqrtIndex) {
      const after = sqrtIndex + '\\sqrt'.length;
      if (s[after] === '{') {
        const aEnd = findMatchingBrace(s, after);
        if (aEnd === -1) break;
        const a = latexToTypstMath(s.slice(after + 1, aEnd));
        s = `${s.slice(0, sqrtIndex)}sqrt(${a})${s.slice(aEnd + 1)}`;
        continue;
      }
      // \sqrt2 -> sqrt(2) (single token)
      const token = s.slice(after).trim().split(/\s+/)[0];
      if (!token) break;
      s = `${s.slice(0, sqrtIndex)}sqrt(${latexToTypstMath(token)})${s.slice(after + token.length)}`;
      continue;
    }
  }

  // Convert LaTeX grouped subscripts/superscripts into Typst grouping.
  // In Typst math, curly braces are literal characters, so `Z_{1}` would render `{1}`.
  // Typst groups with parentheses: `Z_(1)`.
  for (let guard = 0; guard < 500; guard++) {
    const subIndex = s.indexOf('_{');
    const supIndex = s.indexOf('^{');
    const nextIndex =
      subIndex === -1 ? supIndex : supIndex === -1 ? subIndex : Math.min(subIndex, supIndex);
    if (nextIndex === -1) break;

    const op = s[nextIndex]; // '_' or '^'
    const braceStart = nextIndex + 1;
    if (s[braceStart] !== '{') break;
    const braceEnd = findMatchingBrace(s, braceStart);
    if (braceEnd === -1) break;

    const innerLatex = s.slice(braceStart + 1, braceEnd);
    const innerTypst = latexToTypstMath(innerLatex);
    s = `${s.slice(0, nextIndex)}${op}(${innerTypst})${s.slice(braceEnd + 1)}`;
  }

  // Token replacements (commands)
  // Replace longer commands first to avoid partial matches.
  const keys = Object.keys(LATEX_TO_TYPST_TOKENS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    s = s.split(key).join(` ${LATEX_TO_TYPST_TOKENS[key]} `);
  }

  // In LaTeX, consecutive letters like 'aa' mean implicit multiplication (a * a).
  // In Typst, they must be separated by spaces. Add spaces between consecutive Latin letters
  // but preserve known function names and Greek letters.
  const knownWords = new Set([
    'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'lim', 'sum', 'product', 'integral',
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
    'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon',
    'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi',
    'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega', 'nabla', 'diff', 'bold', 'sqrt',
    'frac', 'cases', 'text', 'oo', 'dot', 'times', 'equiv', 'union', 'sect',
    'emptyset', 'forall', 'exists', 'subset', 'supset', 'floor', 'ceil', 'abs',
    'min', 'max', 'gcd', 'lcm', 'mod', 'det', 'tr', 'dim', 'ker', 'im', 'upright',
    'cont', 'double', 'triple', 'mat', 'vec', 'delim',
    'dots', 'down',
    // Components of compound symbols (e.g., plus.minus, integral.cont)
    'plus', 'minus', 'alt',
    // Relational operators
    'approx', 'sim', 'cong', 'neq', 'leq', 'geq',
    // Display mode
    'display'
  ]);

  const splitLetters = (text: string): string => {
    // Split multi-letter words into single letters, but:
    // 1. Preserve known Typst words (like 'sqrt', 'frac', etc.)
    // 2. Preserve content inside quotes (like "rad/s")
    // 3. Preserve compound symbols like 'plus.minus'
    // 4. Preserve \uE000...\uE001 protected text blocks

    let result = '';
    let i = 0;
    while (i < text.length) {
      // Skip protected text blocks (marked with \uE000...\uE001)
      if (text[i] === '\uE000') {
        const endIdx = text.indexOf('\uE001', i + 1);
        if (endIdx !== -1) {
          result += text.slice(i, endIdx + 1);
          i = endIdx + 1;
          continue;
        }
      }

      // Skip quoted strings entirely
      if (text[i] === '"') {
        const endQuote = text.indexOf('"', i + 1);
        if (endQuote !== -1) {
          result += text.slice(i, endQuote + 1);
          i = endQuote + 1;
          continue;
        }
      }

      // Check for letter sequences
      if (/[a-zA-Z]/.test(text[i])) {
        // Collect the full word (including dots for compound symbols like plus.minus)
        let word = '';
        let j = i;
        while (j < text.length && /[a-zA-Z.]/.test(text[j])) {
          word += text[j];
          j++;
        }

        // Check if it's a known word or compound symbol
        const parts = word.split('.');
        const allPartsKnown = parts.every(p => knownWords.has(p) || p.length <= 1 || p === '');

        if (allPartsKnown || knownWords.has(word)) {
          result += word;
        } else if (word.length === 1) {
          result += word;
        } else {
          // Split unknown multi-letter words
          result += word.split('').join(' ');
        }
        i = j;
        continue;
      }

      result += text[i];
      i++;
    }
    return result;
  };

  // Process subscripts and superscripts recursively
  s = s.replace(/_{([^}]+)}/g, (match, content) => {
    // Typst: multi-character scripts should use parentheses: a_(1 2)
    return `_(${splitLetters(content).trim()})`;
  });

  s = s.replace(/\^{([^}]+)}/g, (match, content) => {
    return `^(${splitLetters(content).trim()})`;
  });

  // Split letters in the main content
  s = splitLetters(s);

  // In Typst math, adjacent letter+digit or digit+letter sequences like `m1` are parsed
  // as a single identifier. Insert spaces so they behave like separate tokens.
  s = s.replace(/([a-zA-Z])(\d)/g, '$1 $2');
  s = s.replace(/(\d)([a-zA-Z])/g, '$1 $2');


  // LaTeX uses { } for grouping; Typst math accepts parentheses/braces too.
  // Keep braces but remove unnecessary outer braces.
  // Collapse multiple spaces but preserve backslashes
  s = s.replace(/([^\\])\s+/g, '$1 ').trim();

  // LAST: Convert protected text blocks to Typst quoted strings
  // \uE000content\uE001 -> "content"
  s = s.replace(/\uE000([^\uE001]*)\uE001/g, '"$1"');

  return s;
}

export function typstToLatexMath(typst: string): string {
  let s = (typst ?? '').trim();
  if (!s) return '';

  // Convert frac(a,b) and sqrt(a) with a small recursive parser.
  // We do a left-to-right scan for function calls.
  const replaceFunc = (name: string, replacer: (inner: string) => string) => {
    for (let guard = 0; guard < 500; guard++) {
      const idx = s.indexOf(`${name}(`);
      if (idx === -1) break;
      let depth = 0;
      let end = -1;
      for (let i = idx + name.length; i < s.length; i++) {
        const ch = s[i];
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) break;
      const inner = s.slice(idx + name.length + 1, end);
      const replaced = replacer(inner);
      s = `${s.slice(0, idx)}${replaced}${s.slice(end + 1)}`;
    }
  };

  replaceFunc('frac', (inner) => {
    const args = splitTopLevelCommaArgs(inner);
    const a = typstToLatexMath(args[0] ?? '');
    const b = typstToLatexMath(args[1] ?? '');
    return `\\frac{${a}}{${b}}`;
  });

  replaceFunc('sqrt', (inner) => {
    const a = typstToLatexMath(inner);
    return `\\sqrt{${a}}`;
  });

  // Convert Typst quoted strings "..." back to \text{...}
  // Handle escaped quotes inside: \" -> "
  s = s.replace(/"([^"]*)"/g, (_, content) => {
    // Unescape any escaped quotes inside
    const unescaped = content.replace(/\\"/g, '"');
    return `\\text{${unescaped}}`;
  });

  // Token replacements (reverse)
  // Replace whole-word tokens where possible
  // Fix: Sort by length desc to match longer symbols (e.g. `-->`) before shorter (`->`)
  const typstEntries = Object.entries(TYPST_TO_LATEX_TOKENS).sort((a, b) => b[0].length - a[0].length);

  for (const [typstTok, latexTok] of typstEntries) {
    const isWord = /^[a-zA-Z]+$/.test(typstTok);
    const escapedTok = escapeRegExp(typstTok);

    // If it's a word (like "sin"), we need word boundaries.
    // If it's a symbol (like "|->"), we generally DON'T want word boundaries (e.g. `|->` can touch `M`).
    const pattern = isWord
      ? `(?<![\\w])${escapedTok}(?![\\w])`
      : escapedTok;

    const re = new RegExp(pattern, 'g');

    // If the replacement is a LaTeX command (starts with \ and is letters), add a space.
    // This prevents `\mapsto` + `M` becoming `\mapstoM`.
    // But don't add space if latexTok is just a symbol like `=` or `+` (though those usually aren't in this map).
    const isLatexCommand = /^(\\[a-zA-Z]+)$/.test(latexTok);
    const replacement = isLatexCommand ? `${latexTok} ` : latexTok;

    s = s.replace(re, replacement);
  }


  s = s.replace(/\\\//g, '/');

  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
