
// CJK fonts that lack native bold/italic variants - handled via global show rules in preamble
export const CJK_FONTS_NEED_FAKE_STYLE = ['SimSun', 'SimHei', 'KaiTi', 'FangSong'];

// Generate preamble with CJK font styling rules (for bold/italic simulation)
export function generateCjkStylePreamble(): string {
    return `// CJK font styling: simulate bold with stroke, italic with skew
#show strong: set text(stroke: 0.25pt)
#show emph: it => text(style: "normal")[#skew(ax: -12deg, it.body)]
// Set figure caption font to SimSun (宋体) instead of default Kaiti
#show figure.caption: set text(font: "SimSun")
`;
}
