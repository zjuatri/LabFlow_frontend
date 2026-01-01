'use client';

import { useCallback, useMemo } from 'react';

export default function PdfUploadSingle(props: {
  label?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  pageStart: string;
  pageEnd: string;
  onPageStartChange: (value: string) => void;
  onPageEndChange: (value: string) => void;
}) {
  const {
    label = 'PDF 文件（可选）',
    file,
    onChange,
    pageStart,
    pageEnd,
    onPageStartChange,
    onPageEndChange,
  } = props;

  const meta = useMemo(() => {
    if (!file) return null;
    const mb = (file.size / 1024 / 1024).toFixed(2);
    return `${file.name} (${mb} MB)`;
  }, [file]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      if (!f) {
        onChange(null);
        return;
      }
      const name = (f.name || '').toLowerCase();
      if (!name.endsWith('.pdf')) {
        onChange(null);
        return;
      }
      onChange(f);
    },
    [onChange]
  );

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={onFileChange}
          className="block w-full text-sm text-zinc-700 dark:text-zinc-200 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-900 dark:file:text-zinc-100"
        />
        {file ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-sm px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            清除
          </button>
        ) : null}
      </div>
      {meta ? <div className="text-xs text-zinc-500 dark:text-zinc-500">{meta}</div> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs text-zinc-600 dark:text-zinc-400">起始页（可选，≥1）</div>
          <input
            value={pageStart}
            onChange={(e) => onPageStartChange(e.target.value)}
            placeholder="例如 1"
            inputMode="numeric"
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-zinc-600 dark:text-zinc-400">结束页（可选，≥起始页）</div>
          <input
            value={pageEnd}
            onChange={(e) => onPageEndChange(e.target.value)}
            placeholder="例如 3"
            inputMode="numeric"
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="text-xs text-zinc-500 dark:text-zinc-500">
        提示：上传 PDF 后会进行 OCR、表格公式识别、图片概括，并把结果提供给 DeepSeek。
      </div>
    </div>
  );
}
