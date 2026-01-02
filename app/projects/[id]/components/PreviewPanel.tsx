import { Download } from 'lucide-react';
import { SvgPage } from '../SvgPage';

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
}: PreviewPanelProps) {
    return (
        <div className="flex flex-col w-1/2">
            <div className="px-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">预览</h2>
                <button
                    onClick={onDownloadPdf}
                    className="p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="下载 PDF"
                >
                    <Download size={16} />
                </button>
            </div>
            <div className="flex-1 overflow-auto bg-zinc-200 dark:bg-zinc-900 p-4 relative" ref={previewRef as any}>
                {error ? (
                    <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-700 rounded">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-300">Error:</p>
                        <pre className="mt-2 text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap">{error}</pre>
                    </div>
                ) : svgPages.length > 0 ? (
                    <div className="flex flex-col items-center gap-6">
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
                    <div className="flex items-center justify-center h-full text-zinc-500 dark:text-zinc-400">
                        {isRendering ? '正在渲染...' : '预览内容将在此显示'}
                    </div>
                )}
            </div>
        </div>
    );
}
