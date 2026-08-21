// src/lib/config/chartColors.ts
//
// Single declared color source for dashboard donut charts (RFA + RFI), so a
// หมวดงาน keeps the same color everywhere it's charted, and a new status enum
// picks from the same muted/earthy theme instead of inventing its own palette.

/** Golden Angle hue distribution + earthy/muted saturation — the system's chart theme. */
export const CATEGORY_COLORS = [
  '#B83232', '#238C42', '#7640A8', '#A88C1A', '#1779A0',
  '#A02868', '#3E8826', '#3D44B0', '#B05618', '#1E8A60',
  '#C2185B', '#748C0A', '#1C6AAA', '#B8620A', '#1A7A40',
  '#6248B0', '#A87612', '#0F7A8C', '#9C2480', '#7A9214',
];

/** Hash a category name to a stable index, so its color never shifts when filters change. */
export function getCategoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

/** Same muted/earthy tones the status charts use, named so a different status enum
 * (RFI's, or a future module's) can reuse the exact hex instead of picking new ones. */
export const MUTED_PALETTE = {
  slateGrey: '#78909C',
  deepSlate: '#546E7A',
  blueGrey: '#607D8B',
  mossGreen: '#558B2F',
  mutedTeal: '#4DB6AC',
  mutedLime: '#C0CA33',
  terracotta: '#D87D4A',
  rust: '#A5574C',
} as const;
