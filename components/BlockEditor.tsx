'use client';

import { TypstBlock, BlockType } from '@/lib/typst';
import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';
import { getToken } from '@/lib/auth';
import { Trash2, Plus, ChevronUp, ChevronDown, Bold, Italic, Strikethrough, Palette, Sigma, MousePointer2 } from 'lucide-react';
import { useRef, useState, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react';

// Import types and utilities from separated modules
import type { InlineMathFormat, InlineMathState, TableStyle, TablePayload } from './BlockEditor/types';
import {
  typstInlineToHtml,
  htmlToTypstInline,
  generateInlineMathId,
} from './BlockEditor/utils';
import {
  defaultTablePayload,
  parseTablePayload,
  normalizeTablePayload,
  flattenTableMerges,
  mergeTableRect,
  unmergeTableCell,
} from './BlockEditor/table-utils';

interface BlockEditorProps {
  blocks: TypstBlock[];
  onChange: (blocks: TypstBlock[]) => void;
  projectId: string;
  onBlockClick?: (index: number) => void;
}

export default function BlockEditor({ blocks, onChange, projectId, onBlockClick }: BlockEditorProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const suppressNextDragRef = useRef(false);
  const nextBlockIdRef = useRef(1);

  const reorderBlocks = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIndex = blocks.findIndex((b) => b.id === fromId);
    const toIndex = blocks.findIndex((b) => b.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...blocks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  };

  const updateBlock = (id: string, updates: Partial<TypstBlock>) => {
    onChange(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  // Migrate legacy list blocks into paragraph blocks.
  // Lists are now represented inside paragraphs as lines starting with "- " or "1.".
  useEffect(() => {
    const hasLegacyList = blocks.some((b) => b.type === 'list');
    if (!hasLegacyList) return;

    const migrated: TypstBlock[] = blocks.map((b): TypstBlock => {
      if (b.type !== 'list') return b;
      const items = (b.content ?? '').split(/\r?\n/);
      const content = items.map((x) => (x.trim() ? `- ${x}` : '')).join('\n');
      return { ...b, type: 'paragraph', content };
    });

    onChange(migrated);
  }, [blocks, onChange]);

  const deleteBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id));
  };

  const addBlock = (afterId?: string) => {
    let nextId = '';
    do {
      nextId = `block-${nextBlockIdRef.current++}`;
    } while (blocks.some((b) => b.id === nextId));

    const newBlock: TypstBlock = {
      id: nextId,
      type: 'paragraph',
      content: '',
    };

    if (!afterId) {
      onChange([...blocks, newBlock]);
    } else {
      const index = blocks.findIndex(b => b.id === afterId);
      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      onChange(newBlocks);
    }
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex(b => b.id === id);
    if (direction === 'up' && index > 0) {
      const newBlocks = [...blocks];
      [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
      onChange(newBlocks);
    } else if (direction === 'down' && index < blocks.length - 1) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
      onChange(newBlocks);
    }
  };

  const uploadImage = async (file: File, blockId: string) => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`/api/projects/${projectId}/images/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || '上传失败');
    }

    const data = await res.json();
    const url = data?.url as string;
    if (url) {
      updateBlock(blockId, { content: url });
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          draggable
          onMouseDownCapture={(e) => {
            const target = e.target as HTMLElement | null;
            suppressNextDragRef.current = !!target?.closest('input, textarea, [contenteditable="true"]');
          }}
          onMouseUpCapture={() => {
            suppressNextDragRef.current = false;
          }}
          onDragStart={(e) => {
            // If the user began this interaction inside an input/textarea,
            // do not start a block drag (otherwise text selection becomes impossible).
            if (suppressNextDragRef.current) {
              e.preventDefault();
              return;
            }

            setDraggingId(block.id);
            setDragOverId(null);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', block.id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (draggingId && draggingId !== block.id) setDragOverId(block.id);
          }}
          onDragLeave={() => {
            if (dragOverId === block.id) setDragOverId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const fromId = e.dataTransfer.getData('text/plain') || draggingId;
            if (fromId) reorderBlocks(fromId, block.id);
            setDraggingId(null);
            setDragOverId(null);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOverId(null);
            suppressNextDragRef.current = false;
          }}
          className={
            dragOverId === block.id
              ? 'outline outline-2 outline-blue-400 rounded-lg'
              : draggingId === block.id
                ? 'opacity-70'
                : ''
          }
        >
          <BlockItem
            block={block}
            isFirst={index === 0}
            isLast={index === blocks.length - 1}
            onUpdate={(updates) => updateBlock(block.id, updates)}
            onDelete={() => deleteBlock(block.id)}
            onAddAfter={() => addBlock(block.id)}
            onMove={(dir) => moveBlock(block.id, dir)}
            onUploadImage={(file) => uploadImage(file, block.id)}
            onClick={() => onBlockClick?.(index)}
          />
        </div>
      ))}
      
      {blocks.length === 0 && (
        <button
          onClick={() => addBlock()}
          className="p-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-500 dark:text-zinc-400"
        >
          + 添加第一个块
        </button>
      )}
    </div>
  );
}

interface BlockItemProps {
  block: TypstBlock;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updates: Partial<TypstBlock>) => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onUploadImage: (file: File) => void;
  onClick: () => void;
}

function BlockItem({ block, isFirst, isLast, onUpdate, onDelete, onAddAfter, onMove, onUploadImage, onClick }: BlockItemProps) {
  const paragraphEditorRef = useRef<HTMLDivElement>(null);
  const tableCellEditorRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const tableColorPickerRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTableColorPicker, setShowTableColorPicker] = useState(false);
  const [isEditingParagraph, setIsEditingParagraph] = useState(false);
  const [isEditingTableCell, setIsEditingTableCell] = useState(false);
  const [activeInlineMath, setActiveInlineMath] = useState<InlineMathState | null>(null);

  const [activeTableCell, setActiveTableCell] = useState<{ r: number; c: number } | null>(null);
  const [tableSelection, setTableSelection] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const [tableSelectionMode, setTableSelectionMode] = useState(false);
  const tableRowsInputRef = useRef<HTMLInputElement>(null);
  const tableColsInputRef = useRef<HTMLInputElement>(null);

  const syncParagraphFromDom = useCallback(() => {
    const el = paragraphEditorRef.current;
    if (!el) return;
    const next = htmlToTypstInline(el);
    onUpdate({ content: next });
  }, [onUpdate]);

  const syncTableCellFromDom = useCallback(() => {
    if (block.type !== 'table') return;
    const pos = activeTableCell;
    const el = tableCellEditorRef.current;
    if (!pos || !el) return;
    const payload = normalizeTablePayload(parseTablePayload(block.content));
    const cell = payload.cells[pos.r]?.[pos.c];
    if (!cell || cell.hidden) return;
    payload.cells[pos.r][pos.c] = { ...cell, content: htmlToTypstInline(el) };
    onUpdate({ content: JSON.stringify(payload) });
  }, [activeTableCell, block.content, block.type, onUpdate]);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
      if (tableColorPickerRef.current && !tableColorPickerRef.current.contains(event.target as Node)) {
        setShowTableColorPicker(false);
      }
      // Close inline math editor if clicking outside
      if (
        activeInlineMath &&
        !(event.target as HTMLElement).closest('.inline-math-editor') &&
        !(event.target as HTMLElement).closest('.inline-math-pill')
      ) {
        // Ensure the latest pill contents are persisted to block content
        if (activeInlineMath.scope === 'main') syncParagraphFromDom();
        else syncTableCellFromDom();
        setActiveInlineMath(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker, activeInlineMath, syncParagraphFromDom, syncTableCellFromDom]);

  const getInlineMathRoot = (scope: 'main' | 'table'): HTMLDivElement | null => {
    return scope === 'main' ? paragraphEditorRef.current : tableCellEditorRef.current;
  };

  const getInlineMathPill = (scope: 'main' | 'table', id: string): HTMLElement | null => {
    const root = getInlineMathRoot(scope);
    if (!root) return null;
    return root.querySelector(`[data-inline-math-id="${id}"]`) as HTMLElement | null;
  };

  const updateInlineMathPillAttrs = (state: InlineMathState) => {
    const pill = getInlineMathPill(state.scope, state.id);
    if (!pill) return;
    pill.setAttribute('data-format', state.format);
    pill.setAttribute('data-latex', state.latex);
    pill.setAttribute('data-typst', state.typst);
  };

  const insertInlineMath = (scope: 'main' | 'table') => {
    const editor = getInlineMathRoot(scope);
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

    if (scope === 'main') syncParagraphFromDom();
    else syncTableCellFromDom();
    setActiveInlineMath({ scope, id, format: 'latex', latex: '', typst: '' });
  };

  const handleRichEditorClick = (scope: 'main' | 'table', e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.inline-math-pill') as HTMLElement | null;
    if (pill) {
      const id = pill.getAttribute('data-inline-math-id') ?? generateInlineMathId();
      // If this pill was generated from source and doesn't have an id yet, assign one.
      if (!pill.getAttribute('data-inline-math-id')) pill.setAttribute('data-inline-math-id', id);

      const typst = (pill.getAttribute('data-typst') ?? '').trim();
      const latex = (pill.getAttribute('data-latex') ?? '').trim() || (typst ? typstToLatexMath(typst) : '');
      const format = ((pill.getAttribute('data-format') ?? 'latex') as InlineMathFormat);
      setActiveInlineMath({ scope, id, format, latex, typst });
    }
  };

  const applyFormat = (format: 'bold' | 'italic' | 'strike' | 'color', color?: string) => {
    if (block.type !== 'paragraph' && block.type !== 'heading') return;
    const editor = paragraphEditorRef.current;
    if (!editor) return;
    editor.focus();

    // Use execCommand for native toggle behavior and better browser support
    if (format === 'bold') {
      document.execCommand('bold');
    } else if (format === 'italic') {
      document.execCommand('italic');
    } else if (format === 'strike') {
      document.execCommand('strikeThrough');
    } else if (format === 'color') {
      document.execCommand('foreColor', false, color ?? '#000000');
    }

    syncParagraphFromDom();
  };

  const applyList = (kind: 'ordered' | 'bullet') => {
    if (block.type !== 'paragraph' && block.type !== 'heading') return;
    const editor = paragraphEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(kind === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList');
    syncParagraphFromDom();
  };

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

  const isSelectionInside = (root: HTMLElement, selector: string): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode;
    if (!node) return null;
    const el = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement) as HTMLElement | null;
    if (!el) return null;
    const closest = el.closest(selector) as HTMLElement | null;
    if (!closest) return null;
    return root.contains(closest) ? closest : null;
  };

  const moveCaretToStart = (el: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const insertDivAfter = (afterEl: HTMLElement, text: string) => {
    const div = document.createElement('div');
    if (text) {
      div.textContent = text;
    } else {
      div.appendChild(document.createElement('br'));
    }

    const parent = afterEl.parentElement;
    if (!parent) return;
    if (afterEl.nextSibling) parent.insertBefore(div, afterEl.nextSibling);
    else parent.appendChild(div);

    moveCaretToStart(div);
  };

  const createEmptyLineDiv = (): HTMLDivElement => {
    const div = document.createElement('div');
    div.appendChild(document.createElement('br'));
    return div;
  };

  const handleEmptyListItemExit = (scope: 'main' | 'table', li: HTMLElement, list: HTMLElement) => {
    const editor = scope === 'main' ? paragraphEditorRef.current : tableCellEditorRef.current;
    if (!editor) return;

    // Remove current empty list item and convert it into a normal empty line (<div><br/></div>)
    // placed at the same logical position.
    const lineDiv = createEmptyLineDiv();

    const allLis = Array.from(list.children).filter((c) => (c as HTMLElement).tagName.toLowerCase() === 'li') as HTMLElement[];
    const liIndex = allLis.indexOf(li);
    const isOrdered = list.tagName.toLowerCase() === 'ol';

    // Collect following <li> siblings after the current one.
    const followingLis = allLis.slice(liIndex + 1);

    // Remove the current <li>
    li.remove();

    // If we have following items, split the list into two lists.
    let newList: HTMLElement | null = null;
    if (followingLis.length > 0) {
      newList = document.createElement(isOrdered ? 'ol' : 'ul');
      // Preserve start attr when present; browser uses it for numbering.
      const start = list.getAttribute('start');
      if (start) newList.setAttribute('start', start);
      for (const liEl of followingLis) {
        newList.appendChild(liEl);
      }
    }

    const parent = list.parentElement;
    if (!parent) return;

    // If list becomes empty, replace it with the empty line.
    const remainingLis = Array.from(list.children).filter((c) => (c as HTMLElement).tagName.toLowerCase() === 'li');
    if (remainingLis.length === 0) {
      parent.replaceChild(lineDiv, list);
      if (newList) parent.insertBefore(newList, lineDiv.nextSibling);
      moveCaretToStart(lineDiv);
    } else {
      // Insert the empty line either before or after the list depending on position,
      // or between the two split lists.
      if (liIndex <= 0) {
        parent.insertBefore(lineDiv, list);
        moveCaretToStart(lineDiv);
      } else {
        // Insert after the (possibly shortened) list.
        if (list.nextSibling) parent.insertBefore(lineDiv, list.nextSibling);
        else parent.appendChild(lineDiv);
        if (newList) {
          if (lineDiv.nextSibling) parent.insertBefore(newList, lineDiv.nextSibling);
          else parent.appendChild(newList);
        }
        moveCaretToStart(lineDiv);
      }
    }

    if (scope === 'main') syncParagraphFromDom();
    else syncTableCellFromDom();
  };

  const handleListBackspaceKey = (scope: 'main' | 'table', e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Backspace' || e.shiftKey || e.altKey || e.metaKey) return;
    const editor = scope === 'main' ? paragraphEditorRef.current : tableCellEditorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    const li = isSelectionInside(editor, 'li');
    if (!li) return;

    const list = li.closest('ol, ul') as HTMLElement | null;
    if (!list) return;

    // Only override Backspace when the list item is empty (shows only marker like "4." or "•").
    const text = (li.textContent ?? '').replace(/\u00A0/g, ' ').trim();
    if (text.length !== 0) return;

    e.preventDefault();
    handleEmptyListItemExit(scope, li, list);
  };

  const handleListEnterKey = (scope: 'main' | 'table', e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const editor = scope === 'main' ? paragraphEditorRef.current : tableCellEditorRef.current;
    if (!editor) return;

    const li = isSelectionInside(editor, 'li');
    if (li) {
      // Common behavior: pressing Enter on an empty list item exits the list.
      const text = (li.textContent ?? '').replace(/\u00A0/g, ' ').trim();
      if (text.length === 0) {
        e.preventDefault();
        const list = li.closest('ol, ul') as HTMLElement | null;
        if (!list) return;
        handleEmptyListItemExit(scope, li, list);
      }
      return; // Let browser handle normal list continuation.
    }

    // Plain-text style continuation: "1. " -> "2. ", "- " -> "- "
    const lineEl = isSelectionInside(editor, 'div, p') as HTMLElement | null;
    if (!lineEl) return;
    const lineText = (lineEl.textContent ?? '').replace(/\u00A0/g, ' ');
    const ordered = lineText.match(/^\s*(\d+)[.)]\s*(.*)$/);
    const bullet = lineText.match(/^\s*[-*]\s*(.*)$/);

    if (ordered) {
      const n = parseInt(ordered[1], 10);
      const rest = (ordered[2] ?? '').trim();
      e.preventDefault();
      if (!rest) {
        insertDivAfter(lineEl, '');
      } else {
        insertDivAfter(lineEl, `${Math.max(1, n + 1)}. `);
      }
      if (scope === 'main') syncParagraphFromDom();
      else syncTableCellFromDom();
      return;
    }

    if (bullet) {
      const rest = (bullet[1] ?? '').trim();
      e.preventDefault();
      if (!rest) {
        insertDivAfter(lineEl, '');
      } else {
        insertDivAfter(lineEl, '- ');
      }
      if (scope === 'main') syncParagraphFromDom();
      else syncTableCellFromDom();
      return;
    }
  };

  const handleListKeyDown = (scope: 'main' | 'table', e: React.KeyboardEvent<HTMLDivElement>) => {
    handleListBackspaceKey(scope, e);
    handleListEnterKey(scope, e);
  };

  // Keep paragraph editor in sync when not actively editing.
  useEffect(() => {
    if (block.type !== 'paragraph' && block.type !== 'heading') return;
    if (isEditingParagraph) return;
    // While editing an inline formula, do not overwrite the contentEditable DOM;
    // otherwise the pill node gets replaced and edits appear to "disappear".
    if (activeInlineMath) return;
    if (!paragraphEditorRef.current) return;
    paragraphEditorRef.current.innerHTML = typstInlineToHtml(block.content ?? '');
  }, [block.content, block.type, isEditingParagraph, activeInlineMath]);

  useEffect(() => {
    if (block.type !== 'table') return;
    const payload = normalizeTablePayload(parseTablePayload(block.content));
    if (tableRowsInputRef.current) tableRowsInputRef.current.value = String(payload.rows);
    if (tableColsInputRef.current) tableColsInputRef.current.value = String(payload.cols);

    if (!activeTableCell) return;
    if (isEditingTableCell) return;
    if (activeInlineMath?.scope === 'table') return;
    const el = tableCellEditorRef.current;
    if (!el) return;
    const cell = payload.cells[activeTableCell.r]?.[activeTableCell.c];
    if (!cell || cell.hidden) return;
    el.innerHTML = typstInlineToHtml(cell.content ?? '');
  }, [block.content, block.type, activeTableCell, isEditingTableCell, activeInlineMath]);

  return (
    <div
      className="group relative border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-900 cursor-pointer"
      onClick={onClick}
    >
      {/* 工具栏 */}
      <div className="flex items-center gap-2 mb-2">
        <select
          value={block.type === 'list' ? 'paragraph' : block.type}
          onChange={(e) => {
            const nextType = e.target.value as BlockType;
            if (nextType === 'math' && block.type !== 'math') {
              onUpdate({
                type: nextType,
                content: '',
                mathFormat: 'latex',
                mathLatex: '',
                mathTypst: '',
              });
              return;
            }
            if (nextType === 'table' && block.type !== 'table') {
              onUpdate({
                type: nextType,
                content: JSON.stringify(defaultTablePayload(2, 2)),
              });
              return;
            }
            onUpdate({ type: nextType });
          }}
          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >
          <option value="heading">标题</option>
          <option value="paragraph">段落</option>
          <option value="code">代码</option>
          <option value="math">数学</option>
          <option value="image">图片</option>
          <option value="table">表格</option>
        </select>

        {block.type === 'heading' && (
          <select
            value={block.level || 1}
            onChange={(e) => onUpdate({ level: Number(e.target.value) })}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          >
            {[1, 2, 3, 4, 5, 6].map(l => (
              <option key={l} value={l}>{['一', '二', '三', '四', '五', '六'][l - 1]}级标题</option>
            ))}
          </select>
        )}

        {block.type === 'code' && (
          <input
            type="text"
            value={block.language || 'python'}
            onChange={(e) => onUpdate({ language: e.target.value })}
            placeholder="语言"
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 w-24"
          />
        )}

        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onMove('up')}
            disabled={isFirst}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="上移"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => onMove('down')}
            disabled={isLast}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="下移"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 内容编辑 */}
      {block.type === 'code' ? (
        <textarea
          value={block.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
          rows={Math.max(3, block.content.split('\n').length)}
          placeholder="输入代码..."
        />
      ) : block.type === 'image' ? (
        <div className="flex flex-col gap-3">
          {block.content ? (
            <div className="flex items-center gap-3">
              <img src={block.content} alt="图片预览" className="max-h-40 rounded border border-zinc-200 dark:border-zinc-700" />
              <button
                onClick={() => onUpdate({ content: '' })}
                className="px-2 py-1 text-xs rounded bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40"
              >删除图片</button>
            </div>
          ) : null}

          <div>
            <input
              type="text"
              value={block.caption ?? ''}
              onChange={(e) => onUpdate({ caption: e.target.value })}
              className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              placeholder="例如：实验装置示意图"
            />
          </div>

          <label className="inline-block px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium cursor-pointer transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  try {
                    await onUploadImage(file);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : '上传失败');
                  }
                }
              }}
              className="hidden"
            />
            {block.content ? '更换图片' : '选择图片'}
          </label>
          {block.content && (
            <div>
              <label className="text-xs text-zinc-600 dark:text-zinc-400 block mb-2">
                宽度: {(() => {
                  const w = block.width || '100%';
                  return parseFloat(w) || 100;
                })()}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={(() => {
                  const w = block.width || '100%';
                  return parseFloat(w) || 100;
                })()}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdate({ width: `${val}%` });
                }}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          )}
        </div>
      ) : block.type === 'math' ? (
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
                  // Convert to multi-line
                  const currentLatex = block.mathLatex ?? '';
                  const currentTypst = block.mathTypst ?? block.content ?? '';
                  onUpdate({
                    mathLines: [{ latex: currentLatex, typst: currentTypst }],
                    mathBrace: false,
                  });
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
      ) : block.type === 'table' ? (
        (() => {
          const payload = normalizeTablePayload(parseTablePayload(block.content));
          const style = payload.style ?? 'normal';

          const setPayload = (next: TablePayload) => {
            onUpdate({ content: JSON.stringify(normalizeTablePayload(next)) });
          };

          const applyResize = () => {
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
            setActiveTableCell({ r: 0, c: 0 });
            setTableSelection({ r1: 0, c1: 0, r2: 0, c2: 0 });
          };

          const sel = tableSelection;
          const inSel = (r: number, c: number) => {
            if (!sel) return false;
            const top = Math.min(sel.r1, sel.r2);
            const left = Math.min(sel.c1, sel.c2);
            const bottom = Math.max(sel.r1, sel.r2);
            const right = Math.max(sel.c1, sel.c2);
            return r >= top && r <= bottom && c >= left && c <= right;
          };

          const activeCell = activeTableCell;
          const active = activeCell ? payload.cells[activeCell.r]?.[activeCell.c] : null;

          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">表格标题</span>
                <input
                  type="text"
                  value={payload.caption ?? ''}
                  onChange={(e) => setPayload({ ...payload, caption: e.target.value })}
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
                  className="w-20 p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">列</span>
                <input
                  type="number"
                  min={1}
                  ref={tableColsInputRef}
                  defaultValue={payload.cols}
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
                  className="text-xs px-2 py-2 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                >
                  <option value="normal">普通表格</option>
                  <option value="three-line">三线表</option>
                </select>

                <button
                  type="button"
                  onClick={() => setTableSelectionMode(v => !v)}
                  className={`px-3 py-2 text-xs rounded flex items-center gap-1 transition-colors ${
                    tableSelectionMode
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
                  }`}
                  title={tableSelectionMode ? '已开启：点击两次即可框选' : '开启：无需按 Shift 框选区域'}
                >
                  <MousePointer2 size={14} />
                  选区模式
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!tableSelection) return;
                    const top = Math.min(tableSelection.r1, tableSelection.r2);
                    const left = Math.min(tableSelection.c1, tableSelection.c2);
                    const bottom = Math.max(tableSelection.r1, tableSelection.r2);
                    const right = Math.max(tableSelection.c1, tableSelection.c2);
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
                    if (!activeTableCell) return;
                    setPayload(unmergeTableCell(payload, activeTableCell.r, activeTableCell.c));
                  }}
                  className="px-3 py-2 text-xs rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300"
                  title="取消合并"
                >
                  取消合并
                </button>
              </div>

              <div className="overflow-x-auto">
                <table
                  className={`mx-auto ${
                    style === 'three-line'
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
                          const activeNow = activeTableCell?.r === r && activeTableCell?.c === c;
                          return (
                            <td
                              key={c}
                              rowSpan={rs}
                              colSpan={cs}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (tableSelectionMode) {
                                  // 选区模式：第一次点击设定起点；第二次点击设定终点形成矩形。
                                  if (!tableSelection || (tableSelection.r1 !== tableSelection.r2 || tableSelection.c1 !== tableSelection.c2)) {
                                    setActiveTableCell({ r, c });
                                    setTableSelection({ r1: r, c1: c, r2: r, c2: c });
                                  } else {
                                    setActiveTableCell({ r: tableSelection.r1, c: tableSelection.c1 });
                                    setTableSelection({ r1: tableSelection.r1, c1: tableSelection.c1, r2: r, c2: c });
                                  }
                                  setIsEditingTableCell(false);
                                  return;
                                }

                                if (e.shiftKey && activeTableCell) {
                                  setTableSelection({ r1: activeTableCell.r, c1: activeTableCell.c, r2: r, c2: c });
                                } else {
                                  setActiveTableCell({ r, c });
                                  setTableSelection({ r1: r, c1: c, r2: r, c2: c });
                                  setIsEditingTableCell(false);
                                }
                              }}
                              className={`${
                                style === 'normal'
                                  ? 'border-r border-zinc-200 dark:border-zinc-700 last:border-r-0'
                                  : ''
                              } p-2 align-top min-w-[120px] ${
                                activeNow
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

              {activeCell && active && !active.hidden && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-700">
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
                      onMouseDown={(e) => { e.preventDefault(); insertInlineMath('table'); }}
                      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                      title="插入行内公式"
                    >
                      <Sigma size={16} />
                    </button>
                    <div className="relative" ref={tableColorPickerRef}>
                      <button
                        onMouseDown={(e) => { e.preventDefault(); setShowTableColorPicker(!showTableColorPicker); }}
                        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                        title="文字颜色"
                      >
                        <Palette size={16} />
                      </button>
                      {showTableColorPicker && (
                        <div className="absolute top-full left-0 mt-1 p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-50 w-max">
                          <div className="grid grid-cols-5 gap-2">
                            {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000'].map(color => (
                              <button
                                key={color}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  applyFormatToTableCell('color', color);
                                  setShowTableColorPicker(false);
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
                    onFocus={() => setIsEditingTableCell(true)}
                    onBlur={() => {
                      setIsEditingTableCell(false);
                      syncTableCellFromDom();
                    }}
                    onInput={() => syncTableCellFromDom()}
                    onClick={(e) => handleRichEditorClick('table', e)}
                    onKeyDown={(e) => {
                      handleListKeyDown('table', e);
                    }}
                    className="w-full min-h-[40px] p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-0 [&_li]:my-0"
                    data-placeholder="编辑当前单元格内容..."
                  />

                  {activeInlineMath?.scope === 'table' && (
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
                              const nextState = { ...activeInlineMath, format: 'latex' as InlineMathFormat };
                              setActiveInlineMath(nextState);
                              updateInlineMathPillAttrs(nextState);
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
                              const nextState = { ...activeInlineMath, format: 'typst' as InlineMathFormat };
                              setActiveInlineMath(nextState);
                              updateInlineMathPillAttrs(nextState);
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
                            syncTableCellFromDom();
                          } else {
                            const nextTypst = nextVal;
                            const nextLatex = typstToLatexMath(nextTypst);
                            const nextState = { ...activeInlineMath, typst: nextTypst, latex: nextLatex };
                            setActiveInlineMath(nextState);
                            updateInlineMathPillAttrs(nextState);
                            syncTableCellFromDom();
                          }
                        }}
                        className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
                        rows={3}
                        placeholder={activeInlineMath.format === 'latex' ? '输入 LaTeX，例如: \\frac{1}{2}' : '输入 Typst math，例如: frac(1, 2)'}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                说明：先选中单元格。默认可用 Shift+点击框选矩形区域后点“合并”。也可开启“选区模式”：点击一次设起点，再点击一次设终点完成框选；再次点击将重新开始框选。三线表为无竖线样式。
              </div>
            </div>
          );
        })()
      ) : (
        <div className="relative">
          {/* Rich text formatting toolbar for paragraph blocks */}
          {(block.type === 'paragraph' || block.type === 'heading') && (
            <div className="flex gap-1 mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-700">
              <button
                onMouseDown={(e) => { e.preventDefault(); applyFormat('bold'); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="加粗 (Ctrl+B)"
              >
                <Bold size={16} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyList('ordered'); }}
                className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="有序列表"
              >
                1.
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyList('bullet'); }}
                className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="无序列表"
              >
                •
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyFormat('italic'); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="斜体 (Ctrl+I)"
              >
                <Italic size={16} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyFormat('strike'); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="删除线"
              >
                <Strikethrough size={16} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); insertInlineMath('main'); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="插入行内公式"
              >
                <Sigma size={16} />
              </button>
              <div className="relative" ref={colorPickerRef}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); setShowColorPicker(!showColorPicker); }}
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

              {block.type === 'paragraph' && (
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
              )}
            </div>
          )}

          <input
            className="hidden"
          />

          {block.type === 'paragraph' || block.type === 'heading' ? (
            <>
              <div
                ref={paragraphEditorRef}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setIsEditingParagraph(true)}
                onBlur={() => {
                  setIsEditingParagraph(false);
                  syncParagraphFromDom();
                }}
                onInput={() => {
                  // Update Typst source live while typing, without re-rendering the HTML.
                  syncParagraphFromDom();
                }}
                onClick={(e) => handleRichEditorClick('main', e)}
                onKeyDown={(e) => {
                  handleListKeyDown('main', e);
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
                style={
                  block.type === 'paragraph' && typeof block.lineSpacing === 'number' && block.lineSpacing !== 1
                    ? { lineHeight: block.lineSpacing }
                    : undefined
                }
                className={`w-full min-h-[40px] p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-0 [&_li]:my-0 ${block.type === 'heading' ? `font-bold text-${['lg', 'xl', '2xl', '3xl', '4xl', '5xl'][6 - (block.level || 1)] || 'base'}` : ''}`}
                data-placeholder={`输入${getTypeName(block.type)}内容...`}
              />
              {activeInlineMath && (
                <div className="inline-math-editor mt-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-500">编辑行内公式</span>
                    <button 
                      onClick={() => {
                        if (activeInlineMath.scope === 'main') syncParagraphFromDom();
                        else syncTableCellFromDom();
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
                        if (nextState.scope === 'main') syncParagraphFromDom();
                        else syncTableCellFromDom();
                      } else {
                        const nextTypst = nextVal;
                        const nextLatex = typstToLatexMath(nextTypst);
                        const nextState = { ...activeInlineMath, typst: nextTypst, latex: nextLatex };
                        setActiveInlineMath(nextState);
                        updateInlineMathPillAttrs(nextState);
                        if (nextState.scope === 'main') syncParagraphFromDom();
                        else syncTableCellFromDom();
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
            </>
          ) : (
            <input
              type="text"
              value={block.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              placeholder={`输入${getTypeName(block.type)}内容...`}
            />
          )}
        </div>
      )}

      {/* 添加按钮 */}
      <button
        onClick={onAddAfter}
        className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 hover:bg-blue-600 text-white rounded-full p-1"
        title="在下方添加块"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function getTypeName(type: BlockType): string {
  const names: Record<BlockType, string> = {
    heading: '标题',
    paragraph: '段落',
    code: '代码',
    math: '数学公式',
    list: '列表',
    image: '图片',
    table: '表格',
  };
  return names[type] || '内容';
}
