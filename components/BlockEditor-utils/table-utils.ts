import { TablePayload, TableCell } from './types';

export const defaultTablePayload = (rows = 2, cols = 2): TablePayload => ({
  caption: '',
  style: 'normal',
  rows,
  cols,
  cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ content: '' }))),
});

export const parseTablePayload = (content: string): TablePayload => {
  try {
    const parsedUnknown: unknown = JSON.parse(content ?? '');
    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
    if (!isRecord(parsedUnknown)) return defaultTablePayload();
    const parsed = parsedUnknown;

    // Back-compat: { rows: string[][] }
    const rowsValue = parsed['rows'];
    if (Array.isArray(rowsValue) && rowsValue.every((r) => Array.isArray(r))) {
      const rowsArr: string[][] = rowsValue.map((r) => (r as unknown[]).map((c) => (c ?? '').toString()));
      const rows = Math.max(1, rowsArr.length);
      const cols = Math.max(1, ...rowsArr.map((r) => r.length));
      const payload = defaultTablePayload(rows, cols);
      payload.cells = rowsArr.map((r) => {
        const rr = [...r];
        while (rr.length < cols) rr.push('');
        return rr.map((c) => ({ content: c }));
      });
      return payload;
    }

    const cellsValue = parsed['cells'];
    if (!Array.isArray(cellsValue)) return defaultTablePayload();

    const rows = Math.max(1, Number(parsed['rows']) || (cellsValue as unknown[]).length || 1);
    const firstRow = (cellsValue as unknown[])[0];
    const cols = Math.max(1, Number(parsed['cols']) || (Array.isArray(firstRow) ? firstRow.length : 1));

    const caption = typeof parsed['caption'] === 'string' ? (parsed['caption'] as string) : '';
    const style = parsed['style'] === 'three-line' ? 'three-line' : 'normal';

    const cells: TableCell[][] = Array.from({ length: rows }, (_, r) => {
      const rowIn = Array.isArray((cellsValue as unknown[])[r]) ? ((cellsValue as unknown[])[r] as unknown[]) : [];
      return Array.from({ length: cols }, (_, c) => {
        const cellIn = rowIn?.[c];
        if (cellIn && typeof cellIn === 'object') {
          const rec = cellIn as Record<string, unknown>;
          return {
            content: (rec['content'] ?? '').toString(),
            rowspan: rec['rowspan'] ? Number(rec['rowspan']) : undefined,
            colspan: rec['colspan'] ? Number(rec['colspan']) : undefined,
            hidden: !!rec['hidden'],
          };
        }
        return { content: (cellIn ?? '').toString() };
      });
    });

    return { caption, style, rows, cols, cells };
  } catch {
    return defaultTablePayload();
  }
};

export const normalizeTablePayload = (p: TablePayload): TablePayload => {
  const rows = Math.max(1, p.rows);
  const cols = Math.max(1, p.cols);
  return {
    caption: p.caption ?? '',
    style: p.style ?? 'normal',
    rows,
    cols,
    cells: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        content: p.cells?.[r]?.[c]?.content ?? '',
        rowspan: p.cells?.[r]?.[c]?.rowspan,
        colspan: p.cells?.[r]?.[c]?.colspan,
        hidden: p.cells?.[r]?.[c]?.hidden,
      }))
    ),
  };
};

export const flattenTableMerges = (p: TablePayload): TablePayload => {
  const n = normalizeTablePayload(p);
  for (let r = 0; r < n.rows; r++) {
    for (let c = 0; c < n.cols; c++) {
      n.cells[r][c].rowspan = undefined;
      n.cells[r][c].colspan = undefined;
      n.cells[r][c].hidden = false;
    }
  }
  return n;
};

export const mergeTableRect = (p: TablePayload, r1: number, c1: number, r2: number, c2: number): TablePayload => {
  const n = normalizeTablePayload(p);
  const top = Math.min(r1, r2);
  const left = Math.min(c1, c2);
  const bottom = Math.max(r1, r2);
  const right = Math.max(c1, c2);

  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const cell = n.cells[r][c];
      if (cell.hidden) return n;
      if ((cell.rowspan ?? 1) > 1 || (cell.colspan ?? 1) > 1) return n;
    }
  }

  const master = n.cells[top][left];
  const parts: string[] = [];
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const txt = (n.cells[r][c].content ?? '').trim();
      if (txt) parts.push(txt);
    }
  }
  master.content = parts.join('\n');
  master.rowspan = bottom - top + 1;
  master.colspan = right - left + 1;
  master.hidden = false;

  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      if (r === top && c === left) continue;
      n.cells[r][c].hidden = true;
      n.cells[r][c].content = '';
      n.cells[r][c].rowspan = undefined;
      n.cells[r][c].colspan = undefined;
    }
  }

  return n;
};

export const unmergeTableCell = (p: TablePayload, r: number, c: number): TablePayload => {
  const n = normalizeTablePayload(p);
  const cell = n.cells[r][c];
  const rs = Math.max(1, Number(cell.rowspan || 1));
  const cs = Math.max(1, Number(cell.colspan || 1));
  if (rs === 1 && cs === 1) return n;
  cell.rowspan = undefined;
  cell.colspan = undefined;
  cell.hidden = false;
  for (let rr = r; rr < r + rs; rr++) {
    for (let cc = c; cc < c + cs; cc++) {
      if (rr === r && cc === c) continue;
      if (rr < n.rows && cc < n.cols) n.cells[rr][cc].hidden = false;
    }
  }
  return n;
};
