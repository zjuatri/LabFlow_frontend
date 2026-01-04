import { useState, useRef, useEffect } from 'react';
import {
    LayoutGrid, List as ListIcon, ChevronDown, Check
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

export default function ViewOptions() {
    const { viewScale, setViewScale } = useWorkspaceStore();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const isList = viewScale === 0;

    const handleSetView = (scale: number) => {
        setViewScale(scale);
        // setIsOpen(false); // Keep open to allow easier sliding?
    };

    const scaleLabels = ['列表', '小图标', '中等图标', '大图标', '超大图标(预览)'];

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border min-w-[100px]
                    ${isOpen
                        ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800'}
                `}
            >
                {isList ? <ListIcon size={16} /> : <LayoutGrid size={16} />}
                <span>{isList ? '列表' : '网格'}</span>
                <ChevronDown size={14} className={`ml-auto transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 min-w-[320px] w-[320px] md:w-[384px] bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-4 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right" style={{ width: '320px' }}>

                    {/* Mode Selection */}
                    <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1.5 rounded-lg mb-4 gap-1">
                        <button
                            onClick={() => handleSetView(0)}
                            className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 text-sm font-medium rounded-lg transition-all ${isList
                                ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100'
                                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                                }`}
                        >
                            <ListIcon size={16} />
                            列表视图
                        </button>
                        <button
                            onClick={() => handleSetView(2)} // Default to Medium if switching to Grid
                            className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 text-sm font-medium rounded-lg transition-all ${!isList
                                ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100'
                                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                                }`}
                        >
                            <LayoutGrid size={16} />
                            网格视图
                        </button>
                    </div>

                    {/* Scale Slider (Only for Grid) */}
                    <div className={`px-3 py-3 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg ${isList ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">图标大小</span>
                            <span className="text-sm text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded">
                                {isList ? '列表' : scaleLabels[viewScale]}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="4"
                            step="1"
                            value={isList ? 1 : viewScale}
                            onChange={(e) => handleSetView(parseInt(e.target.value))}
                            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600 mb-3"
                        />
                        <div className="flex justify-between px-0.5">
                            <div className="w-0.5 h-2.5 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                            <div className="w-0.5 h-2.5 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                            <div className="w-0.5 h-2.5 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                            <div className="w-0.5 h-2.5 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2 px-1">快速选择</p>
                        <div className="space-y-1">
                            {[1, 2, 3, 4].map(scale => (
                                <button
                                    key={scale}
                                    onClick={() => handleSetView(scale)}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${viewScale === scale ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}
                                >
                                    <span>{scaleLabels[scale]}</span>
                                    {viewScale === scale && <Check size={16} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
