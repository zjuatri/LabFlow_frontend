'use client';

import { TypstBlock } from '@/lib/typst';
import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';
import { useRef, useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react';

// Import types and utilities from separated modules
import type { InlineMathFormat, InlineMathState } from '../BlockEditor-utils/types';
import {
  typstInlineToHtml,
  htmlToTypstInline,
  generateInlineMathId,
} from '../BlockEditor-utils/utils';

// Import extracted components
import TextBlockToolbar from './text/TextBlockToolbar';
import InlineMathEditor from './text/InlineMathEditor';

interface TextBlockEditorProps {
  block: TypstBlock;
  onUpdate: (updates: Partial<TypstBlock>) => void;
}

export default function TextBlockEditor({ block, onUpdate }: TextBlockEditorProps) {
  const paragraphEditorRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [isEditingParagraph, setIsEditingParagraph] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeInlineMath, setActiveInlineMath] = useState<InlineMathState | null>(null);

  // Debounce timer for reducing state update frequency during typing
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveText = (block.content ?? '').replace(/\u200B/g, '').trim();
  const placeholderText = block.placeholder ?? '输入段落内容...';
  const isAnswerBlank = !!block.placeholder && effectiveText.length === 0;

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

  // Track last synced content to detect external changes (e.g., undo/redo)
  const lastSyncedContentRef = useRef<string>(block.content ?? '');

  useEffect(() => {
    // Keep editor in sync when not actively editing.
    // IMPORTANT: while editing an inline formula, do not overwrite the DOM;
    // otherwise the pill node gets replaced and edits appear to "disappear".

    // CRITICAL: If content changed externally (e.g., undo/redo), we MUST update
    // even if user is editing, otherwise undo appears to not work in the editor.
    const currentContent = block.content ?? '';
    const contentChangedExternally = currentContent !== lastSyncedContentRef.current;

    // Skip only if we're editing AND content hasn't changed externally
    if ((isEditingParagraph || activeInlineMath) && !contentChangedExternally) return;

    if (!paragraphEditorRef.current) return;

    // Skip list auto-detection if:
    // 1. Block type is explicitly 'list', OR
    // 2. Content looks like a pure list (all lines start with numbers or bullets)
    // This prevents double numbering when content already has "1. xxx" format
    const content = currentContent;
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const allNumbered = lines.length > 0 && lines.every(l => /^\d+[.)]\s/.test(l));
    const allBulleted = lines.length > 0 && lines.every(l => /^[-*•]\s/.test(l));
    const isListContent = block.type === 'list' || allNumbered || allBulleted;

    const html = typstInlineToHtml(content, { skipListDetection: isListContent });
    if (paragraphEditorRef.current.innerHTML !== html) {
      paragraphEditorRef.current.innerHTML = html;
    }

    // Update the ref to track that we've synced this content
    lastSyncedContentRef.current = currentContent;
  }, [block.content, block.type, isEditingParagraph, activeInlineMath]);

  const syncParagraphFromDom = () => {
    if (!paragraphEditorRef.current) return;
    const newTypst = htmlToTypstInline(paragraphEditorRef.current);
    if (newTypst !== block.content) {
      // Update ref BEFORE calling onUpdate to prevent the useEffect from
      // thinking this is an external change and rewriting the DOM (which kills cursor position).
      lastSyncedContentRef.current = newTypst;
      onUpdate({ content: newTypst });
    }
  };

  // Debounced version for onInput - reduces state updates during fast typing
  const debouncedSync = () => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
    syncDebounceRef.current = setTimeout(() => {
      syncParagraphFromDom();
      syncDebounceRef.current = null;
    }, 150);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
    };
  }, []);

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
    if (state.displayMode) {
      pill.setAttribute('data-display-mode', 'true');
    } else {
      pill.removeAttribute('data-display-mode');
    }
  };

  const handleRichEditorClick = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.inline-math-pill') as HTMLElement | null;
    if (pill) {
      const id = pill.getAttribute('data-inline-math-id') ?? generateInlineMathId();
      if (!pill.getAttribute('data-inline-math-id')) pill.setAttribute('data-inline-math-id', id);

      const typst = (pill.getAttribute('data-typst') ?? '').trim();
      const latex = (pill.getAttribute('data-latex') ?? '').trim() || (typst ? typstToLatexMath(typst) : '');
      const format = ((pill.getAttribute('data-format') ?? 'latex') as InlineMathFormat);
      const displayMode = pill.getAttribute('data-display-mode') === 'true';
      setActiveInlineMath({ scope: 'main', id, format, latex, typst, displayMode });
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

    // For plain text (non-list), insert <br> for line break.
    // ContentEditable quirk: a single <br> at the end of a line is often "collapsed" by the browser,
    // so we need to check if we're at the end and add an extra <br> or a zero-width space after it.
    const br = document.createElement('br');
    range.deleteContents();
    range.insertNode(br);

    // Check if cursor is at the end of the contenteditable or the br is the last visible element
    const nextSibling = br.nextSibling;
    const isAtEnd = !nextSibling ||
      (nextSibling.nodeType === Node.TEXT_NODE && (nextSibling.textContent ?? '').replace(/\u200B/g, '') === '') ||
      (nextSibling.nodeName === 'BR');

    if (isAtEnd) {
      // Insert a second <br> to make the line break visible
      const br2 = document.createElement('br');
      br.after(br2);
      range.setStartAfter(br);
    } else {
      range.setStartAfter(br);
    }

    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    syncParagraphFromDom();
  };

  const applyFormat = (fmt: 'bold' | 'italic' | 'strike' | 'underline' | 'color', color?: string) => {
    const editor = paragraphEditorRef.current;
    if (!editor) return;
    editor.focus();

    if (fmt === 'bold') {
      document.execCommand('bold');
    } else if (fmt === 'italic') {
      document.execCommand('italic');
    } else if (fmt === 'strike') {
      document.execCommand('strikeThrough');
    } else if (fmt === 'underline') {
      document.execCommand('underline');
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

    const space = document.createTextNode('\u00A0');
    range.insertNode(space);
    range.collapse(false);

    syncParagraphFromDom();
  };

  // Handle paste: detect $$...$$ patterns and convert to inline math pills
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('$$')) return; // Let default paste handle it

    e.preventDefault();

    const editor = paragraphEditorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    // Delete selected content
    range.deleteContents();

    const regex = /\$\$([^$]+)\$\$/g;
    let lastIndex = 0;
    let match;
    const fragment = document.createDocumentFragment();

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const beforeText = text.slice(lastIndex, match.index);
        fragment.appendChild(document.createTextNode(beforeText));
      }

      const latexContent = match[1];
      const id = generateInlineMathId();
      const typstContent = latexToTypstMath(latexContent);

      const spacer = document.createElement('span');
      spacer.className = 'inline-math-spacer';
      spacer.textContent = '\u200B';
      fragment.appendChild(spacer);

      const pill = document.createElement('span');
      pill.className = 'inline-math-pill';
      pill.setAttribute('data-inline-math-id', id);
      pill.setAttribute('data-format', 'latex');
      pill.setAttribute('data-latex', latexContent);
      pill.setAttribute('data-typst', typstContent);
      pill.setAttribute('data-display-mode', 'true');
      pill.contentEditable = 'false';
      pill.textContent = '∑';
      fragment.appendChild(pill);

      fragment.appendChild(document.createTextNode('\u200B'));
      fragment.appendChild(document.createElement('br'));

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    range.insertNode(fragment);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    syncParagraphFromDom();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 格式工具栏 */}
      <TextBlockToolbar
        block={block}
        onUpdate={onUpdate}
        applyFormat={applyFormat}
        applyList={applyList}
        insertInlineMath={insertInlineMath}
        showColorPicker={showColorPicker}
        setShowColorPicker={setShowColorPicker}
        colorPickerRef={colorPickerRef}
      />

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
        onInput={debouncedSync}
        onClick={handleRichEditorClick}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          handleListKeyDown(e);
          if (e.ctrlKey && !e.shiftKey) {
            if (e.key === 'b' || e.key === 'B') {
              e.preventDefault();
              applyFormat('bold');
            } else if (e.key === 'i' || e.key === 'I') {
              e.preventDefault();
              applyFormat('italic');
            } else if (e.key === 'u' || e.key === 'U') {
              e.preventDefault();
              applyFormat('underline');
            }
          }
        }}
        style={{
          lineHeight: typeof block.lineSpacing === 'number'
            ? 1 + (0.8 * block.lineSpacing)
            : 1.8
        }}
        className={
          "w-full min-h-[40px] p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap outline-none cursor-text [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-0 [&_li]:my-0" +
          (isAnswerBlank ? ' border-dashed' : '')
        }
        data-placeholder={isAnswerBlank ? '( 请在此处填写答案 )' : placeholderText}
      />

      {/* 行内公式编辑器 */}
      {activeInlineMath && (
        <InlineMathEditor
          state={activeInlineMath}
          onUpdate={(newState) => {
            setActiveInlineMath(newState);
            updateInlineMathPillAttrs(newState);
            syncParagraphFromDom();
          }}
          onClose={() => {
            syncParagraphFromDom();
            setActiveInlineMath(null);
          }}
        />
      )}
    </div>
  );
}