'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Copy, AlertTriangle, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, Code, Folder, FileText, FolderPlus, FilePlus } from 'lucide-react';
import SiteHeader from '@/components/common/SiteHeader';
import { useAuth } from '@/components/auth/AuthProvider';
import { getSidebarStructure, updateSidebarStructure, listDocuments, createDocument, type NavItem, type Document } from '@/lib/api';

// --- Visual Editor Components ---

interface NavItemEditorProps {
    item: NavItem;
    path: number[];
    level: number;
    onUpdate: (path: number[], newItem: NavItem) => void;
    onDelete: (path: number[]) => void;
    onAddFolder: (path: number[]) => void;
    onCreateDocument: (path: number[]) => void;
    onMove: (path: number[], direction: 'up' | 'down') => void;
}

function NavItemEditor({ item, path, level, onUpdate, onDelete, onAddFolder, onCreateDocument, onMove }: NavItemEditorProps) {
    const [isOpen, setIsOpen] = useState(true);

    const hasChildren = item.items && item.items.length > 0;
    const isFolder = hasChildren || !item.url;
    const isDocument = !!item.url;

    return (
        <div className="mb-0">
            {/* Item Header */}
            <div
                style={{ paddingLeft: `${level * 24}px` }}
                className="group flex items-center gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900/50 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-all mb-1"
            >
                {/* Expand/Collapse Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex-shrink-0 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors w-6 flex items-center justify-center"
                >
                    {hasChildren ? (
                        isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />
                    ) : (
                        <div className="w-0" />
                    )}
                </button>

                {/* Icon */}
                <div className="flex-shrink-0 text-zinc-400 w-5 flex items-center justify-center">
                    {isFolder ? <Folder size={16} /> : <FileText size={16} />}
                </div>

                {/* Title Input */}
                <input
                    type="text"
                    value={item.title}
                    onChange={(e) => onUpdate(path, { ...item, title: e.target.value })}
                    placeholder={isFolder ? "文件夹名称" : "项目标题"}
                    className="flex-1 min-w-0 px-2 py-1 bg-transparent border-0 border-b border-zinc-200 dark:border-zinc-700 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-400"
                />

                {/* URL Input (Document) */}
                {isDocument && (
                    <input
                        type="text"
                        value={item.url || ''}
                        onChange={(e) => onUpdate(path, { ...item, url: e.target.value })}
                        placeholder="URL"
                        className="flex-shrink-0 w-28 px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono focus:border-blue-500 outline-none placeholder-zinc-400"
                        readOnly
                        title="文档路径由系统自动生成"
                    />
                )}

                {/* Action Buttons */}
                <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Move Up/Down */}
                    <button
                        onClick={() => onMove(path, 'up')}
                        className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="上移"
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        onClick={() => onMove(path, 'down')}
                        className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="下移"
                    >
                        <ChevronDown size={14} />
                    </button>

                    {/* Add Subfolder */}
                    <button
                        onClick={() => onAddFolder(path)}
                        className="p-1.5 text-zinc-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                        title="添加子文件夹"
                    >
                        <FolderPlus size={14} />
                    </button>

                    {/* Create Document */}
                    <button
                        onClick={() => onCreateDocument(path)}
                        className="p-1.5 text-zinc-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                        title="在此文件夹下新建文档"
                    >
                        <FilePlus size={14} />
                    </button>

                    {/* Delete */}
                    <button
                        onClick={() => onDelete(path)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="删除"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Children */}
            {hasChildren && isOpen && (
                <div className="space-y-0">
                    {item.items!.map((child, index) => (
                        <NavItemEditor
                            key={index}
                            item={child}
                            path={[...path, index]}
                            level={level + 1}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            onAddFolder={onAddFolder}
                            onCreateDocument={onCreateDocument}
                            onMove={onMove}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// --- Main Page Component ---

export default function StructureEditorPage() {
    const router = useRouter();
    const { token, isLoading: isAuthLoading, isAdmin } = useAuth();

    const [structure, setStructure] = useState<NavItem[]>([]);
    const [docs, setDocs] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [isJsonMode, setIsJsonMode] = useState(false);
    const [jsonContent, setJsonContent] = useState('');

    useEffect(() => {
        if (token && isAdmin) {
            Promise.all([
                getSidebarStructure(),
                listDocuments(false)
            ]).then(([structData, docsData]) => {
                setStructure(structData);
                setJsonContent(JSON.stringify(structData, null, 2));
                setDocs(docsData);
            }).catch(e => {
                console.error(e);
                setError('加载数据失败');
            }).finally(() => { setLoading(false); });
        }
    }, [token, isAdmin]);

    // Construct a new tree based on path updates
    const updateTree = (currentStructure: NavItem[], path: number[], action: 'update' | 'delete' | 'addFolder' | 'createDocument' | 'move', payload?: NavItem | 'up' | 'down' | { url: string; title: string }): NavItem[] => {
        const newStructure = [...currentStructure];
        const index = path[0];

        if (path.length === 1) {
            // Direct child of current level
            if (action === 'update') {
                newStructure[index] = payload as NavItem;
            } else if (action === 'delete') {
                newStructure.splice(index, 1);
            } else if (action === 'addFolder') {
                if (!newStructure[index].items) newStructure[index].items = [];
                newStructure[index].items!.push({ title: '新文件夹', url: '', items: [] });
            } else if (action === 'createDocument') {
                const doc = payload as { url: string; title: string };
                if (!newStructure[index].items) newStructure[index].items = [];
                newStructure[index].items!.push({ title: doc.title, url: doc.url });
            } else if (action === 'move') {
                const direction = payload;
                if (direction === 'up' && index > 0) {
                    [newStructure[index], newStructure[index - 1]] = [newStructure[index - 1], newStructure[index]];
                } else if (direction === 'down' && index < newStructure.length - 1) {
                    [newStructure[index], newStructure[index + 1]] = [newStructure[index + 1], newStructure[index]];
                }
            }
            return newStructure;
        } else {
            // Recurse down
            if (newStructure[index].items) {
                newStructure[index].items = updateTree(newStructure[index].items!, path.slice(1), action, payload);
            }
            return newStructure;
        }
    };

    const handleUpdate = (path: number[], newItem: NavItem) => {
        const newStruct = updateTree(structure, path, 'update', newItem);
        setStructure(newStruct);
        setJsonContent(JSON.stringify(newStruct, null, 2));
    };

    const handleDelete = (path: number[]) => {
        if (!confirm('确定删除此项及其子项吗？')) return;
        const newStruct = updateTree(structure, path, 'delete');
        setStructure(newStruct);
        setJsonContent(JSON.stringify(newStruct, null, 2));
    };

    const handleAddFolder = (path: number[]) => {
        const newStruct = updateTree(structure, path, 'addFolder');
        setStructure(newStruct);
        setJsonContent(JSON.stringify(newStruct, null, 2));
    };

    const handleCreateDocument = async (path: number[]) => {
        const title = prompt('请输入文档标题:');
        if (!title) return;

        try {
            setSaving(true);
            // 1. Create the document
            const slug = `doc-${Date.now()}`; // Simple slug generation, backend might override or we can improve
            const newDoc = await createDocument({
                title,
                slug,
                content: '',
                is_published: true
            });

            // 2. Add to structure
            const url = `/docs/${newDoc.slug}`;
            const newStruct = updateTree(structure, path, 'createDocument', { url, title: newDoc.title });
            setStructure(newStruct);
            setJsonContent(JSON.stringify(newStruct, null, 2));

            // 3. Save structure immediately to bind them
            await updateSidebarStructure(newStruct);
            
            // 4. Refresh docs list (optional, but good for consistency)
            const updatedDocs = await listDocuments(false);
            setDocs(updatedDocs);

            alert('文档创建成功！');
        } catch (e) {
            console.error(e);
            alert('创建文档失败');
        } finally {
            setSaving(false);
        }
    };

    const handleMove = (path: number[], direction: 'up' | 'down') => {
        const newStruct = updateTree(structure, path, 'move', direction);
        setStructure(newStruct);
        setJsonContent(JSON.stringify(newStruct, null, 2));
    };

    const handleAddRoot = () => {
        const newStruct = [...structure, { title: '新文件夹', url: '', items: [] }];
        setStructure(newStruct);
        setJsonContent(JSON.stringify(newStruct, null, 2));
    };

    const handleAddRootDocument = (url: string, title: string) => {
        const newStruct = [...structure, { title, url }];
        setStructure(newStruct);
        setJsonContent(JSON.stringify(newStruct, null, 2));
    };

    const handleJsonChange = (val: string) => {
        setJsonContent(val);
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
                setStructure(parsed);
                setError('');
            }
        } catch {
            // Don't update structure if invalid JSON, just let user type
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError('');

            // If in JSON mode, validate final content
            let finalStructure = structure;
            if (isJsonMode) {
                try {
                    finalStructure = JSON.parse(jsonContent);
                    if (!Array.isArray(finalStructure)) throw new Error('Root must be an array');
                } catch {
                    setError('JSON 格式错误');
                    setSaving(false);
                    return;
                }
            }

            await updateSidebarStructure(finalStructure);
            alert('保存成功！');
        } catch (e: any) {
            console.error('Save failed:', e);
            let msg = e.message || '保存失败';
            try {
                if (msg.startsWith('[') || msg.startsWith('{')) {
                    msg = `保存失败: ${msg}`;
                }
            } catch { }
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    if (isAuthLoading || loading) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center text-zinc-500">加载中...</div>;

    if (!token || !isAdmin) {
        if (!token) router.push('/login');
        else router.push('/');
        return null;
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
            <SiteHeader />

            <main className="max-w-6xl mx-auto px-4 pt-28 pb-20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                        <Link
                            href="/manage/docs"
                            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 mb-2 transition-colors"
                        >
                            <ArrowLeft size={16} />
                            返回文档列表
                        </Link>
                        <h1 className="text-3xl font-bold tracking-tight">导航结构管理</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                            配置侧边栏菜单结构。支持多级嵌套，可以添加文件夹和文档。
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsJsonMode(!isJsonMode)}
                            className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-medium transition-colors ${isJsonMode ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'}`}
                        >
                            <Code size={18} />
                            {isJsonMode ? '可视化' : 'JSON'}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm shadow-blue-500/20 disabled:opacity-50 transition-colors"
                        >
                            <Save size={18} />
                            {saving ? '保存中...' : '保存'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 flex items-center gap-2">
                        <AlertTriangle size={18} />
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Main Editor Area */}
                    <div className="lg:col-span-3">
                        {isJsonMode ? (
                            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[60vh]">
                                <div className="border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 text-xs font-mono text-zinc-500">
                                    sidebar.json
                                </div>
                                <textarea
                                    value={jsonContent}
                                    onChange={e => handleJsonChange(e.target.value)}
                                    className="flex-1 w-full p-4 font-mono text-sm bg-transparent outline-none resize-none text-zinc-700 dark:text-zinc-300"
                                    spellCheck={false}
                                />
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-4 min-h-[60vh]">
                                {structure.length === 0 ? (
                                    <div className="text-center py-12 text-zinc-500">
                                        <Folder size={48} className="mx-auto mb-4 text-zinc-400" />
                                        <p>暂无导航项，点击下方添加根节点</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {structure.map((item, index) => (
                                            <NavItemEditor
                                                key={index}
                                                item={item}
                                                path={[index]}
                                                level={0}
                                                onUpdate={handleUpdate}
                                                onDelete={handleDelete}
                                                onAddFolder={handleAddFolder}
                                                onCreateDocument={handleCreateDocument}
                                                onMove={handleMove}
                                            />
                                        ))}
                                    </div>
                                )}

                                <button
                                    onClick={handleAddRoot}
                                    className="mt-4 w-full py-3 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center gap-2 text-zinc-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all font-medium"
                                >
                                    <Plus size={20} />
                                    添加根文件夹
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Sidebar - Documents Helper */}
                    <div className="lg:col-span-1">
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden h-[60vh] flex flex-col sticky top-28">
                            <div className="border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 font-medium text-sm flex items-center gap-2">
                                <FileText size={16} />
                                已有文档 (参考)
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {docs.length === 0 ? (
                                    <div className="text-center py-8 text-zinc-500 text-sm">
                                        <FileText size={32} className="mx-auto mb-2 text-zinc-400" />
                                        <p>暂无文档</p>
                                    </div>
                                ) : (
                                    docs.map(doc => (
                                        <div
                                            key={doc.id}
                                            className="p-2 rounded-lg border border-zinc-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-800 bg-zinc-50 dark:bg-zinc-950/30 group transition-all hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer"
                                            onClick={() => {
                                                navigator.clipboard.writeText(`/docs/${doc.slug}`);
                                            }}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="font-medium text-xs truncate text-zinc-700 dark:text-zinc-200 flex-1">
                                                    {doc.title}
                                                </div>
                                                <Copy size={12} className="text-zinc-400 group-hover:text-blue-500 flex-shrink-0 mt-0.5" />
                                            </div>
                                            <div className="text-xs text-zinc-400 font-mono truncate">/docs/{doc.slug}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tips Section */}
                <div className="mt-8 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                    <p className="text-sm text-blue-900 dark:text-blue-300">
                        <strong>💡 使用提示：</strong>
                    </p>
                    <ul className="text-sm text-blue-900 dark:text-blue-300 mt-2 space-y-1 ml-4 list-disc">
                        <li>将文件夹名称保留为空的 URL 可以创建文件夹，有 URL 的项目是文档</li>
                        <li>使用 <strong>FolderPlus 图标</strong> 可以在任何项目下添加子文件夹</li>
                        <li>使用 <strong>FilePlus 图标</strong> 可以在文件夹下直接创建新文档</li>
                        <li>文档创建后会自动添加到结构中并保存</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}
