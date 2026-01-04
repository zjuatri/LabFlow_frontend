
import { TypstBlock } from '../types';
import { generateId, LF_ANSWER_MARKER, LF_EMPTY_PAR_MARKER, defaultParagraphLeadingEm, inferLineSpacingMultiplier } from '../utils';
import { BlockParser } from '../core/block-parser';

export class ParagraphParser implements BlockParser {
    // Keep state of pending paragraph leadings across lines?
    // BlockParser interface starts at 'index' with 'lines'.
    // If the previous parser didn't consume a "#set par(...)" line, it will be visible here.
    // However, the Core Registry loop will handle finding parsers.
    // If we want to handle `#set par(...)` lines, we should either:
    // a) Have a specific SetParParser that consumes it and updates some context (but BlockParser logic is stateless usually).
    // b) Allow ParagraphParser to consume preceding `#set par` lines. 

    // In `parse.ts`, `pendingParagraphLeading` was a state variable outside the loop.
    // If we move to BlockParsers, we need a way to pass context or handle this.
    // For now, let's assume `ParagraphParser` logic handles `set par` if it sees it,
    // OR we create a `ContextParser`? No.
    // Let's make `ParagraphParser` robust enough to consume `set par` lines IF they are immediately followed by paragraph text.
    // But `set par` might affect multiple blocks?
    // In original code: `if (trimmed === '#set par...') pendingParagraphLeading = ...; continue;`
    // It affects the NEXT created paragraph block.

    // If we want to preserve this behavior without a state object passed to `parse`, 
    // we can make `ParagraphParser` consume these lines as part of the "block" it is building?
    // But then the block would contain `set par` which is not what we want (visual block doesn't show it).
    // The visual block has `lineSpacing` property.

    // Compromise: `ParagraphParser` can look ahead. If it sees `set par`, it records it, then looks for text.
    // It creates a block with that setting.
    // Does `set par` persist across multiple blocks? 
    // Original code: `pendingParagraphLeading` is reset when used?
    // `currentBlock` created -> use `pending`.
    // Next block? `pending` persists until changed? 
    // Original code: `pendingParagraphLeading` is defined outside loop.
    // When `trimmed === ''` (empty line), `currentBlock` is pushed.
    // `if (currentBlock.type === 'paragraph' && typeof pendingParagraphLeading === 'number') currentBlock.lineSpacing = ...`
    // It seems it persists.

    // This implies we need a shared context or the parser has to handle state.
    // `BlockParser` could accept a `context` object?
    // Let's modify `BlockParser` interface? 
    // Or simpler: `ParagraphParser` handles `set par` and applies it locally. 
    // If `set par` affects GLOBAL state, that's harder.
    // In Typst, `set` rules are scoped.
    // If we assume the editor uses `set par` immediately before paragraphs (as per `serialize` logic), then local consumption is fine.
    // Serializer usually emits `#set ...` right before content if needed?
    // Or is it global document setting?
    // In `utils-text.ts`, `defaultParagraphLeadingEm` suggests it's a default.
    // If `parse.ts` logic is: `if (trimmed == set ...) pending = ... continue`. 
    // It affects SUBSEQUENT blocks until changed.

    // I will modify `BlockParser` to allow updating a Context if needed?
    // Or just `ParagraphParser` consumes it and applies to the NEXT paragraph it finds.
    // If there are multiple paragraphs, does it apply to all?
    // Since `typstToBlocks` is linear, if `ParagraphParser` consumes the `set` line, subsequent parsers won't see it.
    // So `ParagraphParser` should only consume `set` if it immediately forms a paragraph.
    // If there is `set par` then `Heading`, does Heading need it? No.
    // So if `ParagraphParser` sees `set par`, then `text`, it makes a paragraph with that spacing.
    // If it sees `set par`, then `=`, it should probably NOT consume the `set par`? 
    // But then who consumes it?
    // Maybe a `SetRuleParser`? But it doesn't return a visual block.

    // NOTE: The `BlockParser` interface expects `TypstBlock` return.
    // If we return `null` (no block), we skip line? No, we need to advance index.
    // We can add a type of block "Hidden" or "Settings"?
    // Or `BlockParser` returns `{ block?: TypstBlock, endIndex }`?
    // If block is undefined, we simply advance index (consuming line).

    // I will update `BlockParser` interface to allow optional block.

    parse(lines: string[], index: number): { block: TypstBlock; endIndex: number } | null {
        let currentIndex = index;
        let lineSpacing: number | undefined = undefined;

        // 1. Consume any preceding #set par(...) lines
        while (currentIndex < lines.length) {
            const line = lines[currentIndex].trim();
            if (line.startsWith('#set par(leading:')) {
                const leadingMatch = line.match(/^#set\s+par\(\s*leading\s*:\s*([0-9.]+)em\s*\)\s*$/);
                if (leadingMatch) {
                    const v = Number(leadingMatch[1]);
                    lineSpacing = Number.isFinite(v) ? inferLineSpacingMultiplier(v) : undefined;
                } else if (line === '#set par(leading: auto)' || line === `#set par(leading: ${defaultParagraphLeadingEm}em)`) {
                    lineSpacing = undefined;
                }
                currentIndex++;
            } else if (line.startsWith(LF_ANSWER_MARKER) && line.includes('#block(')) {
                // Single line answer block... handled as paragraph below or specific check?
                // Let's break to handle it as content.
                break;
            } else if (line.startsWith('/*LF_')) {
                // Other markers... stop consuming settings
                break;
            } else if (line === '') {
                // Empty line... usually ignore?
                // But if we consumed settings and hit empty line, we carry over spacing?
                // Original logic kept `pendingParagraphLeading` across empty lines.
                // Here, if we return a block, fine.
                currentIndex++; // Consume empty lines
            } else {
                break; // Found content?
            }
        }

        if (currentIndex >= lines.length) return null; // Only settings found? 

        // 2. Check if current line is a valid paragraph start
        // Must NOT be a start of another block type (Heading, Code, etc.)
        // We assume other parsers ran BEFORE this or we explicitly check.
        // Ideally, ParagraphParser is LAST in registry.
        const startLine = lines[currentIndex].replace(/\r$/, '');
        const trimmed = startLine.trim();


        // Handle explicit Empty Paragraph Marker
        if (trimmed === LF_EMPTY_PAR_MARKER) {
            return {
                block: {
                    id: generateId(),
                    type: 'paragraph',
                    content: '', // Empty content
                },
                endIndex: currentIndex + 1
            };
        }

        // Hard checks for other block types to avoid consuming them as text
        if (trimmed.startsWith('=') ||
            trimmed.startsWith('```') ||
            trimmed.startsWith('#image(') ||
            trimmed.startsWith('#figure(') ||
            (trimmed.includes('/*LF_') && trimmed !== LF_EMPTY_PAR_MARKER) || // Markers (exclude our empty par marker)
            trimmed.startsWith('$') ||
            trimmed.startsWith('#block(') || // vertical space, lists, etc.
            trimmed.startsWith('#v(') ||
            trimmed.startsWith('#enum(') ||
            trimmed.startsWith('#list(')
        ) {
            // Exceptions:
            // - #block() answer placeholder is handled as paragraph
            if (trimmed.includes(LF_ANSWER_MARKER)) {
                // It IS a paragraph (answer placeholder)
            } else if (trimmed.startsWith('#block(') && !trimmed.includes('width:')) {
                // Check if answer placeholder without marker? 
                // Original logic: if (trimmed.startsWith('#block(') && !trimmed.includes(LF_ANSWER_MARKER)) ... check peek
                // If it is an answer placeholder, it is a paragraph.
                // If it is block list `block[..]`, it is paragraph.
                // If it is vertical space `block(height:...)`, it is NOT.
                if (trimmed.includes('height:')) return null; // Vertical space
                // Block list? `block[...]` or `block()[...]`
                if (/^#block(?:\([^)]*\))?\[$/.test(trimmed)) return null; // Let ListParser handle?
                // Answer placeholder usually `#block(inset: ..., breakable: ...)[...]`. 
            } else {
                return null;
            }
        }

        // Special handling for #align(...) - it might wrap paragraphs OR images/tables
        // We should accept it only if it's wrapping plain text, not images/tables/figures
        if (trimmed.startsWith('#align(')) {
            // Check if it wraps an image, figure, or table - if so, reject (let MediaParser/TableParser handle)
            if (trimmed.includes('#image(') ||
                trimmed.includes('#figure(') ||
                trimmed.includes('/*LF_TABLE') ||
                trimmed.includes('/*LF_IMAGE') ||
                trimmed.includes('#table(')) {
                return null;
            }
            // Otherwise, it's a centered paragraph - we'll handle it below
        }

        // 3. Accumulate lines
        let placeholder: string | undefined;

        // Handle Answer Placeholder start
        if (trimmed.includes(LF_ANSWER_MARKER) || (trimmed.startsWith('#block(') && !trimmed.includes('height:'))) {
            // Handle answer placeholder logic
            // Simplified: just consume until end of block logic?
            // Original: `i = endIdx;` (skips lines) and pushes placeholder block.

            // Check for marker
            let foundMarker = trimmed.includes(LF_ANSWER_MARKER);
            let endIdx = currentIndex;

            if (!foundMarker && trimmed.startsWith('#block(')) {
                // Peek forward
                for (let peek = currentIndex; peek < Math.min(currentIndex + 20, lines.length); peek++) {
                    if (lines[peek].includes(LF_ANSWER_MARKER)) {
                        foundMarker = true;
                        endIdx = peek;
                        break;
                    }
                }
            } else if (foundMarker) {
                endIdx = currentIndex;
            }

            if (foundMarker) {
                return {
                    block: {
                        id: generateId(),
                        type: 'paragraph',
                        content: '\u200B',
                        placeholder: '在此填写答案...',
                    },
                    endIndex: endIdx + 1
                };
            }
        }

        // Standard Paragraph / List Item
        const contentLines: string[] = [];

        // Loop until we hit a block boundary
        let i = currentIndex;
        while (i < lines.length) {
            const l = lines[i].replace(/\r$/, '');
            const t = l.trim();

            if (t === '') {
                // Empty line ends a paragraph
                break;
            }

            // Check if this line starts a different block type
            if (i > currentIndex) { // Only check subsequent lines
                if (t.startsWith('=') || t.startsWith('```') || t.startsWith('$') || t.includes('/*LF_') || t.startsWith('#image')) {
                    break;
                }
                // If we are in a list, and see text?
                // If we are in text, and see `-`?
                // They merge. 
            }

            // Process content
            let lineText = t;

            // List item conversion
            if (t.startsWith('- ') || t.startsWith('+ ') || t === '-' || t === '+') {
                const body = t.substring(1).trim();
                lineText = t.startsWith('-') ? `- ${body}` : `1. ${body}`;
            } else {
                // Text line
                lineText = t.replace(
                    /\s*#linebreak\(\s*(?:justify\s*:\s*(?:true|false)\s*)?\)\s*/g,
                    '\n'
                );
            }

            // Remove markers
            if (lineText.includes(LF_ANSWER_MARKER)) {
                lineText = lineText.replace(LF_ANSWER_MARKER, '');
                placeholder = '在此填写答案...';
            }

            contentLines.push(lineText);
            i++;
        }

        if (contentLines.length === 0) {
            // If we consumed only settings but no content, and hit EOF or Block Boundary?
            // If we have settings, we might want to return something? 
            // OR we just consumed settings and return null, effectively advancing index?
            // "endIndex" logic requires returning a block?
            // I'll return null for now, which implies "didn't parse a block".
            // But if we advanced `currentIndex` (skipped settings), the caller `parse` loop should resume from `currentIndex`?
            // No, `parse` loop passes `index`. If we return null, it tries next parser at SAME `index`.
            // So if we consumed settings but failed to match paragraph, we must NOT consume settings.
            // THIS is tricky. stateless.

            // Solution: Do NOT consume settings in `parse`. 
            // `ParagraphParser` should only match if `lines[index]` is content.
            // AND the core parser loop needs to handle `#set par`.
            // OR `ParagraphParser` returns a "NullBlock" which just advances index?
            return null;
        }

        return {
            block: {
                id: generateId(),
                type: 'paragraph',
                content: contentLines.join('\n'),
                lineSpacing: lineSpacing,
                placeholder: placeholder,
                // Note: unwrapBlockDecorators will be called later or here?
                // `parse.ts` calls it at the end.
            },
            endIndex: i
        };
    }
}
