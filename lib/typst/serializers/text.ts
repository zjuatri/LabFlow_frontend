import { TypstBlock } from '../types';
import {
    LF_ANSWER_MARKER,
    convertMixedParagraph,
    defaultParagraphLeadingEm,
    leadingEmFromMultiplier,
    sanitizeTypstInlineMath,
    snapLineSpacingMultiplier
} from '../utils';

// serializeHeading
export function serializeHeading(block: TypstBlock): string {
    const level = block.level || 1;
    let body = `${'='.repeat(level)} ${block.content}`;

    // Apply font if set (default is SimSun, don't output if default)
    const font = (block.font ?? 'SimSun').trim();
    const align = block.align;

    // Typst syntax for heading styling is a bit different.
    // We can't wrap `#= Heading` inside `#align` or `#text` directly effectively for the structure.
    // BUT valid Typst allows `#align(center)[= Heading]` which aligns the heading node itself.

    // Apply settings
    if (font) {
        // For headings, font is usually set via show rule, but we can wrap the content if needed?
        // Actually `#text(font: "...")` around the heading content works but might be stripped by the heading structure parsing.
        // Safer way for inline heading style: `= #text(font: "...")[Heading Content]`
        // CJK bold/italic is handled via global show rules in preamble
        body = `${'='.repeat(level)} #text(font: "${font}")[${block.content}]`;
    }

    // Apply alignment
    if (align && align !== 'left') {
        // Wrap the entire heading in align
        body = `#align(${align})[${body}]`;
    }

    return body;
}

export function serializeParagraph(block: TypstBlock): string {
    const raw = block.content ?? '';
    const isAnswerBlank = !!block.placeholder && raw.replace(/\u200B/g, '').trim().length === 0;
    let body = sanitizeTypstInlineMath(convertMixedParagraph(raw));

    if (isAnswerBlank) {
        // Stylized placeholder box
        const placeholderBlock = `#block(
  width: 100%,
  height: 2em,
  fill: rgb("#EFF6FF"), // Light blue bg
  stroke: (paint: rgb("#BFDBFE"), dash: "dashed"), // Blue dashed border
  radius: 4pt,
  inset: 8pt,
  above: 12pt,
  below: 12pt
)[
  #align(center + horizon)[
    #text(fill: rgb("#93C5FD"), size: 0.9em)[( 请在此处填写答案 )]
  ]
]${LF_ANSWER_MARKER}`;

        // If it has leading setting (rare for empty block), wrap it? usually not needed for block.
        // Typst blocks handle their own spacing (above/below).
        return placeholderBlock;
    }

    const multiplierRaw = typeof block.lineSpacing === 'number' && Number.isFinite(block.lineSpacing)
        ? block.lineSpacing
        : undefined;
    const multiplier = typeof multiplierRaw === 'number' ? snapLineSpacingMultiplier(multiplierRaw) : undefined;

    // Apply font/size settings
    const font = (block.font ?? 'SimSun').trim();
    const size = block.fontSize ? block.fontSize.trim() : undefined;

    if (font || size) {
        const args: string[] = [];
        if (font) args.push(`font: "${font}"`);
        if (size) args.push(`size: ${size}`);

        // CJK bold/italic is handled via global show rules in preamble
        body = `#text(${args.join(', ')})[${body}]`;
    }

    // Apply alignment if set (default is left, don't output if default)
    const align = block.align;
    if (align && align !== 'left') {
        body = `#align(${align})[${body}]`;
    }

    if (typeof multiplier === 'number') {
        const leadingEm = leadingEmFromMultiplier(multiplier);
        return `#set par(leading: ${leadingEm}em)\n${body}\n#set par(leading: ${defaultParagraphLeadingEm}em)`;
    }

    return `${body}`;
}

export function serializeList(block: TypstBlock): string {
    const lines = (block.content ?? '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return '';

    // Detect if it's an ordered list (starts with "1." "2." etc) or unordered (starts with "-" or "*")
    const firstLine = lines[0];
    const isOrdered = /^\d+[.)]\s*/.test(firstLine);

    // Process items and sanitize inline math
    const processItem = (item: string): string => {
        return sanitizeTypstInlineMath(item);
    };

    let listExpr: string;
    if (isOrdered) {
        // Extract content after the number prefix for each line
        const items = lines.map(line => {
            const match = line.match(/^\d+[.)]\s*([\s\S]*)$/);
            return match ? match[1].trim() : line;
        }).filter(item => item.length > 0);
        
        if (items.length === 0) return '';
        const children = items.map(item => `[${processItem(item)}]`).join('');
        listExpr = `#enum(tight: true)${children}`;
    } else {
        // Unordered list - strip leading "-" or "*" if present
        const items = lines.map(line => {
            const match = line.match(/^[-*]\s*([\s\S]*)$/);
            return match ? match[1].trim() : line;
        }).filter(item => item.length > 0);

        if (items.length === 0) return '';
        const children = items.map(item => `[${processItem(item)}]`).join('');
        listExpr = `#list(tight: true)${children}`;
    }

    // Apply font if set (default to SimSun like paragraph for consistency)
    const font = (block.font ?? 'SimSun').trim();
    if (font) {
        return `#text(font: "${font}")[${listExpr}]`;
    }
    return listExpr;
}
