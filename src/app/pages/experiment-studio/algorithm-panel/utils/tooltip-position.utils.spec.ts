import { tooltipPosition } from './tooltip-position.utils';

describe('tooltipPosition', () => {
  const container = new DOMRect(100, 50, 1000, 800);
  const placement = { width: 320, height: 200, viewportWidth: 1280, viewportHeight: 800, padding: 16, offset: 12 };

  it('places the tooltip right of the item, centred, relative to the container', () => {
    expect(tooltipPosition(new DOMRect(200, 300, 100, 40), container, placement)).toEqual({ x: 212, y: 170 });
  });

  it('flips left when there is no room on the right and clamps to the viewport', () => {
    expect(tooltipPosition(new DOMRect(1000, 700, 100, 40), container, placement)).toEqual({ x: 568, y: 534 });
  });
});
