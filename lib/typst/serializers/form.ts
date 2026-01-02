import { TypstBlock } from '../types';
import { base64EncodeUtf8 } from '../utils';

export function serializeInputField(block: TypstBlock): string {
    // Support both old single-line and new multi-line format
    const getLines = (): Array<{ label: string; value: string }> => {
        if (block.inputLines && block.inputLines.length > 0) {
            return block.inputLines;
        }
        return [{ label: block.inputLabel || '', value: block.inputValue || '' }];
    };

    const lines = getLines();
    const separator = block.inputSeparator ?? '：';
    const showUnderline = block.inputShowUnderline !== false;
    const width = block.inputWidth || '50%';
    const align = block.inputAlign || 'center';
    const fontSize = block.inputFontSize || '';
    const fontFamily = (block.inputFontFamily || 'SimSun').trim();

    // Encode metadata for parsing
    const payload = {
        lines,
        separator,
        showUnderline,
        width,
        align,
        fontSize,
        fontFamily,
    };
    const encoded = `/*LF_INPUT:${base64EncodeUtf8(JSON.stringify(payload))}*/`;

    // Build font args string
    const fontArgs: string[] = [];
    if (fontSize) fontArgs.push(`size: ${fontSize}`);
    if (fontFamily) fontArgs.push(`font: "${fontFamily}"`);
    const fontPrefix = fontArgs.length > 0 ? `#text(${fontArgs.join(', ')})` : '';

    // Generate Typst for each line - join with space instead of newline to keep everything on one line
    const typstLines = lines.map(line => {
        const leftPart = `${line.label}${separator}`;
        let rightPart: string;
        if (showUnderline) {
            // If the value is empty, Typst may collapse the box height, making the underline appear at the top.
            // Force a stable line height so the bottom stroke stays at the bottom.
            rightPart = `#box(width: 100%, height: 1.2em, stroke: (bottom: 0.5pt + black), inset: (bottom: 3pt))[#align(center + horizon)[${line.value}]]`;
        } else {
            rightPart = `#box(width: 100%, height: 1.2em)[#align(center + horizon)[${line.value}]]`;
        }
        // Apply font to each grid row individually
        const gridContent = `#grid(columns: (auto, 1fr), column-gutter: 0pt)[${leftPart}][${rightPart}]`;
        return fontPrefix ? `${fontPrefix}[${gridContent}]` : gridContent;
    });

    // Join lines with #parbreak() to create visual line breaks, all on single line for parsing
    const innerContent = typstLines.join(' #parbreak() ');

    // Wrap in a box with specified total width, then align - all on one line
    return `#align(${align})[#box(width: ${width})[${innerContent}]]${encoded}`;
}
