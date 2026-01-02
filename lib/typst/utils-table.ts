import {
    PersistedTablePayload,
    PersistedTableCell,
    TableStyle,
} from './types';

export function defaultTablePayload(rows = 2, cols = 2): PersistedTablePayload {
    return {
        caption: '',
        style: 'normal',
        rows,
        cols,
        cells: Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => ({ content: '' } satisfies PersistedTableCell))
        ),
    };
}

/**
 * Infer missing colspan/rowspan from hidden cells.
 * AI often marks cells as `hidden: true` but forgets to set colspan/rowspan on the master cell.
 * This function scans each row: if a cell is hidden but the cell to its left is not hidden and
 * has no colspan covering it, extend the left cell's colspan. Similarly for rowspan from above.
 */
function inferMissingSpans(cells: PersistedTableCell[][], rows: number, cols: number): void {
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
            let leftMaster: PersistedTableCell | null = null;
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
            let aboveMaster: PersistedTableCell | null = null;
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
}

export function safeParseTablePayload(content: string): PersistedTablePayload {
    try {
        const parsedUnknown: unknown = JSON.parse(content);

        const isRecord = (v: unknown): v is Record<string, unknown> =>
            typeof v === 'object' && v !== null;

        if (!isRecord(parsedUnknown)) return defaultTablePayload();
        const parsed = parsedUnknown;

        // Back-compat: { rows: string[][] }
        const rowsValue = parsed['rows'];
        if (Array.isArray(rowsValue) && rowsValue.every((r) => Array.isArray(r))) {
            const rowsArr: string[][] = rowsValue.map((r) =>
                (r as unknown[]).map((c) => (c ?? '').toString())
            );
            const rows = Math.max(1, rowsArr.length);
            const cols = Math.max(1, ...rowsArr.map((r) => r.length));
            const payload = defaultTablePayload(rows, cols);
            payload.cells = rowsArr.map((r) => {
                const rr = [...r];
                while (rr.length < cols) rr.push('');
                return rr.map((c) => ({ content: c }));
            });
            payload.rows = rows;
            payload.cols = cols;
            return payload;
        }

        const cellsValue = parsed['cells'];
        if (!Array.isArray(cellsValue)) return defaultTablePayload();

        const rows = Math.max(1, Number(parsed['rows']) || (cellsValue as unknown[]).length || 1);
        const firstRow = (cellsValue as unknown[])[0];
        const cols = Math.max(1, Number(parsed['cols']) || (Array.isArray(firstRow) ? firstRow.length : 1));
        const style: TableStyle = parsed['style'] === 'three-line' ? 'three-line' : 'normal';
        const caption = typeof parsed['caption'] === 'string' ? (parsed['caption'] as string) : '';

        const cells: PersistedTableCell[][] = Array.from({ length: rows }, (_, r) => {
            const rowIn = Array.isArray((cellsValue as unknown[])[r]) ? ((cellsValue as unknown[])[r] as unknown[]) : [];
            return Array.from({ length: cols }, (_, c) => {
                const cellIn = rowIn?.[c];
                if (cellIn && typeof cellIn === 'object') {
                    const cellRec = cellIn as Record<string, unknown>;
                    return {
                        content: (cellRec['content'] ?? '').toString(),
                        rowspan: cellRec['rowspan'] ? Number(cellRec['rowspan']) : undefined,
                        colspan: cellRec['colspan'] ? Number(cellRec['colspan']) : undefined,
                        hidden: !!cellRec['hidden'],
                    };
                }
                return { content: (cellIn ?? '').toString() };
            });
        });

        // Infer missing colspan/rowspan from hidden cells.
        // AI often marks cells as `hidden: true` but forgets to set colspan/rowspan on the master cell.
        inferMissingSpans(cells, rows, cols);

        return { caption, style, rows, cols, cells };
    } catch {
        return defaultTablePayload();
    }
}
