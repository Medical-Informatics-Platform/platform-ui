import { computeGuideBlockingRects, measureGuideInteractionRect } from './experiment-studio-guide-mask.util';

describe('computeGuideBlockingRects', () => {
  it('returns blockers around a single interaction hole without covering it', () => {
    const hole = { top: 100, left: 80, right: 620, bottom: 640, width: 540, height: 540 };
    const blockers = computeGuideBlockingRects([hole], { right: 1200, bottom: 800 });

    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.some((rect) => rect.top === 0 && rect.bottom === hole.top)).toBeTrue();
    expect(blockers.some((rect) => rect.top === hole.bottom && rect.bottom === 800)).toBeTrue();
    expect(blockers.every((rect) =>
      rect.right <= hole.left
      || rect.left >= hole.right
      || rect.bottom <= hole.top
      || rect.top >= hole.bottom
    )).toBeTrue();
  });

  it('keeps separate holes open for multi-target interaction steps', () => {
    const browser = { top: 120, left: 80, right: 620, bottom: 640, width: 540, height: 520 };
    const details = { top: 360, left: 660, right: 1180, bottom: 760, width: 520, height: 400 };
    const blockers = computeGuideBlockingRects([browser, details], { right: 1200, bottom: 800 });

    const intersects = (rect: { left: number; right: number; top: number; bottom: number }) =>
      blockers.some((blocker) =>
        blocker.left < rect.right
        && blocker.right > rect.left
        && blocker.top < rect.bottom
        && blocker.bottom > rect.top
      );

    expect(intersects(browser)).toBeFalse();
    expect(intersects(details)).toBeFalse();
    expect(blockers.some((rect) => rect.left === 620 && rect.right === 660)).toBeTrue();
  });

  it('expands interaction holes to include visible search suggestions', () => {
    const host = document.createElement('section');
    const search = document.createElement('div');
    search.className = 'search-container';
    const suggestions = document.createElement('div');
    suggestions.className = 'suggestions-container';
    host.appendChild(search);
    host.appendChild(suggestions);

    spyOn(host, 'getBoundingClientRect').and.returnValue({
      top: 120,
      right: 620,
      bottom: 220,
      left: 80,
      width: 540,
      height: 100,
      x: 80,
      y: 120,
      toJSON: () => ({}),
    } as DOMRect);
    spyOn(suggestions, 'getBoundingClientRect').and.returnValue({
      top: 228,
      right: 620,
      bottom: 420,
      left: 80,
      width: 540,
      height: 192,
      x: 80,
      y: 228,
      toJSON: () => ({}),
    } as DOMRect);

    const measured = measureGuideInteractionRect(host);

    expect(measured.top).toBe(110);
    expect(measured.bottom).toBe(430);
  });
});
