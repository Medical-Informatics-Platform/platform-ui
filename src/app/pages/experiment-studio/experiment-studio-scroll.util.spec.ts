import { getExperimentStudioScrollOffset } from './experiment-studio-scroll.util';

describe('getExperimentStudioScrollOffset', () => {
  let studioPage: HTMLDivElement | null = null;

  beforeEach(() => {
    // The util reads the live token, and the token is responsive (56px below 768px), so
    // pin it here. Otherwise the expectation depends on the karma browser's window width.
    document.documentElement.style.setProperty('--header-height', '64px');
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--header-height');
  });

  function createStudioPage(styleProperties: Record<string, string> = {}): void {
    studioPage = document.createElement('div');
    studioPage.className = 'experiment-studio-page';
    Object.entries(styleProperties).forEach(([property, value]) => {
      (studioPage as unknown as HTMLElement).style.setProperty(property, value);
    });
    document.body.appendChild(studioPage);
  }

  afterEach(() => {
    studioPage?.remove();
    studioPage = null;
  });

  it('calculates scroll offset based on fixed header height and content gap', () => {
    // header(64) + sub-header(44) + warning(0) + content gap(16) = 124
    expect(getExperimentStudioScrollOffset()).toBe(124);
  });

  it('accounts for the pathology warning banner space token', () => {
    createStudioPage({
      '--warning-banner-space': '96px',
    });
    // header(64) + sub-header(44) + warning(96) + content gap(16) = 220
    expect(getExperimentStudioScrollOffset()).toBe(220);
  });
});
