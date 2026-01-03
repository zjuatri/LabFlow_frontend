import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';
import { InlineMathState, InlineMathFormat } from '@/components/editor/BlockEditor-utils/types';

interface InlineMathEditorProps {
    state: InlineMathState;
    onUpdate: (newState: InlineMathState) => void;
    onClose: () => void;
}

export default function InlineMathEditor({ state, onUpdate, onClose }: InlineMathEditorProps) {
    return (
        <div className="inline-math-editor mt-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-500">编辑行内公式</span>
                <button
                    onClick={onClose}
                    className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                    关闭
                </button>
            </div>

            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">公式格式</span>
                <div className="flex bg-white dark:bg-zinc-900 rounded border border-zinc-300 dark:border-zinc-600 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => onUpdate({ ...state, format: 'latex' })}
                        className={`px-2 py-1 text-xs transition-colors ${state.format === 'latex'
                            ? 'bg-blue-500 text-white'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        LaTeX
                    </button>
                    <button
                        type="button"
                        onClick={() => onUpdate({ ...state, format: 'typst' })}
                        className={`px-2 py-1 text-xs transition-colors ${state.format === 'typst'
                            ? 'bg-blue-500 text-white'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        Typst
                    </button>
                </div>

                <div className="flex items-center gap-2 ml-4">
                    <label className="flex items-center gap-1 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={state.displayMode || false}
                            onChange={(e) => onUpdate({ ...state, displayMode: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">展示模式 (Display)</span>
                    </label>
                </div>
            </div>

            <textarea
                value={state.format === 'latex' ? state.latex : state.typst}
                onChange={(e) => {
                    const nextVal = e.target.value;
                    if (state.format === 'latex') {
                        const nextLatex = nextVal;
                        const nextTypst = latexToTypstMath(nextLatex);
                        onUpdate({ ...state, latex: nextLatex, typst: nextTypst });
                    } else {
                        const nextTypst = nextVal;
                        const nextLatex = typstToLatexMath(nextTypst);
                        onUpdate({ ...state, typst: nextTypst, latex: nextLatex });
                    }
                }}
                className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
                rows={2}
                placeholder={state.format === 'latex' ? '输入 LaTeX，例如: \\frac{1}{2}' : '输入 Typst math，例如: frac(1, 2)'}
                autoFocus
            />
            <div className="mt-1 text-[10px] text-zinc-400">
                说明：两种格式会自动互相转换（最佳努力）。
            </div>
        </div>
    );
}
