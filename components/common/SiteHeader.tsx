'use client';

// import { useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    Home,
    Settings2,
    Library,
    LogOut
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

export default function SiteHeader() {
    const router = useRouter();
    const pathname = usePathname();
    const { token, clearToken, isAdmin } = useAuth();

    // Legacy decode removed as isAdmin is provided by context

    const onLogout = () => {
        clearToken();
        router.push('/login');
    };

    const isActive = (path: string) => pathname === path;

    return (
        <header className="fixed top-0 inset-x-0 z-50 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">

                {/* Brand */}
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Image
                            src="/icon.png"
                            alt="LabFlow"
                            width={32}
                            height={32}
                            className="relative transform group-hover:scale-105 transition-transform duration-300"
                        />
                    </div>
                    <div className="flex items-baseline text-2xl tracking-tight text-[#2c3e50] dark:text-zinc-100 font-sans">
                        <span className="font-semibold">Lab</span>
                        <span className="font-medium">Flow</span>
                    </div>
                </Link>

                {/* Navigation */}
                <nav className="flex items-center gap-1 sm:gap-2">

                    {!token ? (
                        <Link
                            href="/login"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm shadow-blue-500/20"
                        >
                            <span className="hidden sm:inline">登录 / 注册</span>
                            <span className="sm:hidden">登录</span>
                        </Link>
                    ) : (
                        <>
                            <Link
                                href="/"
                                className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
              ${isActive('/')
                                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900'}
            `}
                            >
                                <Home size={16} />
                                <span className="hidden sm:inline">首页</span>
                            </Link>

                            <Link
                                href="/workspace"
                                className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
              ${isActive('/workspace') || pathname.startsWith('/projects')
                                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900'}
            `}
                            >
                                <Library size={16} />
                                <span className="hidden sm:inline">工作区</span>
                            </Link>

                            <Link
                                href="/docs"
                                className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
              ${isActive('/docs')
                                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900'}
            `}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book-open"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                                <span className="hidden sm:inline">文档</span>
                            </Link>

                            {isAdmin && (
                                <Link
                                    href="/manage"
                                    className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                ${isActive('/manage')
                                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                            : 'text-zinc-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'}
              `}
                                >
                                    <Settings2 size={16} />
                                    <span className="hidden sm:inline">管理</span>
                                </Link>
                            )}

                            <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-800 mx-2" />

                            <button
                                onClick={onLogout}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                            >
                                <LogOut size={16} />
                                <span className="hidden sm:inline">退出</span>
                            </button>
                        </>
                    )}

                </nav>
            </div>
        </header>
    );
}
