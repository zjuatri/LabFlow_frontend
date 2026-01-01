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
