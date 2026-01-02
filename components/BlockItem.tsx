'use client';

import { TypstBlock, BlockType } from '@/lib/typst';
import { Trash2, Plus, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import TitleBlockEditor from './BlockEditors/TitleBlockEditor';
import TextBlockEditor from './BlockEditors/TextBlockEditor';
import CodeBlockEditor from './BlockEditors/CodeBlockEditor';
import ImageBlockEditor from './BlockEditors/ImageBlockEditor';
import TableBlockEditor from './BlockEditors/TableBlockEditor';
import MathBlockEditor from './BlockEditors/MathBlockEditor';
import ChartBlockEditor, { type ChartRenderRequest } from './BlockEditors/ChartBlockEditor';
import VerticalSpaceBlockEditor from './BlockEditors/VerticalSpaceBlockEditor';
import InputFieldBlockEditor from './BlockEditors/InputFieldBlockEditor';

import {
  defaultTablePayload,
} from './BlockEditor-utils/table-utils';


interface BlockItemProps {
  block: TypstBlock;
  isFirst: boolean;
  isLast: boolean;
  allBlocks: TypstBlock[];
  availableTables: Array<{ id: string; label: string }>;
  onUpdate: (updates: Partial<TypstBlock>) => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onUploadImage: (file: File) => Promise<void>;
  onTableSelectionSnapshot: (snap: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null) => void;
  lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null;
  onRenderChart: (payload: ChartRenderRequest) => Promise<string>;
  onClick: () => void;
}

function BlockItem({ block, isFirst, isLast, allBlocks, availableTables, onUpdate, onDelete, onAddAfter, onMove, onUploadImage, onTableSelectionSnapshot, lastTableSelection, onRenderChart, onClick }: BlockItemProps) {

  const effectiveText = (block.content ?? '').replace(/\u200B/g, '').trim();
  const isAnswerBlank = block.type === 'paragraph' && !!block.placeholder && effectiveText.length === 0;

  if (block.type === 'cover') {
    const collapsed = block.uiCollapsed !== false;
    const children = Array.isArray(block.children) ? block.children : [];
    return (
      <div
        className="group relative border rounded-lg p-3 cursor-pointer transition-colors duration-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-900"
        onClick={onClick}
      >
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate({ uiCollapsed: !collapsed });
            }}
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={collapsed ? '展开封面' : '折叠封面'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">封面</div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {children.length} 个元素
          </div>
          <div className="ml-auto flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddAfter();
              }}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
              title="在封面后添加块"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded"
              title="删除封面"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="pl-4 border-l border-zinc-200 dark:border-zinc-700 space-y-2">
            {children.length === 0 ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">(空封面)</div>
            ) : (
              children.map((child) => (
                <div key={child.id} className="cursor-default" onClick={(e) => e.stopPropagation()}>
                  <BlockItem
                    block={child}
                    isFirst={false}
                    isLast={false}
                    allBlocks={children}
                    availableTables={availableTables}
                    onUpdate={(updates) => {
                      const nextChildren = children.map((b) => (b.id === child.id ? { ...b, ...updates } : b));
                      onUpdate({ children: nextChildren });
                    }}
                    onDelete={() => {
                      const nextChildren = children.filter((b) => b.id !== child.id);
                      onUpdate({ children: nextChildren });
                    }}
                    onAddAfter={() => {
                      // Simplest: append a new paragraph at end (no in-between insert)
                      const nextId = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                      const nextChildren = [...children, { id: nextId, type: 'paragraph', content: '' } as TypstBlock];
                      onUpdate({ children: nextChildren });
                    }}
                    onMove={() => { }}
                    onUploadImage={onUploadImage}
                    onTableSelectionSnapshot={onTableSelectionSnapshot}
                    lastTableSelection={lastTableSelection}
                    onRenderChart={onRenderChart}
                    onClick={() => { }}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {/* Add-after button (same behavior as other blocks) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddAfter();
          }}
          className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 hover:bg-blue-600 text-white rounded-full p-1"
          title="在下方添加块"
        >
          <Plus size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        "group relative border rounded-lg p-3 cursor-pointer transition-colors duration-200 " +
        (isAnswerBlank
          ? "border-dashed border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700"
          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-900")
      }
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
                width: block.width ?? '50%',
              });
              return;
            }
            if (nextType === 'image' && block.type !== 'image') {
              onUpdate({
                type: nextType,
                width: block.width ?? '50%',
                align: block.align ?? 'center',
              });
              return;
            }
            if (nextType === 'chart' && block.type !== 'chart') {
              onUpdate({
                type: nextType,
                width: block.width ?? '50%',
                align: block.align ?? 'center',
              });
              return;
            }
            if (nextType === 'vertical_space' && block.type !== 'vertical_space') {
              onUpdate({
                type: nextType,
                content: '5%',
              });
              return;
            }
            if (nextType === 'input_field' && block.type !== 'input_field') {
              onUpdate({
                type: nextType,
                inputLabel: '',
                inputValue: '',
                inputSeparator: '：',
                inputShowUnderline: true,
                inputWidth: '50%',
                inputAlign: 'center',
                inputFontSize: '',
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
          <option value="chart">图表</option>
          <option value="vertical_space">空白行</option>
          <option value="input_field">输入</option>
        </select>

        {(block.type === 'paragraph') && (
          <select
            value={block.fontSize || ''}
            onChange={(e) => onUpdate({ fontSize: e.target.value || undefined })}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 w-24"
            title="字号"
          >
            <option value="">默认字号</option>
            <option value="9pt">9pt (小五)</option>
            <option value="10.5pt">10.5pt (五号)</option>
            <option value="12pt">12pt (小四)</option>
            <option value="14pt">14pt (四号)</option>
            <option value="15pt">15pt (小三)</option>
            <option value="16pt">16pt (三号)</option>
            <option value="22pt">22pt (二号)</option>
          </select>
        )}

        <div className="ml-auto flex gap-1">
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
        <CodeBlockEditor block={block} onUpdate={onUpdate} />
      ) : block.type === 'chart' ? (
        <ChartBlockEditor
          block={block}
          onUpdate={onUpdate}
          allBlocks={allBlocks}
          availableTables={availableTables}
          onRenderChart={onRenderChart}
          lastTableSelection={lastTableSelection}
        />
      ) : block.type === 'image' ? (
        <ImageBlockEditor block={block} onUpdate={onUpdate} onUploadImage={onUploadImage} />
      ) : block.type === 'math' ? (
        <MathBlockEditor block={block} onUpdate={onUpdate} />
      ) : block.type === 'table' ? (
        <TableBlockEditor block={block} onUpdate={onUpdate} onTableSelectionSnapshot={onTableSelectionSnapshot} />
      ) : block.type === 'heading' ? (
        <TitleBlockEditor block={block} onUpdate={onUpdate} />
      ) : block.type === 'paragraph' || block.type === 'list' ? (
        <TextBlockEditor block={block} onUpdate={onUpdate} />
      ) : block.type === 'vertical_space' ? (
        <VerticalSpaceBlockEditor block={block} onUpdate={onUpdate} />
      ) : block.type === 'input_field' ? (
        <InputFieldBlockEditor block={block} onUpdate={onUpdate} />
      ) : (
        <input
          type="text"
          value={block.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
          placeholder={`输入${getTypeName(block.type)}内容...`}
        />
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
    chart: '图表',
    vertical_space: '空白行',
    input_field: '输入',
    cover: '封面',
  };
  return names[type] || '内容';
}

export default BlockItem;
