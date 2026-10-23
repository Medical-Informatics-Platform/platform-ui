/**
 * Categorical series colours, assigned in this order and never cycled past the end.
 * Slots 1-3 are the MIP charter (primary, primary-light, accent); 4-8 are hues picked
 * so every adjacent pair stays apart for deuteranopia/protanopia (worst ΔE 15.2) and
 * for full colour vision (worst ΔE 15.6). Slots 2, 3, 6 and 8 sit under 3:1 on white,
 * so a chart using them always carries a legend and the table view below it.
 */
export const CHART_SERIES_COLORS = [
  '#2b33e9',
  '#7f9ce8',
  '#ffba08',
  '#e34948',
  '#4a3aa7',
  '#e87ba4',
  '#008300',
  '#1baf7a',
];

/** Signed heatmap scale from -1 to 1: red below zero, neutral grey at zero, primary blue above. */
export const DIVERGING_COLORS = ['#e34948', '#f1f5f9', '#2b33e9'];

/**
 * Text colour for a value printed on a cell shaded by DIVERGING_COLORS (or its grey-to-blue half),
 * given the cell's place on that scale. Ink stays at 4.5:1 or better across the red half, so white
 * only takes over on the deep blue end, where it beats ink.
 */
export function cellLabelColor(scalePosition: number): string {
  return scalePosition >= 0.7 ? '#ffffff' : '#0f172a';
}
