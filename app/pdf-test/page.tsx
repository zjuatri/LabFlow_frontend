'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

import React, { useMemo, useState } from 'react';
import { createProject } from '../../lib/api';
import { uploadPdfAndIngest } from '../../lib/pdf-ingest';
import {
  type PdfTableFormulaVisionResponse,
  uploadPdfAndParseTableFormulasWithVision,
} from '../../lib/pdf-table-formula-vision';

type IngestTable = {
  page?: number;
  page_number?: number;
  table_index?: number;
  rows: number;
  cols: number;
  tablePayload?: {
    caption?: string | null;
    style?: string | null;
    rows: number;
    cols: number;
    cells: Array<
      Array<{
        content: string;
        rowspan?: number;
        colspan?: number;
        is_placeholder?: boolean;
        bbox?: { x0: number; top: number; x1: number; bottom: number } | null;
      }>
    >;
  };
  csv_preview?: string;
};

type IngestImage = {
  page: number;
  filename: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  url: string;
};

type IngestResponse = {
  project_id: string;
  text_pages: string[];
  ocr_text_pages?: Array<{ page: number; text: string }> | null;
  tables: IngestTable[];
  images: IngestImage[];
};

export default function PdfTestPage() {
  const [title, setTitle] = useState('PDF ingest test');
  const [file, setFile] = useState<File | null>(null);
  const [pageStart, setPageStart] = useState<string>('');
  const [pageEnd, setPageEnd] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionResult, setVisionResult] = useState<PdfTableFormulaVisionResponse | null>(null);
  const [visionShowHtmlTable, setVisionShowHtmlTable] = useState(true);

  const hasFile = !!file;

  const summary = useMemo(() => {
    if (!result) return null;
    return {
      pages: result.text_pages?.length ?? 0,
      tables: result.tables?.length ?? 0,
      images: result.images?.length ?? 0,
      totalTextChars: (result.text_pages ?? []).reduce((acc, s) => acc + (s?.length ?? 0), 0),
    };
  }, [result]);

  async function onRun() {
    if (!file) return;

    const start = pageStart.trim() ? Number(pageStart) : undefined;
    const end = pageEnd.trim() ? Number(pageEnd) : undefined;
    if (start !== undefined && (!Number.isFinite(start) || start < 1)) {
      setError('pageStart 必须是 >= 1 的整数（留空表示从第 1 页）');
      return;
    }
    if (end !== undefined && (!Number.isFinite(end) || end < 1)) {
      setError('pageEnd 必须是 >= 1 的整数（留空表示到最后一页）');
      return;
    }
    if (start !== undefined && end !== undefined && end < start) {
      setError('pageEnd 必须 >= pageStart');
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    setVisionError(null);
    setVisionResult(null);

    try {
      const project = await createProject(title);

      // 并行执行基础解析和公式识别
      const [ingest, visionRes] = await Promise.all([
        uploadPdfAndIngest(project.id, file, {
          pageStart: start,
          pageEnd: end,
          ocrMath: true,
          ocrModel: 'glm-4.6v-flash',
          ocrScale: 2.0,
        }) as Promise<IngestResponse>,
        uploadPdfAndParseTableFormulasWithVision(project.id, file, { pageStart: start, pageEnd: end }).catch(err => {
          console.warn('Vision parsing failed:', err);
          setVisionError(err instanceof Error ? err.message : String(err));
          return null;
        })
      ]);

      setResult(ingest);
      if (visionRes) {
        setVisionResult(visionRes);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRunTableVision() {
    if (!file) return;

    const start = pageStart.trim() ? Number(pageStart) : undefined;
    const end = pageEnd.trim() ? Number(pageEnd) : undefined;
    if (start !== undefined && (!Number.isFinite(start) || start < 1)) {
      setVisionError('pageStart 必须是 >= 1 的整数（留空表示从第 1 页）');
      return;
    }
    if (end !== undefined && (!Number.isFinite(end) || end < 1)) {
      setVisionError('pageEnd 必须是 >= 1 的整数（留空表示到最后一页）');
      return;
    }
    if (start !== undefined && end !== undefined && end < start) {
      setVisionError('pageEnd 必须 >= pageStart');
      return;
    }

    setVisionBusy(true);
    setVisionError(null);
    setVisionResult(null);

    try {
      const project = await createProject(`${title} (table vision)`);
      const res = await uploadPdfAndParseTableFormulasWithVision(project.id, file, { pageStart: start, pageEnd: end });
      setVisionResult(res);
    } catch (e) {
      setVisionError(e instanceof Error ? e.message : String(e));
    } finally {
      setVisionBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>PDF Ingest 测试页</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        用于验证后端 <code>/api/projects/&lt;id&gt;/pdf/ingest</code>：抽文本/表格/内嵌位图。
      </p>

      <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>项目标题</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: 10 }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>选择 PDF 文件</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span style={{ color: '#666', fontSize: 12 }}>
              当前：{file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : '未选择'}
            </span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>pageStart (可选)</span>
              <input
                inputMode="numeric"
                value={pageStart}
                onChange={(e) => setPageStart(e.target.value)}
                placeholder="例如：1"
                style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: 10 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>pageEnd (可选)</span>
              <input
                inputMode="numeric"
                value={pageEnd}
                onChange={(e) => setPageEnd(e.target.value)}
                placeholder="例如：3"
                style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: 10 }}
              />
            </label>
          </div>

          <button
            onClick={onRun}
            disabled={!hasFile || busy}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #ddd',
              background: busy || !hasFile ? '#f5f5f5' : '#111',
              color: busy || !hasFile ? '#999' : '#fff',
              cursor: busy || !hasFile ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {busy ? '解析中（含公式识别）…' : '创建项目并上传解析（含公式识别）'}
          </button>

          <button
            onClick={onRunTableVision}
            disabled={!hasFile || visionBusy}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #ddd',
              background: visionBusy || !hasFile ? '#f5f5f5' : '#0b5fff',
              color: visionBusy || !hasFile ? '#999' : '#fff',
              cursor: visionBusy || !hasFile ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {visionBusy ? '公式识别中…' : '单独运行：表格单元格公式识别（GLM Vision）'}
          </button>

          {error ? (
            <div style={{ color: '#b00020', whiteSpace: 'pre-wrap' }}>
              <strong>错误：</strong> {error}
            </div>
          ) : null}

          {visionError ? (
            <div style={{ color: '#b00020', whiteSpace: 'pre-wrap' }}>
              <strong>公式识别错误：</strong> {visionError}
            </div>
          ) : null}
        </div>
      </section>

      {summary ? (
        <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>摘要</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Stat label="pages" value={summary.pages} />
            <Stat label="tables" value={summary.tables} />
            <Stat label="images" value={summary.images} />
            <Stat label="text chars" value={summary.totalTextChars} />
          </div>
          <div style={{ marginTop: 10, color: '#666', fontSize: 12 }}>
            project_id：<code>{result?.project_id}</code>
          </div>
        </section>
      ) : null}

      {result ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          <details open style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>text_pages</summary>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              {(result.text_pages ?? []).map((t, idx) => (
                <div key={idx} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Page {idx + 1}</div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      background: '#fafafa',
                      padding: 10,
                      borderRadius: 8,
                      maxHeight: 240,
                      overflow: 'auto',
                    }}
                  >
                    {t || ''}
                  </pre>
                </div>
              ))}
            </div>
          </details>

          {Array.isArray((result as any).ocr_text_pages) ? (
            <details open style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>ocr_text_pages（含行内公式）</summary>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                {((result as any).ocr_text_pages ?? []).map((p: any, idx: number) => (
                  <div key={idx} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Page {p?.page ?? idx + 1}</div>
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        background: '#fafafa',
                        padding: 10,
                        borderRadius: 8,
                        maxHeight: 360,
                        overflow: 'auto',
                      }}
                    >
                      {p?.text || ''}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <details style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>tables</summary>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              {(result.tables ?? []).map((tbl, idx) => (
                <div key={idx} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Page {tbl.page_number ?? tbl.page ?? '?'} / table #{tbl.table_index ?? idx} ({tbl.rows}×{tbl.cols})
                  </div>
                  {tbl.tablePayload?.caption ? (
                    <div style={{ color: '#666', marginBottom: 6 }}>{tbl.tablePayload.caption}</div>
                  ) : null}

                  {tbl.tablePayload?.cells?.length ? (
                    <HtmlTable cells={tbl.tablePayload.cells} />
                  ) : (
                    <div style={{ color: '#666' }}>该表格未抽取到单元格内容</div>
                  )}

                  {tbl.csv_preview ? (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: 'pointer', color: '#666' }}>csv 预览</summary>
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          background: '#fafafa',
                          padding: 10,
                          borderRadius: 8,
                          maxHeight: 160,
                          overflow: 'auto',
                        }}
                      >
                        {tbl.csv_preview}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))}
              {(result.tables ?? []).length === 0 ? <div style={{ color: '#666' }}>未识别到表格</div> : null}
            </div>
          </details>

          <details style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>images</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
              {(result.images ?? []).map((img, idx) => (
                <div key={idx} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Page {img.page}
                  </div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>{img.filename}</div>
                  <img
                    src={(process.env.NEXT_PUBLIC_BACKEND_URL ?? '') + img.url}
                    alt={img.filename}
                    style={{ width: '100%', height: 160, objectFit: 'contain', background: '#fafafa' }}
                  />
                  <div style={{ color: '#666', fontSize: 12, marginTop: 8 }}>
                    {img.mime} {img.width ? `${img.width}×${img.height}` : ''}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    <a
                      href={(process.env.NEXT_PUBLIC_BACKEND_URL ?? '') + img.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开 URL
                    </a>
                  </div>
                </div>
              ))}
              {(result.images ?? []).length === 0 ? <div style={{ color: '#666' }}>未抽取到内嵌位图</div> : null}
            </div>
          </details>

          <details style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>raw json</summary>
            <pre
              style={{
                marginTop: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#fafafa',
                padding: 12,
                borderRadius: 10,
                maxHeight: 520,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}

      {visionResult ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginTop: 16 }}>
          <details open style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>table formula vision</summary>
            <div style={{ marginTop: 10, color: '#666', fontSize: 12 }}>
              project_id：<code>{visionResult.project_id}</code>，model：<code>{visionResult.model}</code>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', color: '#333' }}>
                <input
                  type="checkbox"
                  checked={visionShowHtmlTable}
                  onChange={(e) => setVisionShowHtmlTable(e.target.checked)}
                />
                <span>渲染为 HTML 表格</span>
              </label>
            </div>

            {visionShowHtmlTable ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 16 }}>
                {(visionResult.tables ?? []).map((t) => {
                  const cells = t.cells ?? [];
                  const maxRow = Math.max(0, ...cells.map((c) => (c.row ?? 0) + (c.rowspan ?? 1)));
                  const maxCol = Math.max(0, ...cells.map((c) => (c.col ?? 0) + (c.colspan ?? 1)));
                  const rowCount = t.rows && t.rows > 0 ? t.rows : maxRow;
                  const colCount = t.cols && t.cols > 0 ? t.cols : maxCol;

                  const byPos = new Map<string, (typeof cells)[number]>();
                  const covered = new Set<string>();
                  for (const c of cells) {
                    const r0 = c.row ?? 0;
                    const c0 = c.col ?? 0;
                    const rs = c.rowspan ?? 1;
                    const cs = c.colspan ?? 1;
                    byPos.set(`${r0},${c0}`, c);
                    for (let rr = r0; rr < r0 + rs; rr++) {
                      for (let cc = c0; cc < c0 + cs; cc++) {
                        if (rr === r0 && cc === c0) continue;
                        covered.add(`${rr},${cc}`);
                      }
                    }
                  }

                  return (
                    <div key={`html-${t.page}-${t.table_index}`}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>
                        Page {t.page} / table {t.table_index}
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
                          <tbody>
                            {Array.from({ length: rowCount }, (_, r) => (
                              <tr key={r}>
                                {Array.from({ length: colCount }, (_, c) => {
                                  if (covered.has(`${r},${c}`)) return null;
                                  const cell = byPos.get(`${r},${c}`);
                                  const text = cell
                                    ? ((cell.latex ?? '').trim() ? cell.latex : (cell.content ?? ''))
                                    : '';
                                  const rs = cell?.rowspan ?? 1;
                                  const cs = cell?.colspan ?? 1;
                                  return (
                                    <td
                                      key={c}
                                      rowSpan={rs}
                                      colSpan={cs}
                                      style={{
                                        border: '1px solid #ddd',
                                        padding: 8,
                                        verticalAlign: 'top',
                                        background: cell ? '#fff' : '#fafafa',
                                        minWidth: 80,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {text}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {'diagnostics' in (visionResult as any) ? (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', color: '#666' }}>diagnostics</summary>
                <pre
                  style={{
                    marginTop: 8,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: '#fafafa',
                    padding: 10,
                    borderRadius: 8,
                    maxHeight: 240,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify((visionResult as any).diagnostics, null, 2)}
                </pre>
              </details>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
              {(visionResult.rendered_cell_images ?? []).map((img, idx) => {
                const cell = visionResult.tables
                  ?.find((t) => t.page === img.page && t.table_index === img.table_index)
                  ?.cells?.find((c) => {
                    const b = c.bbox;
                    return (
                      Math.abs(b.x0 - img.bbox.x0) < 1e-6 &&
                      Math.abs(b.top - img.bbox.top) < 1e-6 &&
                      Math.abs(b.x1 - img.bbox.x1) < 1e-6 &&
                      Math.abs(b.bottom - img.bbox.bottom) < 1e-6
                    );
                  });

                return (
                  <div key={idx} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      Page {img.page} / table {img.table_index} / cell {img.cell_index}
                    </div>
                    <img
                      src={(process.env.NEXT_PUBLIC_BACKEND_URL ?? '') + img.url}
                      alt={img.filename}
                      style={{ width: '100%', height: 160, objectFit: 'contain', background: '#fafafa' }}
                    />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                      bbox: ({img.bbox.x0.toFixed(1)},{img.bbox.top.toFixed(1)})-({img.bbox.x1.toFixed(1)},{img.bbox.bottom.toFixed(1)})
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>content</div>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          background: '#fafafa',
                          padding: 10,
                          borderRadius: 8,
                          maxHeight: 120,
                          overflow: 'auto',
                        }}
                      >
                        {cell?.content ?? ''}
                      </pre>

                      <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>latex（空则展示 content）</div>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          background: '#fafafa',
                          padding: 10,
                          borderRadius: 8,
                          maxHeight: 160,
                          overflow: 'auto',
                        }}
                      >
                        {(cell?.latex ?? '').trim() ? cell?.latex : (cell?.content ?? '')}
                      </pre>
                    </div>
                  </div>
                );
              })}
              {(visionResult.rendered_cell_images ?? []).length === 0 ? (
                <div style={{ color: '#666' }}>未渲染出单元格图片（可能未识别到表格）</div>
              ) : null}
            </div>
          </details>

          <details style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>raw vision json</summary>
            <pre
              style={{
                marginTop: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#fafafa',
                padding: 12,
                borderRadius: 10,
                maxHeight: 520,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(visionResult, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </main>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: 12, background: '#fff' }}>
      <div style={{ color: '#666', fontSize: 12 }}>{props.label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{props.value}</div>
    </div>
  );
}

function HtmlTable(
  props: {
    cells: Array<
      Array<{
        content: string;
        rowspan?: number;
        colspan?: number;
        is_placeholder?: boolean;
      }>
    >;
  }
) {
  return (
    <div
      style={{
        overflow: 'auto',
        border: '1px solid #eee',
        borderRadius: 10,
        background: '#fff',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {props.cells.map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => {
                if (cell?.is_placeholder) return null;
                const rowSpan = Math.max(1, cell?.rowspan ?? 1);
                const colSpan = Math.max(1, cell?.colspan ?? 1);
                return (
                  <td
                    key={cIdx}
                    rowSpan={rowSpan}
                    colSpan={colSpan}
                    style={{
                      borderBottom: '1px solid #f0f0f0',
                      borderRight: '1px solid #f0f0f0',
                      padding: '8px 10px',
                      verticalAlign: 'top',
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                      minWidth: 80,
                    }}
                  >
                    {cell?.content ?? ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
