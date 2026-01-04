'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Copy, AlertTriangle } from 'lucide-react';
import SiteHeader from '@/components/common/SiteHeader';
import { useAuth } from '@/components/auth/AuthProvider';
import { getSidebarStructure, updateSidebarStructure, listDocuments, type NavItem, type Document } from '@/lib/api';

export default function StructureEditorPage() {
    const router = useRouter();
    const { token, isLoading: isAuthLoading, isAdmin } = useAuth();

    const [jsonContent, setJsonContent] = useState('');
    const [docs, setDocs] = useState<Document[]>([]);
    // const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (token && isAdmin) {
            Promise.all([
                getSidebarStructure(),
                listDocuments(false)
            ]).then(([structure, docsData]) => {
                setJsonContent(JSON.stringify(structure, null, 2));
                setDocs(docsData);
            }).catch(e => {
                console.error(e);
                setError('Failed to load data');
            }).finally(() => { /* val */ });
        }
    }, [token, isAdmin]);

    const handleSave = async () => {
        try {
            setSaving(true);
            setError('');
            // Validate JSON
            let parsed: NavItem[];
            try {
                parsed = JSON.parse(jsonContent);
                if (!Array.isArray(parsed)) throw new Error('Root must be an array');
            } catch {
                setError('Invalid JSON format');
                setSaving(false);
                return;
            }

            await updateSidebarStructure(parsed);
            alert('Saved successfully!');
        } catch (e) {
            console.error(e);
            setError('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const copySnippet = (doc: Document) => {
        const snippet = `{\n  "title": "${doc.title}",\n  "url": "/docs/${doc.slug}"\n}`;
        navigator.clipboard.writeText(snippet);
        alert(`Copied snippet for "${doc.title}"`);
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
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link
                            href="/manage/docs"
                            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 mb-2 transition-colors"
                        >
                            <ArrowLeft size={16} />
                            Back to Docs List
                        </Link>
                        <h1 className="text-3xl font-bold tracking-tight">Navigation Structure</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                            Edit the sidebar JSON tree manually. Copy snippets from the right.
                        </p>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm shadow-blue-500/20 disabled:opacity-50 transition-colors"
                    >
                        <Save size={18} />
                        {saving ? 'Saving...' : 'Save Structure'}
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 flex items-center gap-2">
                        <AlertTriangle size={18} />
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* JSON Editor */}
                    <div className="lg:col-span-2">
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[70vh]">
                            <div className="border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 text-xs font-mono text-zinc-500">
                                sidebar.json
                            </div>
                            <textarea
                                value={jsonContent}
                                onChange={e => setJsonContent(e.target.value)}
                                className="flex-1 w-full p-4 font-mono text-sm bg-transparent outline-none resize-none"
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    {/* Available Docs Helper */}
                    <div className="lg:col-span-1">
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden h-[70vh] flex flex-col">
                            <div className="border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 font-medium text-sm">
                                Available Documents
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                {docs.map(doc => (
                                    <div key={doc.id} className="p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-800 bg-zinc-50 dark:bg-zinc-950/30 group">
                                        <div className="flex items-start justify-between mb-1">
                                            <div className="font-medium text-sm truncate pr-2">{doc.title}</div>
                                            <button
                                                onClick={() => copySnippet(doc)}
                                                className="text-zinc-400 hover:text-blue-600 p-1 bg-white dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800 shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                                title="Copy JSON Snippet"
                                            >
                                                <Copy size={12} />
                                            </button>
                                        </div>
                                        <div className="text-xs text-zinc-400 font-mono truncate">/docs/{doc.slug}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
