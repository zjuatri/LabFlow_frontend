
import { TypstBlock } from '../types';

export interface BlockParser {
    /**
     * Attempt to parse a block starting at the given line index.
     * @param lines All lines of the Typst source code.
     * @param index Current line index.
     * @returns The parsed block and the next line index (endIndex), or null if this parser cannot handle the line.
     */
    parse(lines: string[], index: number): { block: TypstBlock; endIndex: number } | null;
}
