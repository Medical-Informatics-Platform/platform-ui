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
