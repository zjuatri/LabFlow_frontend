import { TypstBlock } from '@/lib/typst';

interface VerticalSpaceBlockEditorProps {
    block: TypstBlock;
    onUpdate: (updates: Partial<TypstBlock>) => void;
}

export default function VerticalSpaceBlockEditor({ block, onUpdate }: VerticalSpaceBlockEditorProps) {
    // Parse current value (e.g. "2em") or default to "1em"
    const rawValue = block.content || '1em';
    // We primarily support 'em' in the slider, but preserve other units if typed manually (future).
    // For now, assume slider controls 'em'.
    const numValue = parseFloat(rawValue) || 1;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        onUpdate({ content: `${val}em` });
    };

    return (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded select-none">
            <div className="flex items-center gap-4">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 w-16">
                    空白高度
                </span>
                <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.5"
                    value={numValue}
                    onChange={handleChange}
                    className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                />
                <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 w-12 text-right">
                    {numValue}em
                </span>
            </div>
        </div>
    );
}
