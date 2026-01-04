'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Settings2, BookOpen, BrainCircuit } from 'lucide-react';
import SiteHeader from '@/components/common/SiteHeader';
import { useAuth } from '@/components/auth/AuthProvider';

export default function ManageDashboard() {
  const router = useRouter();
  const { token, isLoading: isAuthLoading, isAdmin } = useAuth();

  if (isAuthLoading) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950/50" />;
  }
  if (!token || !isAdmin) {
    if (!token) router.push('/login');
    else router.push('/');
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950/50" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <SiteHeader />

      <main className="max-w-7xl mx-auto px-4 pt-28 pb-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Settings2 className="text-blue-600" size={32} />
            管理面板
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            仅管理员可见。管理文档内容与 AI 配置。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          <Link href="/manage/docs" className="group p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500 dark:hover:border-blue-500 transition-colors shadow-sm">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg w-fit mb-4">
              <BookOpen size={24} />
            </div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-blue-600 transition-colors">文档管理</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              创建、编辑或发布 /docs 下的文档内容。支持 Markdown 编辑。
            </p>
          </Link>

          <Link href="/manage/prompts" className="group p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-purple-500 dark:hover:border-purple-500 transition-colors shadow-sm">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg w-fit mb-4">
              <BrainCircuit size={24} />
            </div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-purple-600 transition-colors">提示词编排</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              调整 AI Agent 的系统提示词、OCR 模板及助手逻辑。
            </p>
          </Link>

        </div>
      </main>
    </div>
  );
}
