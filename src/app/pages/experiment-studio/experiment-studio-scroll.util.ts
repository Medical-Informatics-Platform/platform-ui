const FALLBACK_HEADER_HEIGHT = 64;
const SECTION_SCROLL_GAP = 48;

function cssPixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getExperimentStudioScrollOffset(): number {
  const rootStyles = getComputedStyle(document.documentElement);
  const headerHeight = cssPixelValue(rootStyles.getPropertyValue('--header-height'), FALLBACK_HEADER_HEIGHT);
  const studioPage = document.querySelector<HTMLElement>('.experiment-studio-page');
  const warningSpace = studioPage
    ? cssPixelValue(getComputedStyle(studioPage).getPropertyValue('--warning-banner-space'), 0)
    : 0;

  return headerHeight + warningSpace + SECTION_SCROLL_GAP;
}
