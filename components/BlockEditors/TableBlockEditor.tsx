'use client';

import { TypstBlock, BlockType } from '@/lib/typst';
import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';
import { getToken } from '@/lib/auth';
import { Trash2, Plus, ChevronUp, ChevronDown, Bold, Italic, Strikethrough, Palette, Sigma, MousePointer2 } from 'lucide-react';
import { useRef, useState, useEffect, useCallback, type MouseEvent as ReactMouseEvent, type ClipboardEvent as ReactClipboardEvent } from 'react';
import Image from 'next/image';

// Import types and utilities from separated modules
import type { InlineMathFormat, InlineMathState, TableStyle, TablePayload } from '../BlockEditor-utils/types';
import {
  typstInlineToHtml,
  htmlToTypstInline,
  generateInlineMathId,
  typstInlineToPlainText,
} from '../BlockEditor-utils/utils';
import {
  defaultTablePayload,
  parseTablePayload,
  normalizeTablePayload,
  flattenTableMerges,
  mergeTableRect,
  unmergeTableCell,
} from '../BlockEditor-utils/table-utils';

interface BlockEditorProps {
  blocks: TypstBlock[];
  onChange: (blocks: TypstBlock[]) => void;
  projectId: string;
  onBlockClick?: (index: number) => void;
}

type ChartType = 'scatter' | 'bar' | 'pie' | 'hbar';
type ChartRenderRequest = {
  chart_type: ChartType;
  title: string;
  x_label: string;
  y_label: string;
  legend: boolean;
  data: Array<Record<string, unknown>>;
};



export default function TableBlockEditor(){

}