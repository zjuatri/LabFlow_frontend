import { TypstBlock, DocumentSettings, PersistedTableCell } from '../types';
import { base64EncodeUtf8, safeParseTablePayload, inlineToSingleLine, LF_TABLE_MARKER } from '../utils';

export function serializeTable(block: TypstBlock, tableIndex: number, settings: DocumentSettings): string {
    const payload = safeParseTablePayload(block.content ?? '');
    const rows = payload.rows;
    const cols = payload.cols;
    const style = payload.style ?? 'normal';
    const width = block.width || '50%';

    // Evenly distribute column widths within the table width.
    const columns = `(${Array.from({ length: Math.max(1, cols) }, () => '1fr').join(', ')})`;

    const stroke = style === 'three-line'
        ? `stroke: (x: 0pt, y: 0pt), table.hline(y: 0, stroke: 1.6pt), table.hline(y: 1, stroke: 0.8pt), table.hline(y: ${rows}, stroke: 1.6pt)`
        : 'stroke: 0.8pt';

    // Default table cell alignment: left horizontally, centered vertically.
    // In Typst's alignment system, `center` is horizontal center, and `horizon` is vertical center.
    const align = 'align: left + horizon';

    const flatArgs: string[] = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = payload.cells?.[r]?.[c] ?? ({ content: '' } as PersistedTableCell);
            if (cell.hidden) continue;
            const rs = Math.max(1, Number(cell.rowspan || 1));
            const cs = Math.max(1, Number(cell.colspan || 1));
            const body = inlineToSingleLine((cell.content ?? '').trim());

            const cellArgs: string[] = [];
            if (rs > 1) cellArgs.push(`rowspan: ${rs}`);
            if (cs > 1) cellArgs.push(`colspan: ${cs}`);

            if (cellArgs.length > 0) {
                flatArgs.push(`table.cell(${cellArgs.join(', ')})[${body}]`);
            } else {
                flatArgs.push(`[${body}]`);
            }
        }
    }

    const encoded = `${LF_TABLE_MARKER}${base64EncodeUtf8(JSON.stringify(payload))}*/`;

    const captionRaw = (payload.caption ?? '').trim();
    const label = settings.tableCaptionNumbering ? `表${tableIndex} ` : '';
    const captionText = (label + captionRaw).trim() ? (label + captionRaw) : '';
    const captionLine = captionText ? `#align(center)[${captionText}]\n` : '';
    // Use #table directly inside #align, with width on individual columns or wrap table in a box.
    // Correct Typst syntax: #align(center)[#block(width: ...)[#table(...)]]
    const tableLine = `#align(center)[#block(width: ${width})[#table(columns: ${columns}, ${align}, ${stroke}, ${flatArgs.join(', ')})]]${encoded}`;
    return `${captionLine}${tableLine}`;
}
