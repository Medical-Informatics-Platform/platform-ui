const FALLBACK_HEADER_HEIGHT = 64;
const FALLBACK_SUB_HEADER_HEIGHT = 44;
// Keeps in-page anchor targets comfortably clear of the fixed chrome.
const CONTENT_SCROLL_GAP = 16;

function cssPixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getExperimentStudioScrollOffset(): number {
  const rootStyles = getComputedStyle(document.documentElement);
  const headerHeight = cssPixelValue(rootStyles.getPropertyValue('--header-height'), FALLBACK_HEADER_HEIGHT);
  const studioPage = document.querySelector<HTMLElement>('.experiment-studio-page');
  const pageStyles = studioPage ? getComputedStyle(studioPage) : undefined;
  const subHeaderHeight = pageStyles
    ? cssPixelValue(pageStyles.getPropertyValue('--studio-sub-header-height'), FALLBACK_SUB_HEADER_HEIGHT)
    : FALLBACK_SUB_HEADER_HEIGHT;
  const warningSpace = pageStyles
    ? cssPixelValue(pageStyles.getPropertyValue('--warning-banner-space'), 0)
    : 0;

  return headerHeight + subHeaderHeight + warningSpace + CONTENT_SCROLL_GAP;
}
