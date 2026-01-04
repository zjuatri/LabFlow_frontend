'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { NavItem, getSidebarStructure } from '@/lib/api';

// Recursive Tree Item Component
function SidebarItem({ item, depth = 0 }: { item: NavItem; depth?: number }) {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(true); // Default open for now

    const hasChildren = item.items && item.items.length > 0;
    const isActive = item.url ? pathname === item.url : false;

    // Auto-expand if child is active
    // This simplistic check might need optimization but works for basic cases
    // Actually, client-side only auto-expand is tricky without context, 
    // but "default open" covers most users' needs.

    return (
        <div className="select-none">
            <div
                className={`
          flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors cursor-pointer
          ${isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}
          ${depth > 0 ? 'ml-4' : ''}
        `}
                onClick={() => {
                    if (hasChildren && !item.url) {
                        // Only toggle if it's a folder (no URL)
                        setIsOpen(!isOpen);
                    }
                }}
            >
                {hasChildren ? (
                    <button onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} className="p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                ) : (
                    <span className="w-4" /> // Spacer
                )}

                {item.url ? (
                    <Link href={item.url} className="flex-1 truncate">
                        {item.title}
                    </Link>
                ) : (
                    <span className="flex-1 truncate font-medium text-zinc-900 dark:text-zinc-200">{item.title}</span>
                )}
            </div>

            {hasChildren && isOpen && (
                <div className="mt-0.5 border-l border-zinc-200 dark:border-zinc-800 ml-4 pl-0">
                    {item.items!.map((child, idx) => (
                        <SidebarItem key={idx} item={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DocSidebar() {
    const [structure, setStructure] = useState<NavItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getSidebarStructure()
            .then(setStructure)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-4 text-xs text-zinc-400">Loading nav...</div>;

    if (structure.length === 0) {
        return (
            <div className="p-4 text-sm text-zinc-500">
                No navigation structure.
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
