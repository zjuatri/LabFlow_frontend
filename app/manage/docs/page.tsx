'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Edit2, Trash2, ArrowLeft, FileText, Globe, EyeOff } from 'lucide-react';
import SiteHeader from '@/components/common/SiteHeader';
import { useAuth } from '@/components/auth/AuthProvider';
import { listDocuments, deleteDocument, type Document } from '@/lib/api';

export default function DocsManagePage() {
    const router = useRouter();
    const { token, isLoading: isAuthLoading, isAdmin } = useAuth();
    const [docs, setDocs] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchDocs = async () => {
        try {
            setLoading(true);
            // Fetch all docs (publishedOnly=false)
            const data = await listDocuments(false);
            setDocs(data);
        } catch (error) {
            console.error('Failed to fetch docs', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token && isAdmin) {
            fetchDocs();
        }
    }, [token, isAdmin]);

    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除此文档吗？')) return;
        try {
            await deleteDocument(id);
            setDocs(prev => prev.filter(d => d.id !== id));
        } catch (error) {
            console.error(error);
            alert('删除失败');
        }
    };

    if (isAuthLoading) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" />;
    if (!token || !isAdmin) {
        if (!token) router.push('/login');
        else router.push('/');
        return null;
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
            <SiteHeader />

            <main className="max-w-7xl mx-auto px-4 pt-28 pb-20">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                    <div>
                        <Link
                            href="/manage"
                            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 mb-4 transition-colors"
                        >
                            <ArrowLeft size={16} />
                            返回管理面板
                        </Link>
                        <h1 className="text-3xl font-bold tracking-tight">文档管理</h1>
                    </div>

                    <Link
                        href="/manage/docs/structure"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm shadow-blue-500/20"
                    >
                        <Edit2 size={16} />
                        管理导航与文档
                    </Link>
                    {/* <Link
                        href="/manage/docs/create"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm shadow-blue-500/20"
                    >
                        <Plus size={18} />
                        新建文档
                    </Link> */}
                </div>

                {loading ? (
                    <div className="text-center py-20 text-zinc-500">加载中...</div>
                ) : docs.length === 0 ? (
                    <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <FileText className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" size={48} />
                        <h3 className="text-lg font-medium">暂无文档</h3>
                        <p className="text-zinc-500 mt-1">点击右上角新建一篇文档</p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-100 dark:border-zinc-800">
                                <tr>
                                    <th className="px-6 py-4 font-medium text-zinc-500">标题 / 路径</th>
                                    <th className="px-6 py-4 font-medium text-zinc-500">状态</th>
                                    <th className="px-6 py-4 font-medium text-zinc-500">最后更新</th>
                                    <th className="px-6 py-4 font-medium text-zinc-500 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {docs.map(doc => (
                                    <tr key={doc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">{doc.title}</div>
                                            <div className="text-xs text-zinc-500 font-mono mt-1">{doc.slug}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {doc.is_published ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                    <Globe size={12} /> 已发布
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                                    <EyeOff size={12} /> 草稿
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-500">
                                            {new Date(doc.updated_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                            <Link
                                                href={`/manage/docs/edit/${doc.id}`}
                                                className="p-2 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                            >
                                                <Edit2 size={16} />
                                            </Link>
                                            <button
                                                onClick={() => handleDelete(doc.id)}
                                                className="p-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
