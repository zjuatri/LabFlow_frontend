'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Clock } from 'lucide-react';
import SiteHeader from '@/components/common/SiteHeader';
import { getDocument, type Document } from '@/lib/api';

export default function DocContentPage() {
    const params = useParams();
    const slug = params.slug as string;


    const [doc, setDoc] = useState<Document | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!slug) return;

        getDocument(slug)
            .then(setDoc)
            .catch(() => setError('文档未找到'))
            .finally(() => setLoading(false));
    }, [slug]);

    if (loading) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">Loading...</div>;

    if (error || !doc) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
                <SiteHeader />
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <h1 className="text-2xl font-bold mb-4">404 - Document Not Found</h1>
                    <Link href="/docs" className="text-blue-600 hover:underline">Return to Docs</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <header className="mb-10 pb-10 border-b border-zinc-100 dark:border-zinc-800">
                <h1 className="text-4xl font-extrabold tracking-tight mb-4">{doc.title}</h1>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                    <Clock size={16} />
                    Last updated on {new Date(doc.updated_at).toLocaleDateString()}
                </div>
            </header>

            <article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:scroll-mt-28">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {doc.content}
                </ReactMarkdown>
            </article>
        </div>
    );
}

