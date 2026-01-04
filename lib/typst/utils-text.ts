// Re-export specific modules
export * from './utils/tokenizer';
export * from './utils/sanitizer';

// Spacing Utilities
export const defaultParagraphLeadingEm = 0.8;
export const supportedLineSpacingMultipliers = [0.8, 0.9, 1, 1.2, 1.5, 2] as const;

export const snapLineSpacingMultiplier = (m: number): number | undefined => {
    if (!Number.isFinite(m)) return undefined;
    let best: number = supportedLineSpacingMultipliers[0];
    let bestDiff = Math.abs(m - best);
    for (const opt of supportedLineSpacingMultipliers) {
        const d = Math.abs(m - opt);
        if (d < bestDiff) {
            bestDiff = d;
            best = opt as number;
        }
    }
    // Keep it conservative: if it's far from known options, treat as unset.
    if (bestDiff > 0.12) return undefined;
    if (best === 1) return undefined;
    return best;
};

export const leadingEmFromMultiplier = (m: number): number => {
    const v = defaultParagraphLeadingEm * m;
    return Math.round(v * 1000) / 1000;
};

export const inferLineSpacingMultiplier = (leadingEm: number): number | undefined => {
    if (!Number.isFinite(leadingEm)) return undefined;
    // If it exactly matches the default leading, treat as unset.
    if (Math.abs(leadingEm - defaultParagraphLeadingEm) < 1e-6) return undefined;

    // Legacy output used the multiplier directly as em (e.g. 1.2em).
    // New output uses defaultLeading * multiplier (e.g. 0.78em for 1.2x).
    let bestMultiplier: number | undefined = undefined;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (const m of supportedLineSpacingMultipliers) {
        const legacyEm = m;
        const newEm = defaultParagraphLeadingEm * m;
        const d = Math.min(Math.abs(leadingEm - legacyEm), Math.abs(leadingEm - newEm));
        if (d < bestDiff) {
            bestDiff = d;
            bestMultiplier = m as number;
        }
    }

    if (bestDiff > 0.12) return undefined;
    if (bestMultiplier === 1) return undefined;
    return bestMultiplier;
};
