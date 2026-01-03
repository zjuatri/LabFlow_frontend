'use client';

import { TypstBlock } from '@/lib/typst';
import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';
import { Bold, Italic, Strikethrough, Palette, Sigma, MousePointer2 } from 'lucide-react';
import { useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';

// Import types and utilities from separated modules
import type { InlineMathFormat, InlineMathState, TableStyle, TablePayload } from '../BlockEditor-utils/types';
import {
  typstInlineToHtml,
  htmlToTypstInline,
  generateInlineMathId,
} from '../BlockEditor-utils/utils';
import {
  defaultTablePayload,
  parseTablePayload,
  normalizeTablePayload,
  flattenTableMerges,
  mergeTableRect,
  unmergeTableCell,
} from '../BlockEditor-utils/table-utils';

import { useTableStore } from '@/lib/stores/useTableStore';

interface TableBlockEditorProps {
  block: TypstBlock;
  onUpdate: (update: Partial<TypstBlock>) => void;
  onTableSelectionSnapshot: (snap: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null) => void;
}

export default function TableBlockEditor({ block, onUpdate, onTableSelectionSnapshot }: TableBlockEditorProps) {
  const tableCellEditorRef = useRef<HTMLDivElement>(null);
  const tableColorPickerRef = useRef<HTMLDivElement>(null);
  const tableRowsInputRef = useRef<HTMLInputElement>(null);
  const tableColsInputRef = useRef<HTMLInputElement>(null);

  // Connect to global store
  const {
    activeBlockId,
    activeCell,
    selection,
    selectionMode,
    showColorPicker,
    activeInlineMath,
    isEditingCell,

    setActiveTable,
    setActiveCell,
    setSelection,
    setSelectionMode,
    toggleSelectionMode,
    setShowColorPicker,
    setActiveInlineMath,
    setIsEditingCell,
  } = useTableStore(
    useShallow((state) => ({
      activeBlockId: state.activeBlockId,
      activeCell: state.activeCell,
      selection: state.selection,
      selectionMode: state.selectionMode,
      showColorPicker: state.showColorPicker,
      activeInlineMath: state.activeInlineMath,
      isEditingCell: state.isEditingCell,

      setActiveTable: state.setActiveTable,
      setActiveCell: state.setActiveCell,
      setSelection: state.setSelection,
      setSelectionMode: state.setSelectionMode,
      toggleSelectionMode: state.toggleSelectionMode,
      setShowColorPicker: state.setShowColorPicker,
      setActiveInlineMath: state.setActiveInlineMath,
      setIsEditingCell: state.setIsEditingCell,
    }))
  );

  // Computed: Is this table currently the active one?
  const isActive = activeBlockId === block.id;

  // Local proxies for state that return null/false if not active
  // This ensures UI for other tables doesn't light up
  const myActiveCell = isActive ? activeCell : null;
  const mySelection = isActive ? selection : null;
  const mySelectionMode = isActive ? selectionMode : false;
  const myShowColorPicker = isActive ? showColorPicker : false;
  const myActiveInlineMath = isActive ? activeInlineMath : null;
  const myIsEditingCell = isActive ? isEditingCell : false;

  const payload = normalizeTablePayload(parseTablePayload(block.content));
  const style = payload.style ?? 'normal';

  const setPayload = (next: TablePayload) => {
    onUpdate({ content: JSON.stringify(normalizeTablePayload(next)) });
  };

  const syncTableCellFromDom = useCallback(() => {
    const pos = myActiveCell;
    const el = tableCellEditorRef.current;
    if (!pos || !el) return;
    const currentPayload = normalizeTablePayload(parseTablePayload(block.content));
    const cell = currentPayload.cells[pos.r]?.[pos.c];
    if (!cell || cell.hidden) return;
    currentPayload.cells[pos.r][pos.c] = { ...cell, content: htmlToTypstInline(el) };
    onUpdate({ content: JSON.stringify(currentPayload) });
  }, [myActiveCell, block.content, onUpdate]);

  useEffect(() => {
    if (!isActive || !mySelection) return;
    onTableSelectionSnapshot({ blockId: block.id, ...mySelection });
  }, [isActive, block.id, mySelection, onTableSelectionSnapshot]);

  // Sync table cell editor innerHTML when active cell changes
  useEffect(() => {
    if (!myActiveCell || !tableCellEditorRef.current) return;
    if (myIsEditingCell || myActiveInlineMath) return;

    const currentPayload = normalizeTablePayload(parseTablePayload(block.content));
    const cell = currentPayload.cells[myActiveCell.r]?.[myActiveCell.c];
    if (!cell || cell.hidden) return;

    const html = typstInlineToHtml(cell.content ?? '');
    if (tableCellEditorRef.current.innerHTML !== html) {
      tableCellEditorRef.current.innerHTML = html;
    }
  }, [myActiveCell, block.content, myIsEditingCell, myActiveInlineMath]);

  const applyResize = () => {
    // Ensure we are active
    if (!isActive) setActiveTable(block.id);

    const nextRows = Math.max(1, parseInt(tableRowsInputRef.current?.value || '1', 10) || 1);
    const nextCols = Math.max(1, parseInt(tableColsInputRef.current?.value || '1', 10) || 1);
    const flat = flattenTableMerges(payload);
    const resized = defaultTablePayload(nextRows, nextCols);
    resized.caption = flat.caption;
    resized.style = flat.style;
    for (let r = 0; r < Math.min(nextRows, flat.rows); r++) {
      for (let c = 0; c < Math.min(nextCols, flat.cols); c++) {
        resized.cells[r][c].content = flat.cells[r][c].content;
      }
    }
    setPayload(resized);

    // Reset selection after resize
    setActiveTable(block.id);
    setActiveCell({ r: 0, c: 0 });
    setSelection({ r1: 0, c1: 0, r2: 0, c2: 0 });
  };

  const inSel = (r: number, c: number) => {
    if (!mySelection) return false;
    const top = Math.min(mySelection.r1, mySelection.r2);
    const left = Math.min(mySelection.c1, mySelection.c2);
    const bottom = Math.max(mySelection.r1, mySelection.r2);
    const right = Math.max(mySelection.c1, mySelection.c2);
    return r >= top && r <= bottom && c >= left && c <= right;
  };

  const active = myActiveCell ? payload.cells[myActiveCell.r]?.[myActiveCell.c] : null;

  const applyFormatToTableCell = (format: 'bold' | 'italic' | 'strike' | 'color', color?: string) => {
    const editor = tableCellEditorRef.current;
    if (!editor) return;
    editor.focus();

    if (format === 'bold') {
      document.execCommand('bold');
    } else if (format === 'italic') {
      document.execCommand('italic');
    } else if (format === 'strike') {
      document.execCommand('strikeThrough');
    } else if (format === 'color') {
      document.execCommand('foreColor', false, color ?? '#000000');
    }

    syncTableCellFromDom();
  };

  const applyListToTableCell = (kind: 'ordered' | 'bullet') => {
    const editor = tableCellEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(kind === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList');
    syncTableCellFromDom();
  };

  const insertInlineMath = () => {
    const editor = tableCellEditorRef.current;
    if (!editor) return;
    editor.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const id = generateInlineMathId();
    const pill = document.createElement('span');
    pill.className = 'inline-math-pill';
    pill.textContent = '𝑓';
    pill.setAttribute('data-id', id);
    pill.setAttribute('data-typst', '');
    pill.setAttribute('data-latex', '');
    pill.setAttribute('data-format', 'typst');
    pill.contentEditable = 'false';

    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(pill);

    range.setStartAfter(pill);
    range.setEndAfter(pill);
    sel.removeAllRanges();
    sel.addRange(range);

    syncTableCellFromDom();

    setActiveInlineMath({
      scope: 'table',
      id,
      typst: '',
      latex: '',
      format: 'typst',
    });
  };

  const getInlineMathPill = (id: string) => {
    if (!tableCellEditorRef.current) return null;
    return tableCellEditorRef.current.querySelector(`.inline-math-pill[data-id="${id}"]`) as HTMLElement | null;
  };

  const updateInlineMathPillAttrs = (state: InlineMathState) => {
    const pill = getInlineMathPill(state.id);
    if (!pill) return;
    pill.setAttribute('data-typst', state.typst);
    pill.setAttribute('data-latex', state.latex);
    pill.setAttribute('data-format', state.format);
    if (state.displayMode) pill.setAttribute('data-display-mode', 'true');
    else pill.removeAttribute('data-display-mode');
  };

  const handleRichEditorClick = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('inline-math-pill')) {
      e.preventDefault();
      const id = target.getAttribute('data-id') || '';
      const typst = target.getAttribute('data-typst') || '';
      const latex = target.getAttribute('data-latex') || '';
      const format = (target.getAttribute('data-format') || 'typst') as InlineMathFormat;
      const displayMode = target.getAttribute('data-display-mode') === 'true';
      setActiveInlineMath({ scope: 'table', id, typst, latex, format, displayMode });
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const node = sel.anchorNode;
      if (!node) return;
      const el = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement) as HTMLElement | null;
      if (!el) return;
      const li = el.closest('li');
      if (li && li.textContent?.trim() === '') {
        e.preventDefault();
        const listParent = li.parentElement;
        if (listParent) {
          document.execCommand(listParent.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
        }
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tableColorPickerRef.current && !tableColorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };

    if (isActive && myShowColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActive, myShowColorPicker, setShowColorPicker]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">表格标题</span>
        <input
          type="text"
          value={payload.caption ?? ''}
          onChange={(e) => setPayload({ ...payload, caption: e.target.value })}
          onClick={() => {
            if (activeBlockId !== block.id) setActiveTable(block.id);
          }}
          className="flex-1 p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
          placeholder="（可选）标题显示在表格上方"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">行</span>
        <input
          type="number"
          min={1}
          ref={tableRowsInputRef}
          defaultValue={payload.rows}
          onFocus={() => { if (activeBlockId !== block.id) setActiveTable(block.id); }}
          className="w-20 p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
        />
        <span className="text-xs text-zinc-600 dark:text-zinc-400">列</span>
        <input
          type="number"
          min={1}
          ref={tableColsInputRef}
          defaultValue={payload.cols}
          onFocus={() => { if (activeBlockId !== block.id) setActiveTable(block.id); }}
          className="w-20 p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={applyResize}
          className="px-3 py-2 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white"
        >
          应用
        </button>

        <span className="text-xs text-zinc-600 dark:text-zinc-400 ml-2">样式</span>
        <select
          value={style}
          onChange={(e) => setPayload({ ...payload, style: (e.target.value as TableStyle) })}
          onClick={() => { if (activeBlockId !== block.id) setActiveTable(block.id); }}
          className="text-xs px-2 py-2 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >
          <option value="normal">普通表格</option>
          <option value="three-line">三线表</option>
        </select>

        <button
          type="button"
          onClick={() => {
            if (activeBlockId !== block.id) setActiveTable(block.id);
            toggleSelectionMode();
          }}
          className={`px-3 py-2 text-xs rounded flex items-center gap-1 transition-colors ${mySelectionMode
            ? 'bg-blue-500 hover:bg-blue-600 text-white'
            : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
            }`}
          title={mySelectionMode ? '已开启：点击两次即可框选' : '开启：无需按 Shift 框选区域'}
        >
          <MousePointer2 size={14} />
          选区模式
        </button>

        <button
          type="button"
          onClick={() => {
            if (!mySelection) return;
            const top = Math.min(mySelection.r1, mySelection.r2);
            const left = Math.min(mySelection.c1, mySelection.c2);
            const bottom = Math.max(mySelection.r1, mySelection.r2);
            const right = Math.max(mySelection.c1, mySelection.c2);
            if (top === bottom && left === right) return;
            setPayload(mergeTableRect(payload, top, left, bottom, right));
          }}
          className="px-3 py-2 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white"
          title="合并所选单元格"
        >
          合并
        </button>
        <button
          type="button"
          onClick={() => {
            if (!myActiveCell) return;
            setPayload(unmergeTableCell(payload, myActiveCell.r, myActiveCell.c));
          }}
          className="px-3 py-2 text-xs rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300"
          title="取消合并"
        >
          取消合并
        </button>
      </div>

      <div className="overflow-x-auto">
        <table
          className={`mx-auto ${style === 'three-line'
            ? 'border-t border-b border-zinc-300 dark:border-zinc-600'
            : 'border border-zinc-200 dark:border-zinc-700'
            }`}
        >
          <tbody>
            {Array.from({ length: payload.rows }, (_, r) => (
              <tr
                key={r}
                className={
                  style === 'three-line' && r === 0
                    ? 'border-b border-zinc-300 dark:border-zinc-600'
                    : style === 'normal'
                      ? 'border-b border-zinc-200 dark:border-zinc-700 last:border-b-0'
                      : ''
                }
              >
                {Array.from({ length: payload.cols }, (_, c) => {
                  const cell = payload.cells[r][c];
                  if (cell.hidden) return null;
                  const rs = Math.max(1, Number(cell.rowspan || 1));
                  const cs = Math.max(1, Number(cell.colspan || 1));
                  const selected = inSel(r, c);
                  const activeNow = myActiveCell?.r === r && myActiveCell?.c === c;
                  return (
                    <td
                      key={c}
                      rowSpan={rs}
                      colSpan={cs}
                      onMouseDown={(e) => {
                        e.preventDefault();

                        // Activate this block first
                        if (activeBlockId !== block.id) {
                          setActiveTable(block.id);
                          // We need to wait for state update to see latest selectionMode,
                          // but inside event handler we can't wait.
                          // We optimistically assume we just activated it, so use defaults or just set cell.
                          setActiveCell({ r, c });
                          setSelection({ r1: r, c1: c, r2: r, c2: c });
                          setIsEditingCell(false);
                          return;
                        }

                        if (mySelectionMode) {
                          // 选区模式：第一次点击设定起点；第二次点击设定终点形成矩形。
                          if (!mySelection || (mySelection.r1 !== mySelection.r2 || mySelection.c1 !== mySelection.c2)) {
                            setActiveCell({ r, c });
                            setSelection({ r1: r, c1: c, r2: r, c2: c });
                          } else {
                            setActiveCell({ r: mySelection.r1, c: mySelection.c1 });
                            setSelection({ r1: mySelection.r1, c1: mySelection.c1, r2: r, c2: c });
                          }
                          setIsEditingCell(false);
                          return;
                        }

                        if (e.shiftKey && myActiveCell) {
                          setSelection({ r1: myActiveCell.r, c1: myActiveCell.c, r2: r, c2: c });
                        } else {
                          setActiveCell({ r, c });
                          setSelection({ r1: r, c1: c, r2: r, c2: c });
                          setIsEditingCell(false);
                        }
                      }}
                      className={`${style === 'normal'
                        ? 'border-r border-zinc-200 dark:border-zinc-700 last:border-r-0'
                        : ''
                        } p-2 align-top min-w-[120px] ${activeNow
                          ? 'outline outline-2 outline-blue-400'
                          : selected
                            ? 'bg-blue-50 dark:bg-blue-900/10'
                            : ''
                        } cursor-pointer`}
                    >
                      <div
                        className="text-sm whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-0 [&_li]:my-0"
                        dangerouslySetInnerHTML={{ __html: typstInlineToHtml(cell.content ?? '') }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isActive && myActiveCell && active && !active.hidden && (
        <div className="mt-2">
          <div className="flex gap-1 mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-700 flex-wrap">
            <button
              onMouseDown={(e) => { e.preventDefault(); applyFormatToTableCell('bold'); }}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title="加粗"
            >
              <Bold size={16} />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyListToTableCell('ordered'); }}
              className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title="有序列表"
            >
              1.
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyListToTableCell('bullet'); }}
              className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title="无序列表"
            >
              •
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyFormatToTableCell('italic'); }}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title="斜体"
            >
              <Italic size={16} />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyFormatToTableCell('strike'); }}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title="删除线"
            >
              <Strikethrough size={16} />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); insertInlineMath(); }}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title="插入行内公式"
            >
              <Sigma size={16} />
            </button>
            <div className="relative" ref={tableColorPickerRef}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowColorPicker(!myShowColorPicker); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="文字颜色"
              >
                <Palette size={16} />
              </button>
              {myShowColorPicker && (
                <div className="absolute top-full left-0 mt-1 p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-50 w-max">
                  <div className="grid grid-cols-5 gap-2">
                    {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000'].map(color => (
                      <button
                        key={color}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyFormatToTableCell('color', color);
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

          <div
            ref={tableCellEditorRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => setIsEditingCell(true)}
            onBlur={() => {
              setIsEditingCell(false);
              syncTableCellFromDom();
            }}
            onInput={() => syncTableCellFromDom()}
            onClick={handleRichEditorClick}
            onKeyDown={handleListKeyDown}
            className="w-full min-h-[40px] p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-0 [&_li]:my-0"
            data-placeholder="编辑当前单元格内容..."
          />

          {myActiveInlineMath?.scope === 'table' && (
            <div className="inline-math-editor mt-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-500">编辑行内公式</span>
                <button
                  onClick={() => {
                    syncTableCellFromDom();
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
                      if (myActiveInlineMath) {
                        const nextState = { ...myActiveInlineMath, format: 'latex' as InlineMathFormat };
                        setActiveInlineMath(nextState);
                        updateInlineMathPillAttrs(nextState);
                      }
                    }}
                    className={`px-2 py-1 text-xs transition-colors ${myActiveInlineMath.format === 'latex'
                      ? 'bg-blue-500 text-white'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                  >
                    LaTeX
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (myActiveInlineMath) {
                        const nextState = { ...myActiveInlineMath, format: 'typst' as InlineMathFormat };
                        setActiveInlineMath(nextState);
                        updateInlineMathPillAttrs(nextState);
                      }
                    }}
                    className={`px-2 py-1 text-xs transition-colors ${myActiveInlineMath.format === 'typst'
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
                      checked={myActiveInlineMath.displayMode || false}
                      onChange={(e) => {
                        if (myActiveInlineMath) {
                          const isDisplay = e.target.checked;
                          const nextState = { ...myActiveInlineMath, displayMode: isDisplay };
                          setActiveInlineMath(nextState);
                          updateInlineMathPillAttrs(nextState);
                          syncTableCellFromDom();
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">展示模式</span>
                  </label>
                </div>
              </div>

              <textarea
                value={myActiveInlineMath.format === 'latex' ? myActiveInlineMath.latex : myActiveInlineMath.typst}
                onChange={(e) => {
                  if (!myActiveInlineMath) return;
                  const nextVal = e.target.value;
                  if (myActiveInlineMath.format === 'latex') {
                    const nextLatex = nextVal;
                    const nextTypst = latexToTypstMath(nextLatex);
                    const nextState = { ...myActiveInlineMath, latex: nextLatex, typst: nextTypst };
                    setActiveInlineMath(nextState);
                    updateInlineMathPillAttrs(nextState);
                    syncTableCellFromDom();
                  } else {
                    const nextTypst = nextVal;
                    const nextLatex = typstToLatexMath(nextTypst);
                    const nextState = { ...myActiveInlineMath, typst: nextTypst, latex: nextLatex };
                    setActiveInlineMath(nextState);
                    updateInlineMathPillAttrs(nextState);
                    syncTableCellFromDom();
                  }
                }}
                className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
                rows={3}
                placeholder={myActiveInlineMath.format === 'latex' ? '输入 LaTeX，例如: \\frac{1}{2}' : '输入 Typst math，例如: frac(1, 2)'}
              />
            </div>
          )}
        </div>
      )
      }

      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        说明：先选中单元格。默认可用 Shift+点击框选矩形区域后点&quot;合并&quot;。也可开启&quot;选区模式&quot;：点击一次设起点，再点击一次设终点完成框选；再次点击将重新开始框选。三线表为无竖线样式。
      </div>

      {/* 宽度滑块（放在最下方） */}
      <div>
        <label className="text-xs text-zinc-600 dark:text-zinc-400 block mb-2">
          宽度: {(() => {
            const w = block.width || '50%';
            return parseFloat(w) || 50;
          })()}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={(() => {
            const w = block.width || '50%';
            return parseFloat(w) || 50;
          })()}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate({ width: `${val}%` });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
    </div >
  );
}