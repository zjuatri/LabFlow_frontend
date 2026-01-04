
import { latexToTypstMath } from '../../math-convert';

const UNIT_SUFFIXES = new Set([
    'mm', 'cm', 'm', 'km', 'um', 'nm',
    'mg', 'g', 'kg',
    'ms', 's', 'min', 'h',
    'N', 'kN', 'Pa', 'kPa', 'MPa', 'GPa',
    'Hz', 'kHz', 'MHz', 'GHz',
    'V', 'A', 'mA', 'W',
    'J', 'kJ',
    'C',
]);

const KNOWN_MATH_FUNCTIONS = new Set([
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
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
    'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
    'partial', 'nabla', 'infty', 'aleph', 'beth', 'ell',
    'in', 'notin', 'subset', 'subseteq', 'supset', 'supseteq', 'cup', 'cap',
    'forall', 'exists', 'nexists', 'top', 'bot', 'empty',
    'cdot', 'times', 'div', 'pm', 'mp',
    'approx', 'sim', 'cong', 'equiv', 'neq', 'leq', 'geq', 'll', 'gg',
    'leftarrow', 'rightarrow', 'leftrightarrow', 'Leftarrow', 'Rightarrow', 'Leftrightarrow',
    'to', 'maps', 'mapsto',
    'plus', 'minus', 'eq', 'lt', 'gt', 'star', 'ast', 'circle', 'square', 'triangle', 'diamond',
    'display',
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
    const quotedStrings: string[] = [];
    let protected_s = s.replace(/"[^"]*"/g, (match) => {
        quotedStrings.push(match);
        return `\uE100${quotedStrings.length - 1}\uE101`;
    });

    const tokens = protected_s.split(/([A-Za-z]{2,})/);
    protected_s = tokens.map((tok, idx) => {
        if (idx % 2 === 0) return tok;
        if (tok.includes('\uE100') || tok.includes('\uE101')) return tok;

        if (KNOWN_MATH_FUNCTIONS.has(tok)) return tok;

        const nextChar = tokens[idx + 1]?.trim().charAt(0);
        if (nextChar === '(') return tok;

        return `"${tok}"`;
    }).join('');

    s = protected_s.replace(/\uE100(\d+)\uE101/g, (_, idx) => quotedStrings[parseInt(idx)]);

    // 5. Fix number+unit spacing
    s = s.replace(
        /(\d+(?:\.\d+)?)\s*([A-Za-z]{1,4})\b/g,
        (m, num, unit) => {
            if (UNIT_SUFFIXES.has(unit)) {
                return `${num} "${unit}"`;
            }
            return m;
        }
    );

    return s;
}

export function sanitizeTypstInlineMath(input: string): string {
    let s = input ?? '';

    s = s
        .replace(/\/\*LF_LATEX:[A-Za-z0-9+/=]*\*\//g, '')
        .replace(/\/\*LF_LATEX:[A-Za-z0-9+/=]*/g, '')
        .replace(/\/LF_LATEX:[A-Za-z0-9+/=]*\//g, '')
        .replace(/\/\*?LFLATEX:[A-Za-z0-9+/=]*\*?\/?/g, '')
        .replace(/\/?L\s*F\s*_?\s*L\s*A\s*T\s*E\s*X\s*:[A-Za-z0-9+/=\s]*\/?/gi, '');

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

export const inlineToSingleLine = (s: string): string => {
    return sanitizeTypstInlineMath((s ?? ''))
        .replace(/\\n/g, '\n')
        .replace(/\r?\n/g, ' #linebreak() ');
};
