import { useState, useRef, useEffect } from 'react';
import { Sparkles, ChevronDown, MonitorPlay } from 'lucide-react';

interface PluginMenuProps {
    onToggleAiSidebar: () => void;
}

export function PluginMenu({ onToggleAiSidebar }: PluginMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
          border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700
          hover:bg-white/50 dark:hover:bg-zinc-800/50 hover:shadow-sm
          ${isOpen ? 'bg-white dark:bg-zinc-800 shadow-sm border-zinc-200 dark:border-zinc-700' : 'text-zinc-600 dark:text-zinc-400'}
        `}
            >
                <MonitorPlay size={16} />
                <span>插件</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 p-1.5 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-700/50 rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        可用插件
                    </div>
                    <button
                        onClick={() => {
                            onToggleAiSidebar();
                            setIsOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 group"
                    >
                        <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/60 transition-colors">
                            <Sparkles size={16} />
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">AI 助手</span>
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">智能编写与润色</span>
                        </div>
                    </button>
                </div>
            )}
        </div>
    );
}
