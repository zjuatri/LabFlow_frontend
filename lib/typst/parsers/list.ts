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
    const enumMatch = content.match(/^#enum\s*\(([^)]*)\)((?:\[[^\]]*\])+)$/);
    const listMatch = content.match(/^#list\s*\([^)]*\)((?:\[[^\]]*\])+)$/);

    if (!enumMatch && !listMatch) return null;

    const isOrdered = !!enumMatch;
    const bracketPart = (enumMatch || listMatch)![isOrdered ? 2 : 1];

    // Extract start parameter from #enum(start: N, ...)
    let startNum = 1;
    if (isOrdered && enumMatch) {
        const args = enumMatch[1];
        const startMatch = args.match(/start\s*:\s*(\d+)/);
        if (startMatch) {
            startNum = parseInt(startMatch[1], 10);
        }
    }

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
    // Strip any existing number prefixes from Items (e.g., "1. 1. item" -> "item")
    // This prevents duplicate numbering when the source already had numbered content inside #enum items
    const stripNumberPrefix = (text: string): string => {
        // Match patterns like "1. 1." or "1." or "1) 1." etc. at the start
        return text.replace(/^(\d+[.)]\s*)+/, '').trim();
    };

    const listContent = items.map((item, idx) => {
        const cleanItem = stripNumberPrefix(item);
        if (isOrdered) {
            // Use the start number from #enum(start: N)
            return `${startNum + idx}. ${cleanItem || item}`;
        } else {
            // For unordered, strip any bullet prefix too
            const stripped = cleanItem.replace(/^[-*]\s*/, '').trim();
            return `- ${stripped || item}`;
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

        // Helper to strip duplicate number prefixes (e.g., "1. 1. item" -> "item")
        const stripNumberPrefix = (text: string): string => {
            return text.replace(/^(\d+[.)]\s*)+/, '').trim();
        };

        for (let i = 0; i < outItems.length; i++) {
            const body = outItems[i];
            const cleanBody = stripNumberPrefix(body);
            if (isEnum) {
                items.push(cleanBody.length === 0 ? `${i + 1}. ` : `${i + 1}. ${cleanBody}`);
            } else {
                const stripped = cleanBody.replace(/^[-*]\s*/, '').trim();
                items.push(stripped.length === 0 ? '- ' : `- ${stripped}`);
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
