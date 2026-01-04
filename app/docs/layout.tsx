import SiteHeader from '@/components/common/SiteHeader';
import DocSidebar from '@/components/docs/DocSidebar';

export default function DocsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
            <SiteHeader />

            <div className="flex-1 max-w-8xl mx-auto w-full flex pt-16">
                {/* Sidebar - Hidden on mobile, fixed on desktop */}
                <aside className="hidden lg:block w-64 xl:w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto">
                    <div className="p-4">
                        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-2">Documentation</h2>
                        <DocSidebar />
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 min-w-0">
                    {children}
                </main>
            </div>
        </div>
    );
}
