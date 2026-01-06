import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mitex-wasm because Vitest/Node environment has trouble loading .wasm files directly without special flags
vi.mock('mitex-wasm', () => {
  return {
    convert_math: (input: string) => {
      // Very crude mock for tests
      if (input.includes('\\frac')) return 'frac(a, b)';
      if (input.includes('\\alpha')) return 'alpha';
      if (input.includes('pmatrix')) return 'mat(delim: "(", a, b; c, d)';
      return input;
    }
  };
});

import { 
  latexToTypstMath, 
  typstToLatexMath, 
  convertTypstContentToLatex,
  latexToTypstMathAsync,
  initMitexWasm
} from '../math-convert';


describe('Math Conversion (LaTeX <-> Typst)', () => {
  
  describe('latexToTypstMath', () => {
    it('converts basic arithmetic', () => {
      const res = latexToTypstMath('1 + 1 = 2');
      expect(res).toBeTruthy();
      expect(res).toContain('1');
    });

    it('converts fractions', () => {
      const result = latexToTypstMath('\\frac{a}{b}');
      // Support both mitex and tex2typst variants
      expect(result).toMatch(/frac\s*\(\s*a\s*,?\s*b\s*\)/);
    });

    it('converts greek letters', () => {
      const res = latexToTypstMath('\\alpha + \\beta = \\gamma');
      expect(res).toContain('alpha');
      expect(res).toContain('beta');
      expect(res).toContain('gamma');
    });

    it('converts square roots', () => {
      expect(latexToTypstMath('\\sqrt{x}')).toContain('sqrt');
      expect(latexToTypstMath('\\sqrt{x}')).toContain('x');
    });

    it('handles subscript and superscript', () => {
      const result = latexToTypstMath('x_i^2');
      expect(result).toContain('x');
      expect(result).toContain('_');
      expect(result).toContain('^');
    });

    it('strips LaTeX delimiters', () => {
      expect(latexToTypstMath('$$E=mc^2$$')).not.toContain('$$');
      expect(latexToTypstMath('\\[E=mc^2\\]')).not.toContain('\\[');
      // Only strips if it's the full string wrapped
      expect(latexToTypstMath('$E=mc^2$')).not.toContain('$');
    });

    it('handles complex environments (like pmatrix)', async () => {
      // Use async to ensure mitex is loaded for complex things
      const latex = '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}';
      const result = await latexToTypstMathAsync(latex);
      expect(result).toContain('mat');
      expect(result).toContain('a');
      expect(result).toContain('d');
    });

    it('handles nested fractions', () => {
      // This will use the mock
      expect(latexToTypstMath('\\frac{\\frac{1}{2}}{3}')).toContain('frac');
    });

    it('handles empty or null input gracefully', () => {
      expect(latexToTypstMath('')).toBe('');
      expect(latexToTypstMath(null as any)).toBe('');
    });
  });

  describe('typstToLatexMath', () => {
    it('converts fractions back to LaTeX', () => {
      expect(typstToLatexMath('frac(1, 2)')).toContain('\\frac{1}{2}');
    });

    it('converts greek letters back to LaTeX', () => {
      expect(typstToLatexMath('alpha')).toContain('\\alpha');
      expect(typstToLatexMath('beta')).toContain('\\beta');
    });

    it('handles subscripts and superscripts', () => {
      // tex2typst keeps simple scripts as-is
      expect(typstToLatexMath('x_1')).toBe('x_1');
      expect(typstToLatexMath('y^2')).toBe('y^2');
    });

    it('handles multi-character scripts', () => {
      // tex2typst adds spaces inside braces
      expect(typstToLatexMath('x_(i+1)')).toBe('x_{i + 1}');
    });

    it('handles products and sums', () => {
      expect(typstToLatexMath('sum')).toContain('\\sum');
      expect(typstToLatexMath('product')).toContain('\\prod');
    });
  });

  describe('convertTypstContentToLatex', () => {
    it('converts mixed Typst content with $ blocks to LaTeX', () => {
      const input = 'The formula is $frac(1, 2)$ and $sqrt(x)$.';
      const output = convertTypstContentToLatex(input);
      // Result includes trailing period from original text
      expect(output).toContain('\\frac{1}{2}');
      expect(output).toContain('\\sqrt{x}');
    });

    it('handles content with multiple occurrences of math', () => {
      const input = '$alpha$ then $beta$ then $gamma$';
      const output = convertTypstContentToLatex(input);
      expect(output).toBe('$\\alpha$ then $\\beta$ then $\\gamma$');
    });
  });

  describe('Asynchronous Loading', () => {
    it('initializes and converts asynchronously', async () => {
      initMitexWasm();
      const res = await latexToTypstMathAsync('\\alpha');
      expect(res).toBe('alpha');
    });
  });
});

