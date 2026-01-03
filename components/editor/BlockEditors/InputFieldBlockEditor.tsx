'use client';

import { TypstBlock } from '@/lib/typst';

interface InputFieldBlockEditorProps {
    block: TypstBlock;
    onUpdate: (updates: Partial<TypstBlock>) => void;
}

type InputLine = { label: string; value: string };

export default function InputFieldBlockEditor({ block, onUpdate }: InputFieldBlockEditorProps) {
    // Support both old single-line format and new multi-line format
    const getLines = (): InputLine[] => {
        if (block.inputLines && block.inputLines.length > 0) {
            return block.inputLines;
        }
        // Migrate from old single-line format
        return [{ label: block.inputLabel || '', value: block.inputValue || '' }];
    };

    const lines = getLines();
    const separator = block.inputSeparator ?? '：';
    const showUnderline = block.inputShowUnderline !== false;
    const width = parseInt(block.inputWidth || '50', 10);
    const align = block.inputAlign || 'center';
    const fontSize = block.inputFontSize || '';
    const fontFamily = block.inputFontFamily || '';

    const updateLine = (index: number, field: 'label' | 'value', newValue: string) => {
        const newLines = [...lines];
        newLines[index] = { ...newLines[index], [field]: newValue };
        onUpdate({ inputLines: newLines });
    };

    const addLine = () => {
        onUpdate({ inputLines: [...lines, { label: '', value: '' }] });
    };

    const removeLine = (index: number) => {
        if (lines.length <= 1) return;
        const newLines = lines.filter((_, i) => i !== index);
        onUpdate({ inputLines: newLines });
    };

    return (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded space-y-3">
            {/* Input lines */}
            {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={line.label}
                        onChange={(e) => updateLine(index, 'label', e.target.value)}
                        placeholder="类别"
                        className="w-32 px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                    />
                    <span className="text-sm text-zinc-500">{separator}</span>
                    <div className={`flex-1 px-2 py-1 text-sm text-center border-b ${showUnderline ? 'border-zinc-500' : 'border-transparent'} bg-white dark:bg-zinc-800`}>
                        <input
                            type="text"
                            value={line.value}
                            onChange={(e) => updateLine(index, 'value', e.target.value)}
                            placeholder="内容"
                            className="w-full text-center bg-transparent outline-none"
                        />
                    </div>
                    {lines.length > 1 && (
                        <button
                            type="button"
                            onClick={() => removeLine(index)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                            title="删除此行"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            ))}

            {/* Add line button */}
            <button
                type="button"
                onClick={addLine}
                className="w-full py-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-dashed border-blue-300 rounded flex items-center justify-center gap-1"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                添加一行
            </button>

            {/* Second row: Width Slider (Full line) */}
            <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 dark:text-zinc-400 w-8">宽度</span>
                <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={width}
                    onChange={(e) => onUpdate({ inputWidth: `${e.target.value}%` })}
                    className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                />
                <span className="text-zinc-600 dark:text-zinc-400 w-8 text-right">{width}%</span>
            </div>

            {/* Separator input */}
            <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">分隔符</span>
                <input
                    type="text"
                    value={separator}
                    onChange={(e) => onUpdate({ inputSeparator: e.target.value })}
                    className="w-12 px-2 py-1 text-sm text-center border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-4 flex-wrap text-xs">
                {/* Alignment */}
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">对齐</span>
                    <select
                        value={align}
                        onChange={(e) => onUpdate({ inputAlign: e.target.value as 'left' | 'center' | 'right' })}
                        className="px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                    >
                        <option value="left">左</option>
                        <option value="center">中</option>
                        <option value="right">右</option>
                    </select>
                </div>

                {/* Font Family */}
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">字体</span>
                    <select
                        value={fontFamily}
                        onChange={(e) => onUpdate({ inputFontFamily: e.target.value || undefined })}
                        className="px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                    >
                        <option value="">默认(宋体)</option>
                        <option value="SimSun">宋体</option>
                        <option value="SimHei">黑体</option>
                        <option value="KaiTi">楷体</option>
                        <option value="FangSong">仿宋</option>
                    </select>
                </div>

                {/* Font size */}
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">字号</span>
                    <select
                        value={fontSize}
                        onChange={(e) => onUpdate({ inputFontSize: e.target.value || undefined })}
                        className="px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                    >
                        <option value="">默认</option>
                        <option value="9pt">小五 (9pt)</option>
                        <option value="10.5pt">五号 (10.5pt)</option>
                        <option value="12pt">小四 (12pt)</option>
                        <option value="14pt">四号 (14pt)</option>
                        <option value="15pt">小三 (15pt)</option>
                        <option value="16pt">三号 (16pt)</option>
                        <option value="18pt">小二 (18pt)</option>
                        <option value="22pt">二号 (22pt)</option>
                    </select>
                </div>

                {/* Underline toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showUnderline}
                        onChange={(e) => onUpdate({ inputShowUnderline: e.target.checked })}
                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-zinc-500 dark:text-zinc-400">下划线</span>
                </label>
            </div>
        </div>
    );
}
