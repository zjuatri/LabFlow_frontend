import { LF_TABLE_MARKER, LF_IMAGE_MARKER, LF_CHART_MARKER } from '../utils';

export function shouldSkipCaptionLine(lines: string[], currentIndex: number, skipNextCaption: boolean): boolean {
    const nextFew = Array.from({ length: 6 }, (_, k) => lines[currentIndex + 1 + k])
        .filter((x) => typeof x === 'string')
        .map((x) => (x as string).replace(/\r$/, '').trim());
    const prev = lines[currentIndex - 1]?.replace(/\r$/, '').trim() ?? '';

    if (nextFew.some((x) => x.includes(LF_TABLE_MARKER))) return true;
    if (nextFew.some((x) => x.includes(LF_IMAGE_MARKER))) return true;
    if (nextFew.some((x) => x.includes(LF_CHART_MARKER))) return true;
    if (skipNextCaption && prev.includes(LF_IMAGE_MARKER)) return true;
    if (skipNextCaption && prev.includes(LF_CHART_MARKER)) return true;

    return false;
}
