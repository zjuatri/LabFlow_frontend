import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown, FileText, Image as ImageIcon, FileCode } from 'lucide-react';
import { SvgPage } from '../SvgPage';
import { PluginMenu } from './PluginMenu';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

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
    title?: string;
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
    title,
}: PreviewPanelProps) {
    const hasRestoredRef = useRef(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

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

    // Close export menu on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleExportSvg = async () => {
        if (svgPages.length === 0) return;
        const zip = new JSZip();
        svgPages.forEach((svg, index) => {
            zip.file(`page-${index + 1}.svg`, svg);
        });
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `${title || 'export'}-svg.zip`);
        setShowExportMenu(false);
    };

    const handleExportPng = async () => {
        if (svgPages.length === 0) return;
        const zip = new JSZip();

        await Promise.all(svgPages.map(async (svg, index) => {
            return new Promise<void>((resolve) => {
                const img = new Image();
                const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);

                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    // Use a slightly higher scale for better quality
                    const scale = 2;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.scale(scale, scale);
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob((blob) => {
                            if (blob) {
                                zip.file(`page-${index + 1}.png`, blob);
                            }
                            URL.revokeObjectURL(url);
                            resolve();
                        }, 'image/png');
                    } else {
                        URL.revokeObjectURL(url);
                        resolve();
                    }
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.src = url;
            });
        }));

        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `${title || 'export'}-png.zip`);
        setShowExportMenu(false);
    };

    return (
        <div className="flex flex-col w-full h-full relative bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm">
            <div className="absolute inset-0 bg-grid-zinc-200/50 dark:bg-grid-zinc-800/50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] pointer-events-none" />

            {/* Header */}
            <div className="px-5 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between gap-3 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 flex-wrap">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 uppercase tracking-wide opacity-80">预览</h2>
                    <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Multiformat</span>
                </div>

                <div className="flex items-center gap-2">
                    <PluginMenu
                        onToggleAiSidebar={onToggleAiSidebar}
                        isAiSidebarOpen={isAiSidebarOpen}
                    />

                    <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                    <div className="relative" ref={exportMenuRef}>
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors shadow-sm hover:shadow-md"
                            title="导出选项"
                        >
                            <Download size={16} />
                            <span>导出</span>
                            <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                        </button>

                        {showExportMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50">
                                <div className="p-1">
                                    <button
                                        onClick={() => { onDownloadPdf(); setShowExportMenu(false); }}
                                        className="flex items-center gap-3 w-full px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 rounded-lg transition-colors"
                                    >
                                        <FileText size={16} className="text-red-500" />
                                        <span>导出 PDF</span>
                                    </button>
                                    <button
                                        onClick={handleExportSvg}
                                        className="flex items-center gap-3 w-full px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 rounded-lg transition-colors"
                                    >
                                        <FileCode size={16} className="text-orange-500" />
                                        <span>导出 SVG (ZIP)</span>
                                    </button>
                                    <button
                                        onClick={handleExportPng}
                                        className="flex items-center gap-3 w-full px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 rounded-lg transition-colors"
                                    >
                                        <ImageIcon size={16} className="text-blue-500" />
                                        <span>导出 PNG (ZIP)</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
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
