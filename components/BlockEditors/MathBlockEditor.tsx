'use client';

import { TypstBlock } from '@/lib/typst';
import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';
import { Trash2, Plus } from 'lucide-react';

interface MathBlockEditorProps {
  block: TypstBlock;
  onUpdate: (update: Partial<TypstBlock>) => void;
}

export default function MathBlockEditor({ block, onUpdate }: MathBlockEditorProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">公式格式</span>
        <div className="flex bg-white dark:bg-zinc-900 rounded border border-zinc-300 dark:border-zinc-600 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              const currentTypst = (block.mathTypst ?? block.content ?? '').trim();
              onUpdate({
                mathFormat: 'latex',
                mathTypst: currentTypst,
                mathLatex: block.mathLatex ?? typstToLatexMath(currentTypst),
                content: currentTypst,
              });
            }}
            className={`px-2 py-1 text-xs transition-colors ${
              (block.mathFormat ?? 'latex') === 'latex'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            LaTeX
          </button>
          <button
            type="button"
            onClick={() => {
              const currentLatex = (block.mathLatex ?? '').trim();
              const currentTypst = (block.mathTypst ?? block.content ?? '').trim() || latexToTypstMath(currentLatex);
              onUpdate({
                mathFormat: 'typst',
                mathLatex: currentLatex,
                mathTypst: currentTypst,
                content: currentTypst,
              });
            }}
            className={`px-2 py-1 text-xs transition-colors ${
              (block.mathFormat ?? 'latex') === 'typst'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            Typst
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            if (block.mathLines) {
              // Convert back to single line
              const combinedLatex = block.mathLines.map(l => l.latex).join(' \\\\ ');
              const combinedTypst = block.mathLines.map(l => l.typst).join(' \\ ');
              onUpdate({
                mathLines: undefined,
                mathBrace: undefined,
                mathLatex: combinedLatex,
                mathTypst: combinedTypst,
                content: combinedTypst,
              });
            } else {
              // Convert to multi-line - detect and split multiple $$...$$ blocks
              let currentLatex = (block.mathLatex ?? '').trim();
              let currentTypst = (block.mathTypst ?? block.content ?? '').trim();
              
              // Helper to strip outer $ or $$ delimiters
              const stripDollarSigns = (s: string): string => {
                s = s.trim();
                if (s.startsWith('$$') && s.endsWith('$$')) {
                  return s.slice(2, -2).trim();
                }
                if (s.startsWith('$') && s.endsWith('$')) {
                  return s.slice(1, -1).trim();
                }
                return s;
              };

              // Try to split LaTeX by multiple $$...$$ blocks
              const latexBlockRegex = /\$\$([\s\S]*?)\$\$/g;
              const latexMatches = [...currentLatex.matchAll(latexBlockRegex)];
              
              if (latexMatches.length > 1) {
                // Multiple $$...$$ blocks found - split into lines
                const lines = latexMatches.map(m => {
                  const latex = m[1].trim();
                  const typst = latexToTypstMath(latex);
                  return { latex, typst };
                });
                onUpdate({
                  mathLines: lines,
                  mathBrace: false,
                });
              } else {
                // Single block or no delimiters - just strip $ signs if present
                currentLatex = stripDollarSigns(currentLatex);
                currentTypst = stripDollarSigns(currentTypst);
                // Also try splitting by \\ (LaTeX line break)
                const latexParts = currentLatex.split(/\s*\\\\\s*/).filter(p => p.trim());
                const typstParts = currentTypst.split(/\s*\\\s*/).filter(p => p.trim());
                
                if (latexParts.length > 1 || typstParts.length > 1) {
                  // Has line breaks - split into multiple lines
                  const lines = latexParts.map((latex, i) => ({
                    latex: latex.trim(),
                    typst: typstParts[i]?.trim() || latexToTypstMath(latex.trim()),
                  }));
                  onUpdate({
                    mathLines: lines,
                    mathBrace: false,
                  });
                } else {
                  // Single line
                  onUpdate({
                    mathLines: [{ latex: currentLatex, typst: currentTypst || latexToTypstMath(currentLatex) }],
                    mathBrace: false,
                  });
                }
              }
            }
          }}
          className="px-2 py-1 text-xs rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300"
        >
          {block.mathLines ? '单行模式' : '多行模式'}
        </button>
        {block.mathLines && (
          <button
            type="button"
            onClick={() => onUpdate({ mathBrace: !block.mathBrace })}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              block.mathBrace
                ? 'bg-blue-500 text-white'
                : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
            }`}
            title="左侧大括号"
          >
            {block.mathBrace ? '{ }' : '[ ]'}
          </button>
        )}
      </div>

      {block.mathLines ? (
        <div className="flex flex-col gap-2">
          {block.mathLines.map((line, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 w-6">{idx + 1}.</span>
              <input
                type="text"
                value={(block.mathFormat ?? 'latex') === 'latex' ? line.latex : line.typst}
                onChange={(e) => {
                  const newLines = [...block.mathLines!];
                  const fmt = block.mathFormat ?? 'latex';
                  if (fmt === 'latex') {
                    newLines[idx] = { latex: e.target.value, typst: latexToTypstMath(e.target.value) };
                  } else {
                    newLines[idx] = { latex: typstToLatexMath(e.target.value), typst: e.target.value };
                  }
                  onUpdate({ mathLines: newLines });
                }}
                className="flex-1 p-2 text-sm font-mono border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                placeholder={(block.mathFormat ?? 'latex') === 'latex' ? '输入 LaTeX' : '输入 Typst'}
              />
              <button
                type="button"
                onClick={() => {
                  const newLines = block.mathLines!.filter((_, i) => i !== idx);
                  onUpdate({ mathLines: newLines.length > 0 ? newLines : undefined });
                }}
                className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                title="删除此行"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const newLines = [...(block.mathLines ?? []), { latex: '', typst: '' }];
              onUpdate({ mathLines: newLines });
            }}
            className="px-3 py-1.5 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1 self-start"
          >
            <Plus size={14} />
            添加一行
          </button>
        </div>
      ) : (
        <textarea
          value={
            (block.mathFormat ?? 'latex') === 'latex'
              ? (block.mathLatex ?? typstToLatexMath((block.mathTypst ?? block.content ?? '').trim()))
              : (block.mathTypst ?? block.content ?? '')
          }
          onChange={(e) => {
            const nextVal = e.target.value;
            const fmt = block.mathFormat ?? 'latex';
            if (fmt === 'latex') {
              const typst = latexToTypstMath(nextVal);
              onUpdate({
                mathFormat: 'latex',
                mathLatex: nextVal,
                mathTypst: typst,
                content: typst,
              });
            } else {
              const latex = typstToLatexMath(nextVal);
              onUpdate({
                mathFormat: 'typst',
                mathLatex: latex,
                mathTypst: nextVal,
                content: nextVal,
              });
            }
          }}
          className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
          rows={3}
          placeholder={(block.mathFormat ?? 'latex') === 'latex' ? '输入 LaTeX，例如: \\frac{1}{2}' : '输入 Typst math，例如: frac(1, 2)'}
        />
      )}
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        说明：两种格式会自动互相转换（目前为常用语法的最佳努力转换）。{block.mathLines && ' 多行模式支持方程组显示。'}
      </div>
    </div>
  );
}