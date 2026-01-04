'use client';

import { useState } from 'react';
import { TypstBlock } from '@/lib/typst';
import { Trash2, Plus, ChevronDown, ChevronRight, Download } from 'lucide-react';
import type { ChartRenderRequest } from './BlockEditors/ChartBlockEditor';

// Forward declaration - will be resolved by parent import
type BlockItemComponent = React.ComponentType<BlockItemProps>;

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
    imageWidthUnit?: 'percent' | 'pt';
}

interface CompositeRowItemProps {
    block: TypstBlock;
    /** All blocks in the parent document (for importing existing blocks) */
    allBlocks: TypstBlock[];
    availableTables: Array<{ id: string; label: string }>;
    onUpdate: (updates: Partial<TypstBlock>) => void;
    onDelete: () => void;
    onAddAfter: () => void;
    onUploadImage: (file: File) => Promise<void>;
    onTableSelectionSnapshot: (snap: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null) => void;
    lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null;
    onRenderChart: (payload: ChartRenderRequest) => Promise<string>;
    onClick: () => void;
    // Pass BlockItem component to avoid circular dependency
    BlockItemComponent: BlockItemComponent;
    /** Callback to move existing block(s) from the parent into this composite row */
    onMoveBlockToComposite?: (blockIds: string | string[]) => void;
}

const JUSTIFY_OPTIONS = [
    { value: 'flex-start', label: '左对齐' },
    { value: 'flex-end', label: '右对齐' },
    { value: 'center', label: '居中' },
    { value: 'space-between', label: '两端对齐' },
    { value: 'space-around', label: '均匀分布' },
    { value: 'space-evenly', label: '均匀间隔' },
];

const GAP_OPTIONS = ['4pt', '8pt', '12pt', '16pt', '24pt'];

// Gap is only needed for simple alignments (left/center/right), not for space-* modes
const NEEDS_GAP = new Set(['flex-start', 'flex-end', 'center']);

export default function CompositeRowItem({
    block,
    allBlocks,
    availableTables,
    onUpdate,
    onDelete,
    onAddAfter,
    // onUploadImage,
    onTableSelectionSnapshot,
    lastTableSelection,
    onRenderChart,
    onClick,
    BlockItemComponent,
    onMoveBlockToComposite,
}: CompositeRowItemProps) {
    const [showImportPopup, setShowImportPopup] = useState(false);
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());

    const collapsed = block.uiCollapsed !== false;
    const children = Array.isArray(block.children) ? block.children : [];
    const justify = block.compositeJustify || 'space-between';
    const gap = block.compositeGap || '8pt';
    const verticalAlign = block.compositeVerticalAlign || 'top';

    // Get blocks that can be imported (exclude self, covers, and composite rows)
    const childIds = new Set(children.map(c => c.id));
    const importableBlocks = allBlocks.filter(b =>
        b.id !== block.id &&
        b.type !== 'cover' &&
        b.type !== 'composite_row' &&
        !childIds.has(b.id)
    );

    // Helper to get a short preview of a block for the import list
    const getBlockPreview = (b: TypstBlock): string => {
        const typeLabels: Record<string, string> = {
            heading: '标题',
            paragraph: '段落',
            code: '代码',
            math: '数学',
            image: '图片',
            table: '表格',
            chart: '图表',
            vertical_space: '空白',
            input_field: '输入',
            list: '列表',
        };
        const typeLabel = typeLabels[b.type] || b.type;

        // Special handling for image blocks
        if (b.type === 'image') {
            if (!b.content) {
                return `[${typeLabel}] (未上传)`;
            }
            if (b.content.startsWith('[[')) {
                // AI-generated placeholder
                const match = b.content.match(/\[\[\s*IMAGE_PLACEHOLDER\s*:\s*(.*?)\s*\]\]/i);
                return `[${typeLabel}] ${match?.[1] || '占位符'}`;
            }
            // Uploaded image - show caption if available
            return `[${typeLabel}] ${b.caption || '已上传图片'}`;
        }

        const contentSnippet = (b.content || '').slice(0, 30).replace(/\n/g, ' ');
        return `[${typeLabel}] ${contentSnippet}${(b.content?.length ?? 0) > 30 ? '...' : ''}`;
    };



    return (
        <div
            className="group relative border rounded-lg p-6 cursor-pointer transition-colors duration-200 border-indigo-200 dark:border-indigo-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-white dark:bg-zinc-900"
            onClick={onClick}
        >
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onUpdate({ uiCollapsed: !collapsed });
                    }}
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    title={collapsed ? '展开复合行' : '折叠复合行'}
                >
                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">复合行</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {children.length}/4 子块
                </div>

                {/* Horizontal alignment selector */}
                <select
                    value={justify}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                        e.stopPropagation();
                        onUpdate({ compositeJustify: e.target.value as 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' });
                    }}
                    className="text-[10px] px-1 py-0.5 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                    title="水平对齐"
                >
                    {JUSTIFY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>

                {/* Gap selector - only shown for simple alignments */}
                {NEEDS_GAP.has(justify) && (
                    <select
                        value={gap}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                            e.stopPropagation();
                            onUpdate({ compositeGap: e.target.value });
                        }}
                        className="text-[10px] px-1 py-0.5 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                        title="间距"
                    >
                        {GAP_OPTIONS.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                )}

                {/* Vertical alignment buttons */}
                <div className="flex gap-0.5 border border-zinc-300 dark:border-zinc-600 rounded overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={() => onUpdate({ compositeVerticalAlign: 'top' })}
                        className={`p-1 transition-colors ${verticalAlign === 'top' ? 'bg-indigo-100 dark:bg-indigo-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        title="顶端对齐"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="4" y1="4" x2="20" y2="4" />
                            <rect x="6" y="6" width="4" height="14" rx="1" />
                            <rect x="14" y="6" width="4" height="8" rx="1" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => onUpdate({ compositeVerticalAlign: 'middle' })}
                        className={`p-1 transition-colors ${verticalAlign === 'middle' ? 'bg-indigo-100 dark:bg-indigo-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        title="中间对齐"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="4" y1="12" x2="20" y2="12" strokeDasharray="2 2" />
                            <rect x="6" y="5" width="4" height="14" rx="1" />
                            <rect x="14" y="8" width="4" height="8" rx="1" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => onUpdate({ compositeVerticalAlign: 'bottom' })}
                        className={`p-1 transition-colors ${verticalAlign === 'bottom' ? 'bg-indigo-100 dark:bg-indigo-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        title="底端对齐"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="4" y1="20" x2="20" y2="20" />
                            <rect x="6" y="4" width="4" height="14" rx="1" />
                            <rect x="14" y="10" width="4" height="8" rx="1" />
                        </svg>
                    </button>
                </div>

                <div className="ml-auto flex gap-1 relative">
                    {children.length < 4 && (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const nextId = `composite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                                    const nextChildren = [...children, { id: nextId, type: 'paragraph', content: '' } as TypstBlock];
                                    onUpdate({ children: nextChildren });
                                }}
                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                                title="添加新子块"
                            >
                                <Plus size={14} />
                            </button>
                            {onMoveBlockToComposite && importableBlocks.length > 0 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowImportPopup(!showImportPopup);
                                    }}
                                    className={`p-1 rounded transition-colors ${showImportPopup ? 'bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                                    title="导入已有块"
                                >
                                    <Download size={14} />
                                </button>
                            )}
                        </>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded"
                        title="删除复合行"
                    >
                        <Trash2 size={14} />
                    </button>

                    {/* Import Modal */}
                    {showImportPopup && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowImportPopup(false);
                                setSelectedBlockIds(new Set());
                            }}
                        >
                            <div
                                className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-xl shadow-2xl max-h-[70vh] overflow-hidden min-w-[320px] max-w-[480px] w-full mx-4 flex flex-col"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between shrink-0">
                                    <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">导入已有块到复合行</span>
                                    <button
                                        onClick={() => {
                                            setShowImportPopup(false);
                                            setSelectedBlockIds(new Set());
                                        }}
                                        className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-lg leading-none"
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* Select All / Clear All */}
                                {importableBlocks.length > 0 && (
                                    <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-700 flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => {
                                                const maxToSelect = 4 - children.length;
                                                if (selectedBlockIds.size === Math.min(importableBlocks.length, maxToSelect)) {
                                                    setSelectedBlockIds(new Set());
                                                } else {
                                                    const newSelected = new Set(
                                                        importableBlocks.slice(0, maxToSelect).map(b => b.id)
                                                    );
                                                    setSelectedBlockIds(newSelected);
                                                }
                                            }}
                                            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                                        >
                                            {selectedBlockIds.size === Math.min(importableBlocks.length, 4 - children.length) ? '取消全选' : `全选 (最多${4 - children.length}个)`}
                                        </button>
                                        {selectedBlockIds.size > 0 && (
                                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                                已选 {selectedBlockIds.size} 个
                                            </span>
                                        )}
                                    </div>
                                )}

                                <div className="p-2 flex-1 overflow-y-auto">
                                    {importableBlocks.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
                                            没有可导入的块
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {importableBlocks.map((b) => {
                                                // Define colors for each block type
                                                const typeColors: Record<string, { bg: string; text: string; border: string }> = {
                                                    heading: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-700' },
                                                    paragraph: { bg: 'bg-zinc-100 dark:bg-zinc-700', text: 'text-zinc-700 dark:text-zinc-300', border: 'border-zinc-200 dark:border-zinc-600' },
                                                    code: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-700' },
                                                    math: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-700' },
                                                    image: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-700' },
                                                    table: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-700' },
                                                    chart: { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-700' },
                                                    vertical_space: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-600' },
                                                    input_field: { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-700' },
                                                    list: { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-700' },
                                                };
                                                const typeLabels: Record<string, string> = {
                                                    heading: '标题', paragraph: '段落', code: '代码', math: '数学',
                                                    image: '图片', table: '表格', chart: '图表', vertical_space: '空白',
                                                    input_field: '输入', list: '列表',
                                                };
                                                const colors = typeColors[b.type] || typeColors.paragraph;
                                                const typeLabel = typeLabels[b.type] || b.type;
                                                const isSelected = selectedBlockIds.has(b.id);
                                                const canSelect = isSelected || (selectedBlockIds.size < (4 - children.length));

                                                // Get content preview
                                                let preview = '';
                                                if (b.type === 'image') {
                                                    if (!b.content) preview = '(未上传)';
                                                    else if (b.content.startsWith('[[')) {
                                                        const match = b.content.match(/\[\[\s*IMAGE_PLACEHOLDER\s*:\s*(.*?)\s*\]\]/i);
                                                        preview = match?.[1] || '占位符';
                                                    } else {
                                                        preview = b.caption || '已上传图片';
                                                    }
                                                } else {
                                                    preview = (b.content || '').slice(0, 40).replace(/\n/g, ' ');
                                                    if ((b.content?.length ?? 0) > 40) preview += '...';
                                                }

                                                return (
                                                    <button
                                                        key={b.id}
                                                        onClick={() => {
                                                            if (!canSelect) return;
                                                            const newSet = new Set(selectedBlockIds);
                                                            if (isSelected) {
                                                                newSet.delete(b.id);
                                                            } else {
                                                                newSet.add(b.id);
                                                            }
                                                            setSelectedBlockIds(newSet);
                                                        }}
                                                        disabled={!canSelect}
                                                        className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-2 group ${isSelected
                                                            ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm'
                                                            : `${colors.border} ${canSelect ? 'hover:shadow-md' : 'opacity-50 cursor-not-allowed'}`
                                                            }`}
                                                        title={getBlockPreview(b)}
                                                    >
                                                        {/* Checkbox */}
                                                        <span className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isSelected
                                                            ? 'bg-indigo-500 border-indigo-500 text-white'
                                                            : 'border-zinc-300 dark:border-zinc-600'
                                                            }`}>
                                                            {isSelected && <span className="text-[10px]">✓</span>}
                                                        </span>
                                                        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded ${colors.bg} ${colors.text}`}>
                                                            {typeLabel}
                                                        </span>
                                                        <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate flex-1">
                                                            {preview || '(空)'}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Footer with confirm button */}
                                <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between shrink-0">
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                        共 {importableBlocks.length} 个块 · 复合行已有 {children.length}/4 子块
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setShowImportPopup(false);
                                                setSelectedBlockIds(new Set());
                                            }}
                                            className="px-3 py-1.5 text-xs rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                                        >
                                            取消
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (onMoveBlockToComposite && selectedBlockIds.size > 0) {
                                                    // Import blocks in order they appear in the document
                                                    const orderedIds = importableBlocks
                                                        .filter(b => selectedBlockIds.has(b.id))
                                                        .map(b => b.id);
                                                    // Pass all IDs at once for batch import
                                                    onMoveBlockToComposite(orderedIds);
                                                }
                                                setShowImportPopup(false);
                                                setSelectedBlockIds(new Set());
                                            }}
                                            disabled={selectedBlockIds.size === 0}
                                            className="px-4 py-1.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:bg-indigo-300 disabled:cursor-not-allowed font-medium"
                                        >
                                            导入 {selectedBlockIds.size > 0 ? `(${selectedBlockIds.size})` : ''}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {!collapsed && (
                <div className="pl-4 border-l-2 border-indigo-200 dark:border-indigo-700 space-y-4">
                    {children.length === 0 ? (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">(空复合行 - 点击上方 + 添加子块，或点击 ↓ 导入已有块)</div>

                    ) : (
                        children.map((child, idx) => (
                            <div key={child.id} className="cursor-default relative" onClick={(e) => e.stopPropagation()}>
                                <div className="absolute -left-3 top-3 text-[9px] text-indigo-400 font-mono">{idx + 1}</div>
                                <BlockItemComponent
                                    block={child}
                                    isFirst={idx === 0}
                                    isLast={idx === children.length - 1}
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
                                        const nextId = `composite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                                        const insertIdx = children.findIndex(c => c.id === child.id) + 1;
                                        const nextChildren = [...children.slice(0, insertIdx), { id: nextId, type: 'paragraph', content: '' } as TypstBlock, ...children.slice(insertIdx)];
                                        if (nextChildren.length <= 4) {
                                            onUpdate({ children: nextChildren });
                                        }
                                    }}
                                    onMove={(direction) => {
                                        const currentIdx = children.findIndex(c => c.id === child.id);
                                        const newIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
                                        if (newIdx >= 0 && newIdx < children.length) {
                                            const newChildren = [...children];
                                            [newChildren[currentIdx], newChildren[newIdx]] = [newChildren[newIdx], newChildren[currentIdx]];
                                            onUpdate({ children: newChildren });
                                        }
                                    }}
                                    onUploadImage={async (file: File) => {
                                        // Custom upload handler for child blocks:
                                        // Instead of using parent's onUploadImage which updates the wrong block,
                                        // we call it but then update the correct child block via onUpdate
                                        // However, onUploadImage actually uploads AND updates - we need to just upload
                                        // and get the URL back, then update the child ourselves.
                                        // The simplest fix is to call the parent upload, then manually update the child.
                                        // But since onUploadImage doesn't return the URL, we need a different approach.
                                        // Let's make custom fetch call here directly.
                                        const token = typeof window !== 'undefined' && localStorage.getItem('authToken');
                                        const form = new FormData();
                                        form.append('file', file);

                                        // Get projectId from URL
                                        const pathParts = window.location.pathname.split('/');
                                        const projectIdx = pathParts.findIndex(p => p === 'projects');
                                        const projectId = projectIdx >= 0 ? pathParts[projectIdx + 1] : '';

                                        if (!projectId) {
                                            throw new Error('找不到项目ID');
                                        }

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
                                            // Update THIS child's content with the uploaded URL
                                            const nextChildren = children.map((b) =>
                                                b.id === child.id ? { ...b, content: url } : b
                                            );
                                            onUpdate({ children: nextChildren });
                                        }
                                    }}
                                    onTableSelectionSnapshot={onTableSelectionSnapshot}
                                    lastTableSelection={lastTableSelection}
                                    onRenderChart={onRenderChart}
                                    onClick={() => { }}
                                    imageWidthUnit="pt"
                                />
                            </div>
                        ))
                    )}
                </div>
            )}

            {children.length > 0 && children.length < 2 && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-4">
                    ⚠ 复合行至少需要2个子块才能正常渲染
                </div>
            )}

            {/* Add-after button */}
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
