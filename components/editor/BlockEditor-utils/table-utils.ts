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

  // First pass: copy cell data as-is.
  const cells: TableCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      content: p.cells?.[r]?.[c]?.content ?? '',
      rowspan: p.cells?.[r]?.[c]?.rowspan,
      colspan: p.cells?.[r]?.[c]?.colspan,
      hidden: p.cells?.[r]?.[c]?.hidden,
    }))
  );

  // Second pass: infer missing colspan/rowspan from hidden cells.
  // AI often marks cells as `hidden: true` but forgets to set colspan/rowspan on the master cell.
  // We scan each row: if a cell is hidden but the cell to its left is not hidden and has no colspan
  // covering it, extend the left cell's colspan. Similarly for rowspan from above.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (!cell.hidden) continue;

      // Check if already covered by an explicit merge.
      let covered = false;
      // Check cells to the left.
      for (let cc = c - 1; cc >= 0 && !covered; cc--) {
        const left = cells[r][cc];
        if (left.hidden) continue;
        const cs = Math.max(1, left.colspan ?? 1);
        if (cc + cs > c) {
          covered = true;
        }
        break;
      }
      // Check cells above.
      for (let rr = r - 1; rr >= 0 && !covered; rr--) {
        const above = cells[rr][c];
        if (above.hidden) continue;
        const rs = Math.max(1, above.rowspan ?? 1);
        if (rr + rs > r) {
          covered = true;
        }
        break;
      }

      if (covered) continue;

      // Not covered: try to extend the cell to the left (colspan) first.
      let leftMaster: TableCell | null = null;
      let leftCol = -1;
      for (let cc = c - 1; cc >= 0; cc--) {
        if (!cells[r][cc].hidden) {
          leftMaster = cells[r][cc];
          leftCol = cc;
          break;
        }
      }
      if (leftMaster && leftCol >= 0) {
        // Extend colspan to cover this hidden cell.
        const currentCs = Math.max(1, leftMaster.colspan ?? 1);
        const neededCs = c - leftCol + 1;
        if (neededCs > currentCs) {
          leftMaster.colspan = neededCs;
        }
        continue;
      }

      // If no left master, try to extend the cell above (rowspan).
      let aboveMaster: TableCell | null = null;
      let aboveRow = -1;
      for (let rr = r - 1; rr >= 0; rr--) {
        if (!cells[rr][c].hidden) {
          aboveMaster = cells[rr][c];
          aboveRow = rr;
          break;
        }
      }
      if (aboveMaster && aboveRow >= 0) {
        const currentRs = Math.max(1, aboveMaster.rowspan ?? 1);
        const neededRs = r - aboveRow + 1;
        if (neededRs > currentRs) {
          aboveMaster.rowspan = neededRs;
        }
      }
    }
  }

  return {
    caption: p.caption ?? '',
    style: p.style ?? 'normal',
    rows,
    cols,
    cells,
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
