import { getDocBySlug } from '@/lib/docs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FolderOpen, FileText } from 'lucide-react';
import Link from 'next/link';

interface DocPageProps {
    params: Promise<{ slug: string[] }>;
}

export default async function DocContentPage({ params }: DocPageProps) {
    const { slug } = await params;
    const slugPath = slug || [];

    const doc = getDocBySlug(slugPath);

    if (!doc) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-4xl mx-auto px-4">
                    <h1 className="text-2xl font-bold mb-4">404 - 文档未找到</h1>
                    <p className="text-zinc-500 mb-4">您可以尝试返回首页查找所需内容</p>
                    <Link href="/docs" className="text-blue-600 hover:underline">返回文档首页</Link>
            </div>
        );
    }

    if (doc.isFolder) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-12">
                <header className="mb-10 pb-10 border-b border-zinc-100 dark:border-zinc-800">
                    <h1 className="text-4xl font-extrabold tracking-tight mb-4">{doc.meta.title}</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-lg">此目录下包含以下文档：</p>
                </header>

                <div className="grid gap-4">
                    {doc.children?.map((child) => (
                        <Link
                            key={child.slug}
                            href={child.path}
                            className="flex items-center gap-3 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-blue-500 transition-all group"
                        >
                            {child.isFolder ? <FolderOpen size={18} className="text-zinc-400 group-hover:text-blue-500" /> : <FileText size={18} className="text-zinc-400 group-hover:text-blue-500" />}
                            <span className="font-medium group-hover:text-blue-600 font-sans">{child.title}</span>
                        </Link>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <header className="mb-10 pb-10 border-b border-zinc-100 dark:border-zinc-800">
                <h1 className="text-4xl font-extrabold tracking-tight mb-4">{doc.meta.title}</h1>
                {doc.meta.description && (
                    <p className="text-zinc-500 dark:text-zinc-400 text-lg">{doc.meta.description}</p>
                )}
            </header>

            <article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:scroll-mt-28">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {doc.content}
                </ReactMarkdown>
            </article>
        </div>
    );
}
