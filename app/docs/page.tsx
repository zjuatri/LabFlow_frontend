'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Book, Calendar } from 'lucide-react';
import { listDocuments, type Document } from '@/lib/api';

export default function DocsPage() {
    const [docs, setDocs] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        listDocuments(true)
            .then(setDocs)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="mb-10">
                <h1 className="text-3xl font-bold tracking-tight mb-2">开发文档</h1>
                <p className="text-zinc-500 dark:text-zinc-400">LabFlow 插件开发与 API 指南。</p>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-32 bg-white dark:bg-zinc-900 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : docs.length === 0 ? (
                <div className="text-center py-20 text-zinc-500">暂无文档发布</div>
            ) : (
                <div className="grid gap-4">
                    {docs.map(doc => (
                        <Link
                            key={doc.id}
                            href={`/docs/${doc.slug}`}
                            className="group block p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500 dark:hover:border-blue-500 transition-all shadow-sm hover:shadow-md"
                        >
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <h2 className="text-xl font-semibold group-hover:text-blue-600 transition-colors">
                                        {doc.title}
                                    </h2>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
                                        {doc.content.slice(0, 150)}...
                                    </p>
                                </div>
                                <Book className="text-zinc-300 dark:text-zinc-700 group-hover:text-blue-500 transition-colors" size={24} />
                            </div>
                            <div className="mt-4 flex items-center gap-4 text-xs text-zinc-400">
                                <div className="flex items-center gap-1">
                                    <Calendar size={12} />
                                    {new Date(doc.updated_at).toLocaleDateString()}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
