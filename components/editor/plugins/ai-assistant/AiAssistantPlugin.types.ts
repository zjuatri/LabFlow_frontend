export type AiContextFile = {
    id: string;
    file?: File; // Optional now, as URL items won't have a File object
    url?: string; // For MinerU URL mode
    source: 'local' | 'url';
    type: 'pdf' | 'image' | 'office';
    description: string;
    shouldInclude?: boolean; // New: User preference to include in report
    // PDF specific
    usePageRange?: boolean; // New: Toggle for page range selection
    pdfPageStart?: string;
    pdfPageEnd?: string;
    // Image specific
    imageRecognize?: boolean; // enable AI vision
};

export type AiPluginDraft = {
    outlineText: string;
    detailsText: string;
    files: AiContextFile[];
    parserMode: 'local' | 'mineru';
    selectedModel: 'deepseek-chat' | 'deepseek-reasoner' | 'qwen3-max';
    thinkingEnabled: boolean;
};

export const DEFAULT_DRAFT: AiPluginDraft = {
    outlineText: '',
    detailsText: '',
    files: [],
    parserMode: 'mineru',
    selectedModel: 'deepseek-chat',
    thinkingEnabled: false,
};
