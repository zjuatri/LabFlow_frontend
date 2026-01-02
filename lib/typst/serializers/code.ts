import { TypstBlock } from '../types';

export function serializeCode(block: TypstBlock): string {
    const lang = block.language || 'python';
    return `\`\`\`${lang}\n${block.content}\n\`\`\``;
}
