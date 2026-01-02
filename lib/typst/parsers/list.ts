import { TypstBlock } from '../types';
import { generateId } from '../utils';

/**
 * Parse inline enum/list syntax: #enum(tight: true)[item1][item2]...
 * Also handles font wrapper: #text(font: "...")[#enum(...)]
 * Returns null if not matching this format
 */
export function parseInlineEnumOrList(trimmed: string): TypstBlock | null {
    // Try to unwrap #text(font: "...")[...] first
    let content = trimmed;
    let font: string | undefined;

    const textWrapMatch = content.match(/^#text\s*\(\s*font\s*:\s*"([^"]+)"\s*\)\s*\[([\s\S]*)\]$/);
    if (textWrapMatch) {
        font = textWrapMatch[1];
        content = textWrapMatch[2].trim();
    }

    // Now check for #enum(...)[...][...] or #list(...)[...][...]
    const enumMatch = content.match(/^#enum\s*\([^)]*\)((?:\[[^\]]*\])+)$/);
    const listMatch = content.match(/^#list\s*\([^)]*\)((?:\[[^\]]*\])+)$/);

    if (!enumMatch && !listMatch) return null;

    const isOrdered = !!enumMatch;
    const bracketPart = (enumMatch || listMatch)![1];

    // Extract items from [item1][item2][item3]...
    const items: string[] = [];
    let depth = 0;
    let start = -1;
    for (let idx = 0; idx < bracketPart.length; idx++) {
        const ch = bracketPart[idx];
        if (ch === '[') {
            if (depth === 0) start = idx + 1;
            depth++;
        } else if (ch === ']') {
            depth--;
            if (depth === 0 && start >= 0) {
                items.push(bracketPart.slice(start, idx).trim());
                start = -1;
            }
        }
    }

    if (items.length === 0) return null;

    // Convert to list content format
    const listContent = items.map((item, idx) => {
        if (isOrdered) {
            return `${idx + 1}. ${item}`;
        } else {
            return `- ${item}`;
        }
    }).join('\n');

    const block: TypstBlock = {
        id: generateId(),
        type: 'list',
        content: listContent,
    };
    if (font) {
        block.font = font;
    }

    return block;
}

export function parseBlockList(lines: string[], startIndex: number): { items: string[]; endIndex: number } {
    const items: string[] = [];
    let j = startIndex + 1;
    let foundEnumOrListLine: string | null = null;

    for (; j < lines.length; j++) {
        const inner = lines[j].replace(/\r$/, '');
        const innerTrim = inner.trim();
        if (innerTrim === ']') break;
        if (innerTrim === '' || innerTrim.startsWith('#set ')) continue;

        if (innerTrim.startsWith('#enum(') || innerTrim.startsWith('#list(')) {
            foundEnumOrListLine = innerTrim;
            continue;
        }

        if (innerTrim.startsWith('-')) {
            const body = innerTrim.substring(1).trim();
            items.push(body.length === 0 ? '- ' : `- ${body}`);
            continue;
        }
        if (innerTrim.startsWith('+')) {
            const body = innerTrim.substring(1).trim();
            items.push(body.length === 0 ? '1. ' : `1. ${body}`);
            continue;
        }
    }

    if (items.length === 0 && foundEnumOrListLine) {
        const isEnum = foundEnumOrListLine.startsWith('#enum(');
        const s = foundEnumOrListLine;
        const outItems: string[] = [];
        let idx = s.indexOf(')');
        if (idx >= 0) {
            idx += 1;
            let depth = 0;
            let start = -1;
            for (; idx < s.length; idx++) {
                const ch = s[idx];
                if (ch === '[') {
                    if (depth === 0) start = idx + 1;
                    depth++;
                } else if (ch === ']') {
                    depth--;
                    if (depth === 0 && start >= 0) {
                        const body = s.slice(start, idx).trim();
                        outItems.push(body);
                        start = -1;
                    }
                }
            }
        }

        for (const body of outItems) {
            if (isEnum) {
                items.push(body.length === 0 ? '1. ' : `1. ${body}`);
            } else {
                items.push(body.length === 0 ? '- ' : `- ${body}`);
            }
        }
    }

    if (j < lines.length && lines[j].replace(/\r$/, '').trim() === ']') {
        return { items, endIndex: j };
    }

    return { items: [], endIndex: startIndex };
}

export function parseListItem(
    trimmed: string,
    currentBlock: TypstBlock | null,
    currentParagraphIsList: boolean,
    pendingParagraphLeading: number | undefined
): { block: TypstBlock | null; isList: boolean; shouldFlush: boolean } {
    const content = trimmed.substring(1).trim();
    const asText = trimmed.startsWith('-') ? `- ${content}` : `1. ${content}`;

    if (currentBlock?.type === 'paragraph' && currentParagraphIsList) {
        currentBlock.content += '\n' + asText;
        return { block: currentBlock, isList: true, shouldFlush: false };
    }

    const newBlock: TypstBlock = {
        id: generateId(),
        type: 'paragraph',
        content: asText,
    };
    if (typeof pendingParagraphLeading === 'number') {
        newBlock.lineSpacing = pendingParagraphLeading;
    }
    return { block: newBlock, isList: true, shouldFlush: true };
}
