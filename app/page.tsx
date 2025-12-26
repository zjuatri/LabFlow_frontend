'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Sparkles, ArrowRight } from 'lucide-react';
import FileUploadWithDescription from '@/components/FileUploadWithDescription';
import { clearToken, getToken } from '@/lib/auth';
import { chatWithDeepSeekStream, createProject, getManagePrompt, updateProject } from '@/lib/api';
import { blocksToTypst, injectDocumentSettings, type TypstBlock, type DocumentSettings } from '@/lib/typst';
import { extractJsonFromModelText, normalizeAiBlocksResponse } from '@/lib/ai-blocks';

function makeAiDebugHeader(payload: {
  model: string;
  thinkingEnabled: boolean;
  rawText: string;
  parsedJson: unknown;
}): string {
  const maxLen = 20000;
  const rawText = payload.rawText.length > maxLen ? payload.rawText.slice(0, maxLen) + '\n...[truncated]' : payload.rawText;
  const jsonText = JSON.stringify(payload.parsedJson, null, 2);
  const jsonSafe = jsonText.length > maxLen ? jsonText.slice(0, maxLen) + '\n...[truncated]' : jsonText;
  const lines = [
    '/* LF_AI_DEBUG v1',
    `model: ${payload.model}`,
    `thinking: ${payload.thinkingEnabled ? 'on' : 'off'}`,
    '--- RAW_TEXT ---',
    rawText,
    '--- PARSED_JSON ---',
    jsonSafe,
    '*/',
    '',
  ];
  return lines.join('\n');
}

function buildUserInputJson(params: {
  outlineText: string;
  detailsText: string;
  outlineFiles: UploadedFile[];
  detailsFiles: UploadedFile[];
  selectedModel: string;
  thinkingEnabled: boolean;
}): string {
  const obj = {
    user_input: {
      outlineText: params.outlineText || '',
      detailsText: params.detailsText || '',
      outlineFiles: (params.outlineFiles ?? []).map((f) => ({ name: f.name, description: f.description ?? '' })),
      detailsFiles: (params.detailsFiles ?? []).map((f) => ({ name: f.name, description: f.description ?? '' })),
    },
    meta: {
      selectedModel: params.selectedModel,
      thinkingEnabled: params.thinkingEnabled,
    },
  };
  return JSON.stringify(obj, null, 2);
}

function applyPromptTemplate(template: string, vars: { USER_INPUT_JSON: string; PROJECT_ID: string }): string {
  return template
    .replaceAll('{{USER_INPUT_JSON}}', vars.USER_INPUT_JSON)
    .replaceAll('{{PROJECT_ID}}', vars.PROJECT_ID);
}

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
  const [aiResponse, setAiResponse] = useState('');
  const [aiThought, setAiThought] = useState('');
  const [aiUsage, setAiUsage] = useState<{ prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null } | null>(null);
  const [aiActualModel, setAiActualModel] = useState<string>('');
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState<'deepseek-v3' | 'deepseek-r1-671b'>('deepseek-v3');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [showThought, setShowThought] = useState(false);
  const [showThoughtTouched, setShowThoughtTouched] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    // Default behavior: expand thought for R1, collapse for V3.
    // If the user already toggled manually, respect that choice.
    if (showThoughtTouched) return;
    setShowThought(selectedModel === 'deepseek-r1-671b');
  }, [selectedModel, showThoughtTouched]);

  useEffect(() => {
    // Default behavior: enable thinking for R1, disable for V3.
    setThinkingEnabled(selectedModel === 'deepseek-r1-671b');
  }, [selectedModel]);

  const handleGenerate = async () => {
    if (!outlineText.trim() && !detailsText.trim() && outlineFiles.length === 0 && detailsFiles.length === 0) {
      return;
    }

    setIsGenerating(true);
    setError('');
    setAiResponse('');
    setAiThought('');
    setAiUsage(null);
    setAiActualModel('');

    try {
      // 先创建一个新项目（用于固化 project_id，并让图片路径可被替换）
      const projectTitle = outlineText.trim().split(/\r?\n/)[0]?.trim() || 'AI 生成实验报告';
      const created = await createProject(projectTitle.slice(0, 200));
      const createdProjectId = created.id;

      // Admin can override the full prompt TEMPLATE via /manage.
      // Template supports placeholders:
      // - {{USER_INPUT_JSON}}: structured user input payload
      // - {{PROJECT_ID}}: created project id
      let template: string | null = null;
      try {
        const data = await getManagePrompt();
        template = (data.ai_prompt ?? '').trim() || null;
      } catch {
        // ignore (likely 403 for non-admin)
      }

      const defaultTemplate =
        '你是实验报告写作助手。你的输出会被程序解析为 JSON 并写入可视化编辑器。\n\n' +
        '硬性要求：\n' +
        '1) 只输出 JSON，不要输出解释、Markdown、代码围栏、注释。\n' +
        '2) 输出必须是一个对象：{"settings": {...}, "blocks": [...]}\n' +
        '3) blocks 中每个元素必须包含：id(string, 唯一), type, content，并可选 level/language/width/align/caption 等。\n' +
        '4) 图片 block 的 content 必须使用 /static/projects/<project_id>/images/<filename>（不要 http 链接；不要带 ?t=）。\n' +
        '5) 表格/图表优先使用 tablePayload/chartPayload（对象）避免转义错误。\n' +
        '6) 不要编造用户未提供的数据；缺失部分用“待补充：...”占位。\n\n' +
        '生成目标：产出结构完整、可编辑的实验报告 blocks。章节至少包含：摘要、原理、步骤、数据与处理、讨论、结论、参考文献。\n\n' +
        '下面给出一个【格式示例】（只示范结构，不要照抄内容；你仍然必须输出一份完整 JSON）：\n' +
        '{\n' +
        '  "settings": {\n' +
        '    "tableCaptionNumbering": true,\n' +
        '    "imageCaptionNumbering": true,\n' +
        '    "imageCaptionPosition": "below"\n' +
        '  },\n' +
        '  "blocks": [\n' +
        '    { "id": "b1", "type": "heading", "level": 1, "content": "实验报告：..." },\n' +
        '    { "id": "b2", "type": "paragraph", "content": "摘要：..." },\n' +
        '    {\n' +
        '      "id": "b3",\n' +
        '      "type": "table",\n' +
        '      "tablePayload": {\n' +
        '        "caption": "原始数据",\n' +
        '        "style": "three-line",\n' +
        '        "rows": 2,\n' +
        '        "cols": 2,\n' +
        '        "cells": [[{"content":"x"},{"content":"y"}],[{"content":"1"},{"content":"2"}]]\n' +
        '      }\n' +
        '    }\n' +
        '  ]\n' +
        '}\n\n' +
        '下面是用户提供的信息（JSON）：\n{{USER_INPUT_JSON}}\n\n' +
        '【必须使用的 project_id】{{PROJECT_ID}}\n' +
        '请将所有图片路径中的 <project_id> 替换为上述 project_id。\n';

      const userInputJson = buildUserInputJson({
        outlineText: outlineText.trim(),
        detailsText: detailsText.trim(),
        outlineFiles,
        detailsFiles,
        selectedModel,
        thinkingEnabled,
      });

      const message = applyPromptTemplate(template ?? defaultTemplate, {
        USER_INPUT_JSON: userInputJson,
        PROJECT_ID: createdProjectId,
      });
      
      // 用户输入已通过 {{USER_INPUT_JSON}} 注入模板，无需再拼接文本块。

      let aiText = '';
      let parsedBlocks: TypstBlock[] | null = null;
      let parsedSettings: DocumentSettings | null = null;

      // 流式调用 DeepSeek API：实时展示思考过程/正文
      await chatWithDeepSeekStream(message, selectedModel, thinkingEnabled, (evt) => {
        if (evt.type === 'meta') {
          setAiActualModel(evt.model);
          return;
        }
        if (evt.type === 'thought') {
          setAiThought((prev) => prev + evt.delta);
          return;
        }
        if (evt.type === 'content') {
          setAiResponse((prev) => prev + evt.delta);
          aiText += evt.delta;
          return;
        }
        if (evt.type === 'usage') {
          setAiUsage(evt.usage ?? null);
          return;
        }
      });

      // 解析并规范化 AI 输出 JSON -> TypstBlock[]
      const raw = extractJsonFromModelText(aiText);
      const normalized = normalizeAiBlocksResponse({ raw, projectId: createdProjectId });
      parsedBlocks = normalized.blocks;
      parsedSettings = normalized.settings;

      // blocks -> typst -> 写入项目
      const code = blocksToTypst(parsedBlocks, { settings: parsedSettings });
      const debugHeader = makeAiDebugHeader({
        model: aiActualModel || selectedModel,
        thinkingEnabled,
        rawText: aiText,
        parsedJson: raw,
      });
      const saveCode = injectDocumentSettings(debugHeader + code, parsedSettings);
      await updateProject(createdProjectId, { title: projectTitle.slice(0, 200), typst_code: saveCode });

      // 跳转到编辑器
      router.push(`/projects/${createdProjectId}`);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
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
            {/* Model Selection */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                AI 模型选择
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedModel('deepseek-v3')}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-all ${
                    selectedModel === 'deepseek-v3'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="font-medium">DeepSeek V3</div>
                  <div className="text-xs mt-1 opacity-75">快速响应，适合日常使用</div>
                </button>
                <button
                  onClick={() => setSelectedModel('deepseek-r1-671b')}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-all ${
                    selectedModel === 'deepseek-r1-671b'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="font-medium">DeepSeek R1 (671B)</div>
                  <div className="text-xs mt-1 opacity-75">推理能力强，适合复杂任务</div>
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">思考模式</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">开启后会输出思考内容（reasoning_content / &lt;think&gt;）</div>
                </div>
                <button
                  type="button"
                  onClick={() => setThinkingEnabled((v) => !v)}
                  className={`px-3 py-1.5 rounded border text-sm transition-colors ${
                    thinkingEnabled
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {thinkingEnabled ? '已开启' : '已关闭'}
                </button>
              </div>
            </div>

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

        {/* AI Response Section */}
        {(isGenerating || aiResponse || aiThought || aiUsage || error) && (
          <div className="mt-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                AI 生成结果
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
                  （选择：{selectedModel}{aiActualModel ? ` | 实际：${aiActualModel}` : ''}）
                </span>
              </h3>
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                {aiUsage && (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">用量 (tokens)</div>
                    <div className="text-xs text-zinc-700 dark:text-zinc-300">
                      prompt: {aiUsage.prompt_tokens ?? '-'} | completion: {aiUsage.completion_tokens ?? '-'} | total: {aiUsage.total_tokens ?? '-'}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">思考过程</div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowThoughtTouched(true);
                          setShowThought((v) => !v);
                        }}
                        className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        {showThought ? '折叠' : '展开'}
                      </button>
                    </div>
                    {showThought && (
                      <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap max-h-60 overflow-auto">
                        {aiThought || (isGenerating ? '思考中…' : '（无）')}
                      </div>
                    )}
                    {!showThought && aiThought && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-500">
                        （已折叠，仍在实时生成）
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">正文</div>
                    <div className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap max-h-60 overflow-auto">
                      {aiResponse || (isGenerating ? '生成中…' : '（无）')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
