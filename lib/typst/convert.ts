import { TypstBlock } from './types';
import { generateId } from './utils';

// 重新导出序列化和解析函数
export { blocksToTypst } from './serialize';
export { typstToBlocks } from './parse';

// 默认块
export function getDefaultBlocks(): TypstBlock[] {
  return [
    {
      id: generateId(),
      type: 'heading',
      content: 'Hello Typst!',
      level: 1,
    },
    {
      id: generateId(),
      type: 'paragraph',
      content: 'This is a *bold* text and _italic_ text.',
    },
  ];
}

