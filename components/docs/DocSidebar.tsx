'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react';

// DocNode type matching lib/docs.ts
interface DocNode {
    title: string;
    slug: string;
    path: string;
    isFolder: boolean;
    children?: DocNode[];
    order?: number;
}

// Recursive Tree Item Component
function SidebarItem({ item, depth = 0 }: { item: DocNode; depth?: number }) {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(true); // Default open

    const hasChildren = item.children && item.children.length > 0;
    const isActive = pathname === item.path;
    const isChildActive = item.children?.some(child =>
        pathname === child.path || pathname.startsWith(child.path + '/')
    );

    // Auto-expand if child is active
    useEffect(() => {
        if (isChildActive) {
            const timer = setTimeout(() => setIsOpen(true), 0);
            return () => clearTimeout(timer);
        }
    }, [isChildActive]);

    const Icon = item.isFolder ? Folder : FileText;

    return (
        <div className="select-none">
            <div
                className={`
                    flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors cursor-pointer
                    ${isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}
                    ${depth > 0 ? 'ml-4' : ''}
                `}
                onClick={() => {
                    if (hasChildren && !item.path) {
                        setIsOpen(!isOpen);
                    }
                }}
            >
                {hasChildren ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                        className="p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
                    >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                ) : (
                    <span className="w-5" /> // Spacer
                )}

                <Icon size={14} className="text-zinc-400" />

                <Link href={item.path} className="flex-1 truncate text-sm">
                    {item.title}
                </Link>
            </div>

            {hasChildren && isOpen && (
                <div className="mt-0.5 border-l border-zinc-200 dark:border-zinc-800 ml-4 pl-0">
                    {item.children!.map((child, idx) => (
                        <SidebarItem key={idx} item={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DocSidebar() {
    const [structure, setStructure] = useState<DocNode[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch the doc tree from API route (server-side file scanning)
        fetch('/api/docs/tree')
            .then(res => res.json())
            .then(setStructure)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-4 text-xs text-zinc-400">加载导航中...</div>;

    if (structure.length === 0) {
        return (
            <div className="p-4 text-sm text-zinc-500">
                暂无文档导航
            </div>
        )
    }

    return (
        <nav className="p-4 space-y-1">
            {structure.map((item, idx) => (
                <SidebarItem key={idx} item={item} />
            ))}
        </nav>
    );
}
