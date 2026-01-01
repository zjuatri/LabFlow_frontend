'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type AiTestUploadedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  description?: string;
};

export type AiTestDraft = {
  outlineText: string;
  outlineFiles: AiTestUploadedFile[];
  detailsText: string;
  detailsFiles: AiTestUploadedFile[];
  pdfFile: File | null;
  pdfUrl: string;
  pdfPageStart: string;
  pdfPageEnd: string;
  parserMode: 'local' | 'mineru';
  selectedModel: 'deepseek-chat' | 'deepseek-reasoner' | 'qwen3-max';
  thinkingEnabled: boolean;
};

export type AiTestRunSnapshot = {
  projectId: string;
  projectTitle: string;
  steps: Record<string, { label: string; status: 'idle' | 'running' | 'done' | 'error'; output?: unknown; error?: string }>;
  prepDebug: unknown;
  pdfContext: unknown;
  promptTemplate: string;
  finalPrompt: string;
  aiResponse: string;
  aiThought: string;
  aiUsage: unknown;
  aiActualModel: string;
  jumpReady: boolean;
};

type AiTestStoreValue = {
  draft: AiTestDraft | null;
  setDraft: (draft: AiTestDraft) => void;
  clearDraft: () => void;
  run: AiTestRunSnapshot | null;
  patchRun: (patch: Partial<AiTestRunSnapshot>) => void;
  clearRun: () => void;
};

const AiTestStoreContext = createContext<AiTestStoreValue | null>(null);

export function AiTestStoreProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraftState] = useState<AiTestDraft | null>(null);
  const [run, setRunState] = useState<AiTestRunSnapshot | null>(null);

  const setDraft = useCallback((d: AiTestDraft) => setDraftState(d), []);
  const clearDraft = useCallback(() => setDraftState(null), []);

  const patchRun = useCallback((patch: Partial<AiTestRunSnapshot>) => {
    setRunState((prev) => {
      const base = prev ?? {
        projectId: '',
        projectTitle: '',
        steps: {},
        prepDebug: null,
        pdfContext: null,
        promptTemplate: '',
        finalPrompt: '',
        aiResponse: '',
        aiThought: '',
        aiUsage: null,
        aiActualModel: '',
        jumpReady: false,
      };
      return { ...base, ...patch };
    });
  }, []);

  const clearRun = useCallback(() => setRunState(null), []);

  const value = useMemo<AiTestStoreValue>(
    () => ({ draft, setDraft, clearDraft, run, patchRun, clearRun }),
    [draft, setDraft, clearDraft, run, patchRun, clearRun]
  );

  return <AiTestStoreContext.Provider value={value}>{children}</AiTestStoreContext.Provider>;
}

export function useAiTestStore(): AiTestStoreValue {
  const ctx = useContext(AiTestStoreContext);
  if (!ctx) {
    throw new Error('useAiTestStore must be used within AiTestStoreProvider');
  }
  return ctx;
}
