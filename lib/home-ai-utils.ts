import type { DocumentSettings, TypstBlock } from './typst';

export function makeAiDebugHeader(payload: {
  model: string;
  thinkingEnabled: boolean;
  rawText: string;
  parsedJson: unknown;
}): string {
  const maxLen = 20000;
  const rawText =
    payload.rawText.length > maxLen ? payload.rawText.slice(0, maxLen) + '\n...[truncated]' : payload.rawText;
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

export function buildUserInputJson(params: {
  outlineText: string;
  detailsText: string;
  referenceFiles: Array<{ name: string; description?: string | null }>;
  selectedModel: string;
  thinkingEnabled: boolean;
  pdfContext?: {
    ocr_text_pages?: Array<{ page: number; text: string; error?: string | null }> | null;
    tables?: Array<{
      page: number;
      rows: number;
      cols: number;
      caption?: string;
      csv_preview?: string;
      has_empty_cells?: boolean;
      has_merged_cells?: boolean;
      cells_preview?: Array<Array<{ content?: string; rowspan?: number; colspan?: number; is_placeholder?: boolean }>>;
    }> | null;
    images?: Array<{ filename: string; url: string; page?: number | null; source?: 'embedded' | 'page_render' | string }> | null;
    table_formula_vision?: unknown;
  } | null;
}): { userInputJson: string; pdfContextJson: string } {
  const userInputObj = {
    user_input: {
      outlineText: params.outlineText || '',
      detailsText: params.detailsText || '',
      referenceFiles: (params.referenceFiles ?? []).map((f) => ({ name: f.name, description: f.description ?? '' })),
      // pdf_context removed from here to separate static/dynamic parts
    },
    meta: {
      selectedModel: params.selectedModel,
      thinkingEnabled: params.thinkingEnabled,
    },
  };

  const pdfContextObj = params.pdfContext ?? null;

  return {
    userInputJson: JSON.stringify(userInputObj, null, 2),
    pdfContextJson: JSON.stringify(pdfContextObj, null, 2),
  };
}

export function applyPromptTemplate(template: string, vars: { USER_INPUT_JSON: string; PDF_CONTEXT_JSON: string; PROJECT_ID: string }): string {
  return template
    .replaceAll('{{USER_INPUT_JSON}}', vars.USER_INPUT_JSON)
    .replaceAll('{{PDF_CONTEXT_JSON}}', vars.PDF_CONTEXT_JSON)
    .replaceAll('{{PROJECT_ID}}', vars.PROJECT_ID);
}

export type NormalizedAiResult = {
  blocks: TypstBlock[];
  settings: DocumentSettings | null;
};
