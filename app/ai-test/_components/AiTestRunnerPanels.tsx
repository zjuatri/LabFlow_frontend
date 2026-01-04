'use client';

import { useMemo, useState } from 'react';

export function JsonBlock({ title, value }: { title: string; value: unknown }) {
    const text = useMemo(() => {
        if (value === undefined) return '';
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }, [value]);

    return (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
            </div>
            <pre className="p-4 text-xs overflow-auto max-h-[520px] bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
                {text || '(空)'}
            </pre>
        </div>
    );
}

export function TextPanel({ title, value }: { title: string; value: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
                <button
                    onClick={handleCopy}
                    disabled={!value}
                    className="px-3 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="复制到剪贴板"
                >
                    {copied ? '已复制 ✓' : '复制'}
                </button>
            </div>
            <pre className="p-4 text-xs overflow-auto min-h-[280px] max-h-[70vh] bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap break-words">
                {value || '(空)'}
            </pre>
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PdfContextVisualizer({ context }: { context: any }) {
    const [activeTab, setActiveTab] = useState<'text' | 'images' | 'tables'>('text');

    if (!context) return <div className="text-zinc-500 text-sm">无 PDF 上下文</div>;

    const ocrPages = context.ocr_text_pages || [];
    const images = context.images || [];
    const tables = context.tables || [];

    return (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-950">
            <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">PDF 解析结果内容可视化</div>
                <div className="flex bg-zinc-200 dark:bg-zinc-800 p-0.5 rounded-lg">
                    {(['text', 'images', 'tables'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-1 text-xs rounded-md transition-all ${activeTab === tab
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                }`}
                        >
                            {tab === 'text' ? '文本内容' : tab === 'images' ? '提取图片' : '提取表格'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 min-h-[400px] max-h-[600px] overflow-auto">
                {activeTab === 'text' && (
                    <div className="space-y-4">
                        {ocrPages.length > 0 ? (
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ocrPages.map((p: any, i: number) => (
                                <div key={i} className="space-y-2">
                                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Page {p.page}</div>
                                    <div className="p-3 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800 rounded text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">
                                        {p.text}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-zinc-500 text-center py-10 italic">未发现 OCR 文本内容</div>
                        )}
                    </div>
                )}

                {activeTab === 'images' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {images.length > 0 ? (
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            images.map((img: any, i: number) => (
                                <div key={i} className="space-y-1">
                                    <div className="aspect-[4/3] rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 overflow-hidden relative group">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={img.url}
                                            alt={img.filename}
                                            className="w-full h-full object-contain"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
                                            <a href={img.url} target="_blank" className="bg-white px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 pointer-events-auto">查看原图</a>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-zinc-500 truncate">{img.filename}</div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-full text-zinc-500 text-center py-10 italic">未提取到图片</div>
                        )}
                    </div>
                )}

                {activeTab === 'tables' && (
                    <div className="space-y-6">
                        {tables.length > 0 ? (
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            tables.map((tbl: any, i: number) => (
                                <div key={i} className="space-y-2">
                                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">表格 {i + 1} (Page {tbl.page})</div>
                                    {tbl.csv_preview ? (
                                        <pre className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-[10px] overflow-auto">
                                            {tbl.csv_preview}
                                        </pre>
                                    ) : (
                                        <div className="text-[10px] text-zinc-400">无 CSV 预览</div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-zinc-500 text-center py-10 italic">未提取到表格</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
