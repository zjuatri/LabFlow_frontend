import { BlockParser } from './block-parser';
import { CoverParser } from '../parsers/cover';
import { ListParser } from '../parsers/list';
import { MathParser } from '../parsers/math';
import { CodeParser } from '../parsers/code';
import { HeadingParser } from '../parsers/heading';
import { TableParser } from '../parsers/table';
import { CompositeRowParser } from '../parsers/composite-row';
import { VerticalSpaceParser } from '../parsers/vertical-space';
import { InputFieldParser } from '../parsers/input-field';
import { MediaParser } from '../parsers/media';
import { ParagraphParser } from '../parsers/paragraph';

export class ParserRegistry {
    private parsers: BlockParser[] = [];

    register(parser: BlockParser) {
        this.parsers.push(parser);
    }

    getParsers(): BlockParser[] {
        return this.parsers;
    }
}

export const globalRegistry = new ParserRegistry();

// Register parsers in order of specificity
globalRegistry.register(new CoverParser());
globalRegistry.register(new ListParser()); // Handles #block list & #enum/#list
globalRegistry.register(new MathParser());
globalRegistry.register(new CodeParser());
globalRegistry.register(new HeadingParser());
globalRegistry.register(new TableParser());
globalRegistry.register(new CompositeRowParser());
globalRegistry.register(new VerticalSpaceParser());
globalRegistry.register(new InputFieldParser());
globalRegistry.register(new MediaParser());
// ParagraphParser is the catch-all for text and -/+, so it goes last
globalRegistry.register(new ParagraphParser());
