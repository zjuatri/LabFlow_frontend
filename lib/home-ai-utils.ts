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
  existingBlocks?: TypstBlock[] | null;
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
}): { userInputJson: string; pdfContextJson: string; existingBlocksJson: string } {
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
  const existingBlocksObj = params.existingBlocks ?? [];

  return {
    userInputJson: JSON.stringify(userInputObj, null, 2),
    pdfContextJson: JSON.stringify(pdfContextObj, null, 2),
    existingBlocksJson: JSON.stringify(simplifyBlocksForAi(existingBlocksObj), null, 2),
  };
}

function simplifyBlocksForAi(blocks: TypstBlock[]): any[] {
  return blocks.map((b) => {
    // Basic allowed fields
    const newB: any = {
      type: b.type,
    };

    // Keep content if it exists
    if (typeof b.content !== 'undefined') {
      newB.content = b.content;
    }

    // Specific handling for Images: remove content (url), keep caption/title
    if (b.type === 'vertical_space') {
      return null; // Ignore vertical space in AI context
    }

    if (b.type === 'image') {
      // User requested: if no caption, do NOT include in context
      if (!(b as any).caption) {
        return null; // Will be filtered out later
      }
      delete newB.content;
      newB.caption = (b as any).caption;
    }
    // For other blocks allow content.

    // Whitelist specific content-bearing or structural fields
    if ((b as any).level) newB.level = (b as any).level; // heading
    if ((b as any).language) newB.language = (b as any).language; // code
    if ((b as any).inputLines) newB.inputLines = (b as any).inputLines; // input_field
    if ((b as any).caption && b.type !== 'image') newB.caption = (b as any).caption; // tables/others

    // Recursion for children
    if (b.children && Array.isArray(b.children)) {
      newB.children = simplifyBlocksForAi(b.children);
    }

    // Drop all style-related fields:
    // align, width, height, fontSize, font, fontFamily, uiCollapsed,
    // coverFixedOnePage, compositeJustify, compositeGap, etc.

    return newB;
  }).filter(Boolean);
}

export function applyPromptTemplate(template: string, vars: { USER_INPUT_JSON: string; PDF_CONTEXT_JSON: string; PROJECT_ID: string; EXISTING_BLOCKS_JSON?: string }): string {
  return template
    .replaceAll('{{USER_INPUT_JSON}}', vars.USER_INPUT_JSON)
    .replaceAll('{{PDF_CONTEXT_JSON}}', vars.PDF_CONTEXT_JSON)
    .replaceAll('{{PROJECT_ID}}', vars.PROJECT_ID)
    .replaceAll('{{EXISTING_BLOCKS_JSON}}', vars.EXISTING_BLOCKS_JSON ?? '[]');
}

export type NormalizedAiResult = {
  blocks: TypstBlock[];
  settings: DocumentSettings | null;
};
