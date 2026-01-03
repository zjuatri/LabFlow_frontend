import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

export default function WorkspaceTabs() {
    const { activeTab, setActiveTab } = useWorkspaceStore();

    return (
        <div className="flex items-center gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
            <button
                onClick={() => setActiveTab('report')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'report' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
                实验报告
            </button>
            <button
                onClick={() => setActiveTab('cover')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'cover' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
                封面
            </button>
            <button
                onClick={() => setActiveTab('template')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'template' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
                模板
            </button>
        </div>
    );
}
