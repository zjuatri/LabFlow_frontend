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
  '\\pm': 'pm',
  '\\leq': '<=',
  '\\geq': '>=',
  '\\neq': '!=',
  '\\nabla': 'nabla',
  '\\partial': 'diff',
  '\\approx': '~~',
  '\\equiv': 'equiv',
  '\\in': 'in',
  '\\subset': 'subset',
  '\\supset': 'supset',
  '\\cup': 'union',
  '\\cap': 'sect',
  '\\emptyset': 'emptyset',
  '\\forall': 'forall',
  '\\exists': 'exists',

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
  
  // Handle \mathbf{X} -> bold(X) in Typst
  s = s.replace(/\\mathbf\{([^}]+)\}/g, 'bold($1)');
  
  // Handle \mathrm{X} -> upright(X) in Typst
  s = s.replace(/\\mathrm\{([^}]+)\}/g, 'upright($1)');
  
  // Handle \text{...} -> "..."
  s = s.replace(/\\text\{([^}]+)\}/g, '"$1"');

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

  // Token replacements (commands)
  // Replace longer commands first to avoid partial matches.
  const keys = Object.keys(LATEX_TO_TYPST_TOKENS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    s = s.split(key).join(LATEX_TO_TYPST_TOKENS[key]);
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
    'frac', 'cases', 'text', 'oo', 'pm', 'dot', 'times', 'equiv', 'union', 'sect',
    'emptyset', 'forall', 'exists', 'subset', 'supset', 'floor', 'ceil', 'abs',
    'min', 'max', 'gcd', 'lcm', 'mod', 'det', 'tr', 'dim', 'ker', 'im', 'upright',
    'cont', 'double', 'triple', 'mat', 'vec', 'delim',
    'dots', 'down'
  ]);
  
  const splitLetters = (text: string): string => {
    return text.replace(/[a-zA-Z]+/g, (word) => {
      if (knownWords.has(word) || word.length === 1) {
        return word;
      }
      return word.split('').join(' ');
    });
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

  // Token replacements (reverse)
  // Replace whole-word tokens where possible
  for (const [typstTok, latexTok] of Object.entries(TYPST_TO_LATEX_TOKENS)) {
    const re = new RegExp(`(?<![\\w])${typstTok}(?![\\w])`, 'g');
    s = s.replace(re, latexTok);
  }

  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
