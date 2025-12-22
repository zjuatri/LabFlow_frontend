'use client';

import { TypstBlock } from '@/lib/typst';
import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';
import { useRef, useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { Bold, Italic, Strikethrough, Sigma, Palette } from 'lucide-react';

// Import types and utilities from separated modules
import type { InlineMathFormat, InlineMathState } from '../BlockEditor-utils/types';
import {
  typstInlineToHtml,
  htmlToTypstInline,
  generateInlineMathId,
  typstInlineToPlainText,
} from '../BlockEditor-utils/utils';

interface TitleBlockEditorProps {
  block: TypstBlock;
  onUpdate: (updates: Partial<TypstBlock>) => void;
}

export default function TitleBlockEditor({ block, onUpdate }: TitleBlockEditorProps) {
  const paragraphEditorRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [isEditingParagraph, setIsEditingParagraph] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeInlineMath, setActiveInlineMath] = useState<InlineMathState | null>(null);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColorPicker]);

  useEffect(() => {
    // Keep editor in sync when not actively editing.
    // IMPORTANT: while editing an inline formula, do not overwrite the DOM;
    // otherwise the pill node gets replaced and edits appear to "disappear".
    if (isEditingParagraph) return;
    if (activeInlineMath) return;
    if (!paragraphEditorRef.current) return;
    const html = typstInlineToHtml(block.content ?? '');
    if (paragraphEditorRef.current.innerHTML !== html) {
      paragraphEditorRef.current.innerHTML = html;
    }
  }, [block.content, isEditingParagraph, activeInlineMath]);

  const syncParagraphFromDom = () => {
    if (!paragraphEditorRef.current) return;
    const newTypst = htmlToTypstInline(paragraphEditorRef.current);
    if (newTypst !== block.content) {
      onUpdate({ content: newTypst });
    }
  };

  const getInlineMathPill = (id: string): HTMLElement | null => {
    if (!paragraphEditorRef.current) return null;
    return paragraphEditorRef.current.querySelector(`[data-inline-math-id="${id}"]`) as HTMLElement | null;
  };

  const updateInlineMathPillAttrs = (state: InlineMathState) => {
    const pill = getInlineMathPill(state.id);
    if (!pill) return;
    pill.setAttribute('data-format', state.format);
    pill.setAttribute('data-latex', state.latex);
    pill.setAttribute('data-typst', state.typst);
  };

  const handleRichEditorClick = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.inline-math-pill') as HTMLElement | null;
    if (pill) {
      const id = pill.getAttribute('data-inline-math-id') ?? generateInlineMathId();
      // If this pill was generated from source and doesn't have an id yet, assign one.
      if (!pill.getAttribute('data-inline-math-id')) pill.setAttribute('data-inline-math-id', id);

      const typst = (pill.getAttribute('data-typst') ?? '').trim();
      const latex = (pill.getAttribute('data-latex') ?? '').trim() || (typst ? typstToLatexMath(typst) : '');
      const format = ((pill.getAttribute('data-format') ?? 'latex') as InlineMathFormat);
      setActiveInlineMath({ scope: 'main', id, format, latex, typst });
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !paragraphEditorRef.current) return;

    const range = sel.getRangeAt(0);
    const currentLine = range.startContainer.textContent || '';
    const caretPos = range.startOffset;
    const beforeCaret = currentLine.slice(0, caretPos);
    const afterCaret = currentLine.slice(caretPos);

    const ulMatch = beforeCaret.match(/^(\s*)-\s/);
    const olMatch = beforeCaret.match(/^(\s*)(\d+)\.\s/);

    if (ulMatch) {
      const indent = ulMatch[1] || '';
      const restText = beforeCaret.replace(/^(\s*)-\s/, '');
      if (!restText.trim()) {
        range.startContainer.textContent = '';
        syncParagraphFromDom();
        return;
      }
      const newLine = `${indent}- ${afterCaret}`;
      const textNode = document.createTextNode('\n' + newLine);
      range.insertNode(textNode);
      range.setStart(textNode, indent.length + 3);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      syncParagraphFromDom();
      return;
    }

    if (olMatch) {
      const indent = olMatch[1] || '';
      const num = parseInt(olMatch[2] || '1', 10);
      const restText = beforeCaret.replace(/^(\s*)\d+\.\s/, '');
      if (!restText.trim()) {
        range.startContainer.textContent = '';
        syncParagraphFromDom();
        return;
      }
      const newLine = `${indent}${num + 1}. ${afterCaret}`;
      const textNode = document.createTextNode('\n' + newLine);
      range.insertNode(textNode);
      range.setStart(textNode, indent.length + String(num + 1).length + 3);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      syncParagraphFromDom();
      return;
    }

    const br = document.createElement('br');
    range.deleteContents();
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    syncParagraphFromDom();
  };

  const applyFormat = (fmt: 'bold' | 'italic' | 'strike' | 'color', color?: string) => {
    const editor = paragraphEditorRef.current;
    if (!editor) return;
    editor.focus();

    if (fmt === 'bold') {
      document.execCommand('bold');
    } else if (fmt === 'italic') {
      document.execCommand('italic');
    } else if (fmt === 'strike') {
      document.execCommand('strikeThrough');
    } else if (fmt === 'color') {
      document.execCommand('foreColor', false, color ?? '#000000');
    }

    syncParagraphFromDom();
  };

  const applyList = (kind: 'ordered' | 'bullet') => {
    const editor = paragraphEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(kind === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList');
    syncParagraphFromDom();
  };

  const insertInlineMath = () => {
    const editor = paragraphEditorRef.current;
    if (!editor) return;
    editor.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    const id = generateInlineMathId();
    const pill = document.createElement('span');
    pill.className = 'inline-math-pill';
    pill.setAttribute('data-inline-math-id', id);
    pill.setAttribute('data-format', 'latex');
    pill.setAttribute('data-latex', '');
    pill.setAttribute('data-typst', '');
    pill.contentEditable = 'false';
    pill.textContent = '∑';
    
    range.deleteContents();
    range.insertNode(pill);
    range.collapse(false);
    
    // Add a space after the pill to allow continuing typing
    const space = document.createTextNode('\u00A0');
    range.insertNode(space);
    range.collapse(false);

    syncParagraphFromDom();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 标题级别选择器 */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">级别</label>
        <select
          value={block.level || 1}
          onChange={(e) => onUpdate({ level: Number(e.target.value) })}
          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >
          {[1, 2, 3, 4, 5, 6].map((l) => (
            <option key={l} value={l}>
              {['一', '二', '三', '四', '五', '六'][l - 1]}级标题
            </option>
          ))}
        </select>
      </div>

      {/* 格式工具栏 - 移到文本框上方 */}
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
      </div>

      {/* 富文本编辑器 */}
      <div
        ref={paragraphEditorRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => setIsEditingParagraph(true)}
        onBlur={() => {
          setIsEditingParagraph(false);
          syncParagraphFromDom();
        }}
        onInput={syncParagraphFromDom}
        onClick={handleRichEditorClick}
        onKeyDown={(e) => {
          handleListKeyDown(e);
          if (e.ctrlKey && !e.shiftKey) {
            if (e.key === 'b' || e.key === 'B') {
              e.preventDefault();
              applyFormat('bold');
            } else if (e.key === 'i' || e.key === 'I') {
              e.preventDefault();
              applyFormat('italic');
            }
          }
        }}
        className={`w-full min-h-[40px] p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap outline-none font-bold ${
          ['text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl'][6 - (block.level || 1)] || 'text-base'
        }`}
        data-placeholder="输入标题内容..."
      />

      {/* 行内公式编辑器 */}
      {activeInlineMath && (
        <div className="inline-math-editor mt-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-500">编辑行内公式</span>
            <button 
              onClick={() => {
                syncParagraphFromDom();
                setActiveInlineMath(null);
              }}
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
                onClick={() => {
                  setActiveInlineMath({ ...activeInlineMath, format: 'latex' });
                  updateInlineMathPillAttrs({ ...activeInlineMath, format: 'latex' });
                }}
                className={`px-2 py-1 text-xs transition-colors ${
                  activeInlineMath.format === 'latex'
                    ? 'bg-blue-500 text-white'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                LaTeX
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveInlineMath({ ...activeInlineMath, format: 'typst' });
                  updateInlineMathPillAttrs({ ...activeInlineMath, format: 'typst' });
                }}
                className={`px-2 py-1 text-xs transition-colors ${
                  activeInlineMath.format === 'typst'
                    ? 'bg-blue-500 text-white'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Typst
              </button>
            </div>
          </div>

          <textarea
            value={activeInlineMath.format === 'latex' ? activeInlineMath.latex : activeInlineMath.typst}
            onChange={(e) => {
              const nextVal = e.target.value;
              if (activeInlineMath.format === 'latex') {
                const nextLatex = nextVal;
                const nextTypst = latexToTypstMath(nextLatex);
                const nextState = { ...activeInlineMath, latex: nextLatex, typst: nextTypst };
                setActiveInlineMath(nextState);
                updateInlineMathPillAttrs(nextState);
                syncParagraphFromDom();
              } else {
                const nextTypst = nextVal;
                const nextLatex = typstToLatexMath(nextTypst);
                const nextState = { ...activeInlineMath, typst: nextTypst, latex: nextLatex };
                setActiveInlineMath(nextState);
                updateInlineMathPillAttrs(nextState);
                syncParagraphFromDom();
              }
            }}
            className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
            rows={2}
            placeholder={activeInlineMath.format === 'latex' ? '输入 LaTeX，例如: \\frac{1}{2}' : '输入 Typst math，例如: frac(1, 2)'}
            autoFocus
          />
          <div className="mt-1 text-[10px] text-zinc-400">
            说明：两种格式会自动互相转换（最佳努力）。
          </div>
        </div>
      )}
    </div>
  );
}