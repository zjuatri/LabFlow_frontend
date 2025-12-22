'use client';

import { TypstBlock } from '@/lib/typst';

interface CodeBlockEditorProps {
  block: TypstBlock;
  onUpdate: (updates: Partial<TypstBlock>) => void;
}

export default function CodeBlockEditor({ block, onUpdate }: CodeBlockEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* 语言选择器 */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">语言</label>
        <input
          type="text"
          value={block.language || 'python'}
          onChange={(e) => onUpdate({ language: e.target.value })}
          placeholder="语言"
          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 w-32"
        />
      </div>

      {/* 代码编辑器 */}
      <textarea
        value={block.content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
        rows={Math.max(3, block.content.split('\n').length)}
        placeholder="输入代码..."
      />
    </div>
  );
}
