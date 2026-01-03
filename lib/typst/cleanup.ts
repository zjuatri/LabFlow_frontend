/**
 * Cleanup malformed Typst patterns from older serialization bugs.
 * Handles patterns like:
 *   #text(font: "SimSun")[#text(font: "SimSun")[#block[]
 *   #text(font: "SimSun")[#block[
 *   #enum(tight: true)[...][...]
 *   ]]
 *   #text(font: "SimSun")[]]
 * 
 * And converts them to clean inline format.
 */
export function cleanupMalformedTypst(code: string): string {
    if (!code) return '';

    let result = code;

    // Pattern 1: Remove lines that are just opening malformed wrappers
    // #text(font: "SimSun")[#text(font: "SimSun")[#block[]
    result = result.replace(/^#text\s*\([^)]*\)\s*\[\s*#text\s*\([^)]*\)\s*\[\s*#block\s*\[\s*\]\s*$/gm, '');

    // Pattern 2: Remove lines that are just #text(font: "...")[#block[
    result = result.replace(/^#text\s*\([^)]*\)\s*\[\s*#block\s*\[\s*$/gm, '');

    // Pattern 3: Remove trailing empty wrapper closures
    // #text(font: "SimSun")[]] or just ]]
    result = result.replace(/^#text\s*\([^)]*\)\s*\[\s*\]\s*\]*\s*$/gm, '');

    // Pattern 4: Remove lone ]] that aren't part of valid structures
    result = result.replace(/^\s*\]\]\s*$/gm, '');

    // Pattern 5: Clean up the inline enum/list that might have extra wrapper: 
    // #text(font: "SimSun")[#block[ followed by #enum on next line, then ]] on following line
    // Replace with just the #enum line
    result = result.replace(
        /^(#text\s*\([^)]*\)\s*\[\s*#block\s*\[)\s*\n\s*(#(?:enum|list)\([^)]*\)(?:\[[^\]]*\])+)\s*\n\s*\]\]\s*$/gm,
        (_match, _wrapper, listExpr) => listExpr
    );

    // Clean up excessive blank lines left behind
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
}
