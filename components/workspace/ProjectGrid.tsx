import { useState, useRef, useEffect } from 'react';
// import { useRouter } from 'next/navigation';
import {
    FolderOpen
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { Project } from '@/lib/api';
import ProjectCard from './ProjectCard';

export default function ProjectGrid() {
    // const router = useRouter(); // Moved to Card
    const {
        projects,
        loading,
        activeTab,
        selectedIds,
        toggleSelect,
        setError,
        createProject,
        // loadProjects,
        setRenamingProject,
        setDeletingProject,
        viewScale,
        setViewScale
    } = useWorkspaceStore();

    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [copying, setCopying] = useState(false);

    // Zoom handling
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    setViewScale(viewScale + 1);
                } else {
                    setViewScale(viewScale - 1);
                }
            }
        };

        const el = containerRef.current;
        if (el) {
            el.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if (el) el.removeEventListener('wheel', handleWheel);
        }
    }, [viewScale, setViewScale]);

    const handleCopyClick = async (source: Project, e: React.MouseEvent) => {
        e.stopPropagation();
        if (activeTab === 'report') {
            if (activeDropdown === source.id) {
                setActiveDropdown(null);
            } else {
                setActiveDropdown(source.id);
            }
        } else {
            await performDuplicate(source, activeTab);
        }
    };

    const performDuplicate = async (source: Project, type: string) => {
        setCopying(true);
        setActiveDropdown(null);
        try {
            const title = `${source.title} (副本)`;
            await createProject(title, type, source.id);
            // createProject in store already updates list for current tab
        } catch (err) {
            setError(err instanceof Error ? err.message : '复制失败');
        } finally {
            setCopying(false);
        }
    };

    const performCopyToTemplate = async (source: Project) => {
        setCopying(true);
        setActiveDropdown(null);
        try {
            const title = `${source.title} (Template)`;
            await createProject(title, 'template', source.id);
            // Note: This creates a template but we are likely on 'report' tab, so it won't appear in list unless we switch tabs?
            // User stays on report tab usually.
        } catch (err) {
            setError(err instanceof Error ? err.message : '复制失败');
        } finally {
            setCopying(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-400 text-sm">正在加载...</p>
            </div>
        );
    }

    const tabLabel = {
        report: '实验报告',
        cover: '封面',
        template: '模板'
    }[activeTab];

    if (projects.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-zinc-400">
                    <FolderOpen size={32} />
                </div>
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-1">暂无项目</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-xs text-center">
                    点击上方按钮创建一个新的{tabLabel}。
                </p>
                <button
                    onClick={() => useWorkspaceStore.getState().setShowCreateModal(true)}
                    className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all shadow-sm"
                >
                    新建{tabLabel}
                </button>
            </div>
        );
    }

    const gridClasses = (() => {
        switch (viewScale) {
            case 0: return 'grid-cols-1 gap-2'; // List
            case 1: return 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'; // Small Grid
            case 2: return 'grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'; // Medium (Default)
            case 3: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'; // Large Grid
            case 4: return 'grid-cols-1 gap-8 max-w-4xl mx-auto'; // Preview Mode (Single column for better visibility)
            default: return 'grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4';
        }
    })();

    return (
        <div ref={containerRef} className={`grid ${gridClasses} transition-all duration-300 pb-20`}>
            {projects.map((p) => (
                <ProjectCard
                    key={p.id}
                    project={p}
                    viewScale={viewScale}
                    isSelected={selectedIds.has(p.id)}
                    activeTab={activeTab}
                    onToggleSelect={toggleSelect}
                    onCopy={handleCopyClick}
                    onRename={setRenamingProject}
                    onDelete={setDeletingProject}
                    isCopying={copying}
                    activeDropdownId={activeDropdown}
                    setActiveDropdownId={setActiveDropdown}
                    performDuplicate={performDuplicate}
                    performCopyToTemplate={performCopyToTemplate}
                />
            ))}
        </div>
    );
}
