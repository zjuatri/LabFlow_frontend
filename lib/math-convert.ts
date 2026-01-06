// LaTeX ↔ Typst math conversion using mitex-wasm (LaTeX→Typst) and tex2typst (Typst→LaTeX).
// This replaces the previous manual conversion implementation.

import { typst2tex } from 'tex2typst';

// ============================================================================
// MiTeX WASM Integration
// ============================================================================

// The mitex-wasm module uses WebAssembly. In Next.js, dynamic import is needed
// for modules with WASM dependencies to ensure proper loading.

let mitexWasm: typeof import('mitex-wasm') | null = null;
let mitexLoadPromise: Promise<typeof import('mitex-wasm') | null> | null = null;
const emptySpec = new Uint8Array(0);

/**
 * Lazily load the mitex-wasm module.
 * Returns the module if available, null otherwise.
 */
async function loadMitexWasm(): Promise<typeof import('mitex-wasm') | null> {
  if (mitexWasm) return mitexWasm;
  if (mitexLoadPromise) return mitexLoadPromise;

  // Only load in browser environment (client-side)
  if (typeof window === 'undefined') {
    console.warn('[math-convert] mitex-wasm not available in server-side rendering');
    return null;
  }

  mitexLoadPromise = (async () => {
    try {
      const module = await import('mitex-wasm');
      mitexWasm = module;
      console.log('[math-convert] mitex-wasm loaded successfully');
      return module;
    } catch (err) {
      console.warn('[math-convert] Failed to load mitex-wasm:', err);
      mitexLoadPromise = null;
      return null;
    }
  })();

  return mitexLoadPromise;
}


/**
 * Try to initialize mitex-wasm eagerly (non-blocking).
 * Call this on app startup to pre-load the WASM module.
 */
export function initMitexWasm(): void {
  loadMitexWasm();
}

// ============================================================================
// LaTeX → Typst Conversion
// ============================================================================

/**
 * Convert LaTeX math to Typst math using mitex-wasm.
 * Falls back to tex2typst if mitex-wasm is not available.
 *
 * @param latex - LaTeX math string (without $ delimiters)
 * @returns Typst math string
 */
export function latexToTypstMath(latex: string): string {
  const input = (latex ?? '').trim();
  if (!input) return '';

  // Strip display math delimiters if present
  let cleanInput = input;
  if (cleanInput.startsWith('$$') && cleanInput.endsWith('$$')) {
    cleanInput = cleanInput.slice(2, -2).trim();
  } else if (cleanInput.startsWith('\\[') && cleanInput.endsWith('\\]')) {
    cleanInput = cleanInput.slice(2, -2).trim();
  } else if (cleanInput.startsWith('$') && cleanInput.endsWith('$') && cleanInput.length > 2) {
    cleanInput = cleanInput.slice(1, -1).trim();
  }

  // Try synchronous conversion with mitex-wasm if already loaded
  if (mitexWasm) {
    try {
      return mitexWasm.convert_math(cleanInput, emptySpec);
    } catch (err) {
      console.warn('[math-convert] mitex-wasm conversion failed:', err);
      // Fall through to tex2typst fallback
    }
  }

  // Fallback: use tex2typst (pure JS)
  try {
    // Dynamic import of tex2typst's tex2typst function
    const { tex2typst } = require('tex2typst');
    return tex2typst(cleanInput, {
      nonStrict: true,
      preferShorthands: true,
      fracToSlash: false, // Keep frac() notation for consistency with mitex
      inftyToOo: false,
      optimize: true,
    });
  } catch (err) {
    console.warn('[math-convert] tex2typst conversion failed:', err);
    return cleanInput; // Return as-is on any failure
  }
}

/**
 * Async version of latexToTypstMath that ensures mitex-wasm is loaded.
 * Prefer this version when you can await the result.
 *
 * @param latex - LaTeX math string
 * @returns Promise resolving to Typst math string
 */
export async function latexToTypstMathAsync(latex: string): Promise<string> {
  const input = (latex ?? '').trim();
  if (!input) return '';

  // Strip display math delimiters
  let cleanInput = input;
  if (cleanInput.startsWith('$$') && cleanInput.endsWith('$$')) {
    cleanInput = cleanInput.slice(2, -2).trim();
  } else if (cleanInput.startsWith('\\[') && cleanInput.endsWith('\\]')) {
    cleanInput = cleanInput.slice(2, -2).trim();
  } else if (cleanInput.startsWith('$') && cleanInput.endsWith('$') && cleanInput.length > 2) {
    cleanInput = cleanInput.slice(1, -1).trim();
  }

  const wasm = await loadMitexWasm();
  if (wasm) {
    try {
      return wasm.convert_math(cleanInput, emptySpec);
    } catch (err) {
      console.warn('[math-convert] mitex-wasm async conversion failed:', err);
    }
  }

  // Fallback to tex2typst
  try {
    const { tex2typst: t2t } = await import('tex2typst');
    return t2t(cleanInput, {
      nonStrict: true,
      preferShorthands: true,
      fracToSlash: false,
      inftyToOo: false,
      optimize: true,
    });
  } catch (err) {
    console.warn('[math-convert] tex2typst async conversion failed:', err);
    return cleanInput;
  }
}

// ============================================================================
// Typst → LaTeX Conversion
// ============================================================================

/**
 * Convert Typst math to LaTeX math using tex2typst library.
 * Since mitex-wasm does not support reverse conversion, we use tex2typst.
 *
 * @param typst - Typst math string
 * @returns LaTeX math string
 */
export function typstToLatexMath(typst: string): string {
  const input = (typst ?? '').trim();
  if (!input) return '';

  try {
    return typst2tex(input, {
      blockMathMode: false,
    });
  } catch (err) {
    console.warn('[math-convert] typst2tex conversion failed:', err);
    return input; // Return as-is on failure
  }
}

// ============================================================================
// Helper: Convert Typst content (with $...$) to LaTeX
// ============================================================================

/**
 * Convert mixed Typst content containing $...$ math blocks to LaTeX.
 * Non-math content is preserved as-is.
 *
 * @param text - Typst content potentially containing inline math
 * @returns Content with inline math converted to LaTeX
 */
export function convertTypstContentToLatex(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const dollar = text.indexOf('$', i);
    if (dollar === -1) {
      result += text.slice(i);
      break;
    }

    // Append text before dollar
    result += text.slice(i, dollar);

    // Find closing dollar
    const nextDollar = text.indexOf('$', dollar + 1);

    // If no closing dollar, treat as literal text
    if (nextDollar === -1) {
      result += text.slice(dollar);
      break;
    }

    // Convert the inner Typst math to LaTeX
    const inner = text.slice(dollar + 1, nextDollar);
    const latex = typstToLatexMath(inner);
    result += `$${latex}$`;
    i = nextDollar + 1;
  }

  return result;
}
