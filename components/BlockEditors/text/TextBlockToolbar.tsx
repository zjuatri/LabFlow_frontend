import { TypstBlock } from '@/lib/typst';
import { Bold, Italic, Strikethrough, Sigma, Palette, Underline } from 'lucide-react';
import { RefObject } from 'react';

interface TextBlockToolbarProps {
    block: TypstBlock;
    onUpdate: (updates: Partial<TypstBlock>) => void;
    applyFormat: (fmt: 'bold' | 'italic' | 'strike' | 'underline' | 'color', color?: string) => void;
    applyList: (kind: 'ordered' | 'bullet') => void;
    insertInlineMath: () => void;
    showColorPicker: boolean;
    setShowColorPicker: (show: boolean) => void;
    colorPickerRef: RefObject<HTMLDivElement | null>;
}

export default function TextBlockToolbar({
    block,
    onUpdate,
    applyFormat,
    applyList,
    insertInlineMath,
    showColorPicker,
    setShowColorPicker,
    colorPickerRef
}: TextBlockToolbarProps) {
    return (
        <div className="flex gap-1 pb-2 border-b border-zinc-200 dark:border-zinc-700">
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    applyFormat('bold');
                }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="加粗 (Ctrl+B)"
            >
                <Bold size={16} />
            </button>
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    applyList('ordered');
                }}
                className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="有序列表"
            >
                1.
            </button>
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    applyList('bullet');
                }}
                className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="无序列表"
            >
                •
            </button>
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    applyFormat('italic');
                }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="斜体 (Ctrl+I)"
            >
                <Italic size={16} />
            </button>
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    applyFormat('strike');
                }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="删除线"
            >
                <Strikethrough size={16} />
            </button>
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    applyFormat('underline');
                }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="下划线 (Ctrl+U)"
            >
                <Underline size={16} />
            </button>
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    insertInlineMath();
                }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="插入行内公式"
            >
                <Sigma size={16} />
            </button>
            <div className="relative" ref={colorPickerRef}>
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setShowColorPicker(!showColorPicker);
                    }}
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                    title="文字颜色"
                >
                    <Palette size={16} />
                </button>
                {showColorPicker && (
                    <div className="absolute top-full left-0 mt-1 p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-50 w-max">
                        <div className="grid grid-cols-5 gap-2">
                            {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000'].map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        applyFormat('color', color);
                                        setShowColorPicker(false);
                                    }}
                                    className="w-7 h-7 rounded border border-zinc-300 dark:border-zinc-600 hover:scale-110 transition-transform"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">行距</span>
                <select
                    value={block.lineSpacing ? String(block.lineSpacing) : ''}
                    onChange={(e) => {
                        const v = e.target.value;
                        onUpdate({ lineSpacing: v ? Number(v) : undefined });
                    }}
                    className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    title="段落行间距"
                >
                    <option value="">默认</option>
                    <option value="0.8">0.8</option>
                    <option value="0.9">0.9</option>
                    <option value="1">1.0</option>
                    <option value="1.2">1.2</option>
                    <option value="1.5">1.5</option>
                    <option value="2">2.0</option>
                </select>
            </div>

            <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">字体</span>
                <select
                    value={block.font ?? 'SimSun'}
                    onChange={(e) => onUpdate({ font: e.target.value })}
                    className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    title="段落字体"
                >
                    <option value="SimSun">宋体</option>
                    <option value="SimHei">黑体</option>
                    <option value="KaiTi">楷体</option>
                    <option value="FangSong">仿宋</option>
                </select>
            </div>

            <div className="flex items-center gap-1 ml-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">对齐</span>
                <button
                    type="button"
                    onClick={() => onUpdate({ align: 'left' })}
                    className={`p-1 rounded transition-colors ${block.align === 'left' || !block.align ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    title="左对齐"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="15" y2="12" />
                        <line x1="3" y1="18" x2="18" y2="18" />
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={() => onUpdate({ align: 'center' })}
                    className={`p-1 rounded transition-colors ${block.align === 'center' ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    title="居中"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="6" y1="12" x2="18" y2="12" />
                        <line x1="4" y1="18" x2="20" y2="18" />
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={() => onUpdate({ align: 'right' })}
                    className={`p-1 rounded transition-colors ${block.align === 'right' ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    title="右对齐"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="9" y1="12" x2="21" y2="12" />
                        <line x1="6" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
