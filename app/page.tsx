'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Sparkles, ArrowRight } from 'lucide-react';
import FileUploadWithDescription from '@/components/FileUploadWithDescription';
import { clearToken, getToken } from '@/lib/auth';

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  description?: string;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const [outlineText, setOutlineText] = useState('');
  const [outlineFiles, setOutlineFiles] = useState<UploadedFile[]>([]);
  const [detailsText, setDetailsText] = useState('');
  const [detailsFiles, setDetailsFiles] = useState<UploadedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
    }
  }, [router]);

  const handleGenerate = async () => {
    if (!outlineText.trim() && !detailsText.trim() && outlineFiles.length === 0 && detailsFiles.length === 0) {
      return;
    }

    setIsGenerating(true);

    // TODO: 接入AI后端
    // 这里暂时模拟生成过程
    setTimeout(() => {
      setIsGenerating(false);
      // 生成完成后可以跳转到项目页面
      // router.push(`/projects/${generatedProjectId}`);
    }, 2000);
  };

  const handleOutlineFilesChange = (newFiles: UploadedFile[]) => {
    setOutlineFiles(newFiles);
  };

  const handleDetailsFilesChange = (newFiles: UploadedFile[]) => {
    setDetailsFiles(newFiles);
  };

  const onLogout = () => {
    clearToken();
    router.push('/login');
  };

  const goToWorkspace = () => {
    router.push('/workspace');
  };

  const canGenerate = outlineText.trim() || detailsText.trim() || outlineFiles.length > 0 || detailsFiles.length > 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/icon.png" alt="LabFlow" width={32} height={32} className="" />
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">LabFlow</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={goToWorkspace}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors"
            >
              我的工作区
            </button>
            <button
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors"
              onClick={onLogout}
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-full mb-4">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">AI 驱动的实验报告生成</span>
          </div>
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            创建新项目
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            描述您的实验大纲和细节，或上传相关文件，AI 将帮助您生成专业的实验报告
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
          <div className="p-6 space-y-6">
            {/* Outline Section */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                文档大纲
              </label>
              <textarea
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                placeholder="例如：实验目的、实验原理、实验步骤、实验结果、结论等"
                className="w-full h-32 px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2 mb-3">
                简要描述您的文档结构和主要章节
              </p>
              <FileUploadWithDescription 
                onFilesChange={handleOutlineFilesChange}
                label="outline"
                placeholder="上传大纲相关文件（可选）"
              />
            </div>

            {/* Details Section */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                细节信息
              </label>
              <textarea
                value={detailsText}
                onChange={(e) => setDetailsText(e.target.value)}
                placeholder="详细描述实验的背景、方法、数据、观察结果等信息..."
                className="w-full h-48 px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2 mb-3">
                提供更多细节信息以帮助 AI 生成更准确的内容
              </p>
              <FileUploadWithDescription 
                onFilesChange={handleDetailsFilesChange}
                label="details"
                placeholder="上传细节相关文件（可选）"
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between rounded-b-lg">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {(outlineFiles.length > 0 || detailsFiles.length > 0) && (
                <span>已上传 {outlineFiles.length + detailsFiles.length} 个文件</span>
              )}
            </div>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  生成项目
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tips Section */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">💡 使用建议</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• 提供清晰的文档大纲有助于生成更结构化的报告</li>
            <li>• 细节信息越详细，生成的内容越准确</li>
            <li>• 为每个上传的文件添加描述，让 AI 更好地理解文件内容</li>
            <li>• 可以在大纲和细节部分分别上传相关文件</li>
            <li>• 生成后您可以继续编辑和完善文档</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
