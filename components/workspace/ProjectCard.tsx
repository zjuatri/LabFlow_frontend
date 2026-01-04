import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    FileText, Calendar, Copy, Pencil, Trash2
} from 'lucide-react';
import { Project } from '@/lib/api';
import ProjectPreview from './ProjectPreview';

interface ProjectCardProps {
    project: Project;
    viewScale: number;
    isSelected: boolean;
    activeTab: string;
    onToggleSelect: (id: string) => void;
    onCopy: (p: Project, e: React.MouseEvent) => void;
    onRename: (p: Project) => void;
    onDelete: (p: Project) => void;
    isCopying: boolean;
    activeDropdownId: string | null;
    setActiveDropdownId: (id: string | null) => void;
    performDuplicate: (p: Project, type: string) => void;
    performCopyToTemplate: (p: Project) => void;
}

export default function ProjectCard({
    project: p,
    viewScale,
    isSelected,
    activeTab,
    onToggleSelect,
    onCopy,
    onRename,
    onDelete,
    isCopying,
    activeDropdownId,
    setActiveDropdownId,
    performDuplicate,
    performCopyToTemplate
}: ProjectCardProps) {
    const router = useRouter();

    // Scale 0: List View
    // Scale 1: Small Grid (Icon only)
    // Scale 2: Medium Grid (Icon + Details) - Default-ish
    // Scale 3: Large Grid (Icon + More Details)
    // Scale 4: Preview Mode (Preview + Meta)

    const isList = viewScale === 0;
    const isPreview = viewScale === 4;

    return (
        <div
            className={`
                group relative bg-white dark:bg-zinc-900/50 border rounded-xl transition-all duration-200
                hover:shadow-md hover:border-blue-500/30
                ${isSelected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/30 dark:bg-blue-900/10' : 'border-zinc-200 dark:border-zinc-800'}
                ${isList ? 'flex items-center p-2 gap-4' : 'flex flex-col'}
            `}
        >
            {/* Card Content (Clickable) */}
            <div
                onClick={() => router.push(`/projects/${p.id}`)}
                className={`cursor-pointer ${isList ? 'flex-1 flex items-center gap-4' : 'p-3.5 flex flex-col h-full'}`}
            >
                {/* Visual / Icon Area */}
                {isPreview ? (
                    <div className="w-full aspect-[210/297] mb-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 relative shadow-sm group-hover:shadow-md transition-all">
                        <ProjectPreview code={p.typst_code} className="w-full h-full" />

                        {/* Selecting Overlay for Preview Mode */}
                        <div
                            onClick={(e) => { e.stopPropagation(); onToggleSelect(p.id); }}
                            className={`absolute top-2 right-2 p-1.5 rounded-full cursor-pointer transition-all z-10 ${isSelected ? 'bg-blue-500 text-white opacity-100' : 'bg-white/90 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-zinc-600 shadow-sm'}`}
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'border-transparent' : 'border-current'}`}>
                                {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className={`
                        ${isList ? 'flex-shrink-0' : 'flex items-start justify-between gap-3 mb-3'}
                    `}>
                        <div className={`p-2.5 rounded-lg ${isSelected ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-900/20 dark:group-hover:text-blue-400'} transition-colors`}>
                            <FileText size={isList ? 20 : (viewScale >= 3 ? 32 : 20)} />
                        </div>

                        {/* Checkbox (Absolute/Relative based on layout) */}
                        {!isList && (
                            <div
                                onClick={(e) => { e.stopPropagation(); onToggleSelect(p.id); }}
                                className="p-2 -mr-2 -mt-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900'}`}>
                                    {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Meta Info */}
                <div className={`${isList ? 'flex-1 min-w-0 grid grid-cols-12 gap-4 items-center' : 'w-full'}`}>
                    <h3 className={`font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-sm ${isList ? 'col-span-4' : 'mb-2'}`}>
                        {p.title}
                    </h3>

                    {isList && (
                        <div className="col-span-3 text-xs text-zinc-500">
                            {new Date(p.updated_at).toLocaleDateString()}
                        </div>
                    )}
                </div>

                {/* Footer / Actions */}
                <div className={`
                    ${isList ? 'flex items-center gap-2 opacity-0 group-hover:opacity-100' : 'mt-auto pt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/50'}
                `}>
                    {!isList && (
                        <div className="flex items-center gap-1.5">
                            <Calendar size={12} />
                            {new Date(p.updated_at).toLocaleDateString()}
                        </div>
                    )}

                    <div className="flex items-center gap-1 relative ml-auto">
                        <button
                            onClick={(e) => onCopy(p, e)}
                            disabled={isCopying}
                            className={`p-1.5 rounded-md transition-colors ${activeDropdownId === p.id ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'}`}
                            title={activeTab === 'report' ? "复制" : "创建副本"}
                        >
                            <Copy size={14} />
                        </button>

                        {/* Dropdown Menu */}
                        {activeDropdownId === p.id && (
                            <>
                                <div
                                    className="fixed inset-0 z-40 cursor-default"
                                    onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); }}
                                />
                                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 p-1 flex flex-col gap-0.5">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); performDuplicate(p, 'report'); }}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                                    >
                                        <Copy size={14} className="text-zinc-400" />
                                        <span>创建副本</span>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); performCopyToTemplate(p); }}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                                    >
                                        <FileText size={14} className="text-zinc-400" />
                                        <span>存为模板</span>
                                    </button>
                                </div>
                            </>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); onRename(p); }}
                            className="p-1.5 rounded-md hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
                            title="重命名"
                        >
                            <Pencil size={14} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                            className="p-1.5 -mr-1.5 rounded-md hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-colors"
                            title="删除项目"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* List Selection Overlay (Click anywhere to select if needed, but we have specific handlers) */}
        </div>
    );
}
