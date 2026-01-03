import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { SvgPage } from '../SvgPage';
import { PluginMenu } from './PluginMenu';

interface PreviewPanelProps {
    error: string | null;
    svgPages: string[];
    isRendering: boolean;
    activeAnchor: { pageIndex: number; localIndex: number } | null;
    clickAnchor: { pageIndex: number; localIndex: number } | null;
    highlightNonce: number;
    registerPageRef: (pageIndex: number, el: HTMLDivElement | null) => void;
    onBlockClick: (pageIndex: number, localIndex: number) => void;
    onDownloadPdf: () => void;
    previewRef: React.RefObject<HTMLDivElement | null>;
    projectId: string;
    onToggleAiSidebar: () => void;
    isAiSidebarOpen: boolean;
}

export function PreviewPanel({
    error,
    svgPages,
    isRendering,
    activeAnchor,
    clickAnchor,
    highlightNonce,
    registerPageRef,
    onBlockClick,
    onDownloadPdf,
    previewRef,
    projectId,
    onToggleAiSidebar,
    isAiSidebarOpen,
}: PreviewPanelProps) {
    const hasRestoredRef = useRef(false);

    // Reset restored flag when project changes
    useEffect(() => {
        hasRestoredRef.current = false;
    }, [projectId]);

    // Restore scroll position
    useEffect(() => {
        if (!projectId || hasRestoredRef.current) return;
        if (svgPages.length === 0) return;

        const key = `preview_scroll_${projectId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            const top = parseInt(saved, 10);
            if (!isNaN(top) && previewRef.current) {
                if (previewRef.current.scrollHeight >= top) {
                    previewRef.current.scrollTop = top;
                    hasRestoredRef.current = true;
                } else {
                    previewRef.current.scrollTop = top;
                    hasRestoredRef.current = true;
                }
            }
        }
    }, [projectId, svgPages, previewRef]);

    // Save scroll position
    useEffect(() => {
        const el = previewRef.current;
        if (!el || !projectId) return;

        const handleScroll = () => {
            const key = `preview_scroll_${projectId}`;
            localStorage.setItem(key, el.scrollTop.toString());
        };

        // Debounce 200ms
        let timeout: NodeJS.Timeout;
        const debounced = () => {
            clearTimeout(timeout);
            timeout = setTimeout(handleScroll, 200);
        };

        el.addEventListener('scroll', debounced);
        return () => {
            el.removeEventListener('scroll', debounced);
            clearTimeout(timeout);
        };
    }, [projectId, previewRef]);

    return (
        <div className="flex flex-col w-1/2 relative bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm">
            <div className="absolute inset-0 bg-grid-zinc-200/50 dark:bg-grid-zinc-800/50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] pointer-events-none" />

            {/* Header */}
            <div className="px-5 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between gap-3 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl sticky top-0 z-20 supports-[backdrop-filter]:bg-white/60">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 uppercase tracking-wide opacity-80">预览</h2>
                    <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">PDF</span>
                </div>

                <div className="flex items-center gap-2">
                    <PluginMenu
                        onToggleAiSidebar={onToggleAiSidebar}
                        isAiSidebarOpen={isAiSidebarOpen}
                    />

                    <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                    <button
                        onClick={onDownloadPdf}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors shadow-sm hover:shadow-md"
                        title="下载 PDF"
                    >
                        <Download size={16} />
                        <span>导出</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-6 relative z-10" ref={previewRef as any}>
                {error ? (
                    <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl max-w-2xl mx-auto mt-10">
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            渲染错误
                        </p>
                        <pre className="mt-3 text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap font-mono bg-red-100/50 dark:bg-red-950/30 p-3 rounded-lg border border-red-200/50 dark:border-red-800/30">{error}</pre>
                    </div>
                ) : svgPages.length > 0 ? (
                    <div className="flex flex-col items-center gap-8 pb-20">
                        {svgPages.map((svgContent, index) => (
                            <SvgPage
                                key={index}
                                svgContent={svgContent}
                                pageIndex={index}
                                forceVisible={activeAnchor?.pageIndex === index}
                                activeLocalIndex={clickAnchor?.pageIndex === index ? clickAnchor.localIndex : null}
                                highlightNonce={highlightNonce}
                                registerPageRef={registerPageRef}
                                onBlockClick={onBlockClick}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-600 gap-4">
                        {isRendering ? (
                            <>
                                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin text-blue-500" />
                                <p className="text-sm font-medium animate-pulse">正在生成预览...</p>
                            </>
                        ) : (
                            <div className="text-center">
                                <p className="text-sm">暂无预览内容</p>
                                <p className="text-xs mt-1 opacity-70">请在左侧编辑器输入内容</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
