import {
    PersistedChartPayload,
} from './types';

export function defaultChartPayload(): PersistedChartPayload {
    return {
        chartType: 'scatter',
        title: '',
        xLabel: '',
        yLabel: '',
        legend: true,
        dataSource: 'manual',
        manualText: '',
        tableSelection: undefined,
        imageUrl: undefined,
    };
}

export function safeParseChartPayload(content: string): PersistedChartPayload {
    try {
        const parsedUnknown: unknown = JSON.parse(content);
        const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
        if (!isRecord(parsedUnknown)) return defaultChartPayload();
        const parsed = parsedUnknown;

        const chartTypeRaw = (parsed['chartType'] ?? 'scatter') as string;
        const chartType: PersistedChartPayload['chartType'] =
            chartTypeRaw === 'scatter' || chartTypeRaw === 'bar' || chartTypeRaw === 'pie' || chartTypeRaw === 'hbar'
                ? (chartTypeRaw as PersistedChartPayload['chartType'])
                : 'scatter';

        const dataSourceRaw = (parsed['dataSource'] ?? 'manual') as string;
        const dataSource = (dataSourceRaw === 'table' ? 'table' : 'manual') as PersistedChartPayload['dataSource'];

        const payload: PersistedChartPayload = {
            chartType,
            title: typeof parsed['title'] === 'string' ? (parsed['title'] as string) : '',
            xLabel: typeof parsed['xLabel'] === 'string' ? (parsed['xLabel'] as string) : '',
            yLabel: typeof parsed['yLabel'] === 'string' ? (parsed['yLabel'] as string) : '',
            legend: !!parsed['legend'],
            dataSource,
            manualText: typeof parsed['manualText'] === 'string' ? (parsed['manualText'] as string) : '',
            imageUrl: typeof parsed['imageUrl'] === 'string' ? (parsed['imageUrl'] as string) : undefined,
            tableSelection: undefined,
        };

        const selUnknown = parsed['tableSelection'];
        if (isRecord(selUnknown)) {
            const blockId = typeof selUnknown['blockId'] === 'string' ? (selUnknown['blockId'] as string) : '';
            const r1 = Number(selUnknown['r1']);
            const c1 = Number(selUnknown['c1']);
            const r2 = Number(selUnknown['r2']);
            const c2 = Number(selUnknown['c2']);
            if (blockId && Number.isFinite(r1) && Number.isFinite(c1) && Number.isFinite(r2) && Number.isFinite(c2)) {
                payload.tableSelection = { blockId, r1, c1, r2, c2 };
            }
        }

        return payload;
    } catch {
        return defaultChartPayload();
    }
}
