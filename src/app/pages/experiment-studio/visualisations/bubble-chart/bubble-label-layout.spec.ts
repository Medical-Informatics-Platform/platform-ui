import {
  BUBBLE_LABEL_CHAR_WIDTH,
  GROUP_LABEL_WIDTH_RATIO,
  LEAF_LABEL_WIDTH_RATIO,
  fitBubbleLabel,
  pickVisibleLabels,
} from './bubble-label-layout';
import { createZoomableCirclePacking } from './zoomable-circle-packing';

const LONG_LABEL = 'Predicted risk (IST prognostic model)';

describe('fitBubbleLabel', () => {
  it('keeps a short label on one line without an ellipsis', () => {
    const fit = fitBubbleLabel('Demographics', 120, true);

    expect(fit?.lines).toEqual(['Demographics']);
  });

  it('returns null when the circle is too small to carry text', () => {
    expect(fitBubbleLabel('Demographics', 12, true)).toBeNull();
    expect(fitBubbleLabel('Sex', 8, false)).toBeNull();
  });

  it('wraps a long group label on at most two lines that fit the circle', () => {
    const radius = 60;
    const fit = fitBubbleLabel(LONG_LABEL, radius, true)!;

    expect(fit).not.toBeNull();
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    for (const line of fit.lines) {
      expect(line.length * fit.fontSize * BUBBLE_LABEL_CHAR_WIDTH).toBeLessThanOrEqual(radius * GROUP_LABEL_WIDTH_RATIO);
    }
    expect(fit.lines[0].startsWith('Predicted')).toBe(true);
    expect(fit.lines[fit.lines.length - 1].endsWith('…')).toBe(true);
  });

  it('lets a variable label use three lines', () => {
    const radius = 40;
    const fit = fitBubbleLabel('Systolic blood pressure at randomisation', radius, false)!;

    expect(fit).not.toBeNull();
    expect(fit.lines.length).toBe(3);
    for (const line of fit.lines) {
      expect(line.length * fit.fontSize * BUBBLE_LABEL_CHAR_WIDTH).toBeLessThanOrEqual(radius * LEAF_LABEL_WIDTH_RATIO);
    }
  });

  it('scales the font with the circle inside a readable range', () => {
    const small = fitBubbleLabel('Stroke', 40, true)!;
    const large = fitBubbleLabel('Stroke', 300, true)!;
    const leaf = fitBubbleLabel('Sex', 26, false)!;

    expect(small.fontSize).toBeGreaterThanOrEqual(11);
    expect(large.fontSize).toBeLessThanOrEqual(14);
    expect(large.fontSize).toBeGreaterThan(small.fontSize);
    expect(leaf.fontSize).toBeGreaterThanOrEqual(9);
    expect(leaf.fontSize).toBeLessThanOrEqual(12);
  });
});

describe('pickVisibleLabels', () => {
  const box = (x: number, y: number, priority: number) => ({ x, y, width: 100, height: 20, priority });

  it('keeps every label when nothing overlaps', () => {
    expect(pickVisibleLabels([box(0, 0, 1), box(0, 40, 2), box(200, 0, 3)])).toEqual([true, true, true]);
  });

  it('hides the lower priority label of an overlapping pair', () => {
    expect(pickVisibleLabels([box(0, 0, 1), box(50, 10, 5)])).toEqual([false, true]);
  });

  it('keeps a label whose only overlap is with a label that was already hidden', () => {
    // A overlaps B, B overlaps C, A and C are apart: B goes, C stays.
    expect(pickVisibleLabels([box(0, 0, 3), box(80, 0, 2), box(160, 0, 1)])).toEqual([true, false, true]);
  });

  it('treats boxes that only touch as not overlapping', () => {
    expect(pickVisibleLabels([box(0, 0, 1), box(100, 0, 2)])).toEqual([true, true]);
  });
});

describe('bubble chart labels on a crowded map', () => {
  let container: HTMLDivElement;
  let chart: ReturnType<typeof createZoomableCirclePacking>;

  const groupNames = [
    'Clinical assessment at admission',
    'Death and survival within the trial',
    'Hospitalization and discharge',
    LONG_LABEL,
    'Complications within 14 days',
    'Acute treatment and trial allocation',
    'Prestroke characteristics',
    'Follow-up at 6 months',
    'Demographics and event',
    'Admission imaging before randomisation',
    'Stroke characteristics',
    'Neurological deficits at admission',
  ];

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '420px';
    container.style.height = '420px';
    document.body.appendChild(container);

    chart = createZoomableCirclePacking(
      {
        label: 'IST',
        code: 'ist',
        children: groupNames.map((label, groupIndex) => ({
          label,
          code: `group_${groupIndex}`,
          children: Array.from({ length: 2 + (groupIndex % 3) }, (_, leafIndex) => ({
            code: `var_${groupIndex}_${leafIndex}`,
            label: `Variable ${groupIndex}-${leafIndex}`,
            type: 'real',
            value: 1,
          })),
        })),
      },
      container,
      () => undefined,
      () => undefined,
    );
  });

  afterEach(() => {
    chart.destroy?.();
    container.remove();
  });

  const visibleLabels = (): SVGTextElement[] =>
    Array.from(container.querySelectorAll<SVGGElement>('g.label-group'))
      .filter((group) => group.style.display !== 'none')
      .map((group) => group.querySelector<SVGTextElement>('text'))
      .filter((text): text is SVGTextElement => !!text);

  it('draws group labels at a size that fits their circle', () => {
    const labels = visibleLabels();

    expect(labels.length).toBeGreaterThan(0);
    for (const text of labels) {
      expect(parseFloat(text.style.fontSize)).toBeLessThanOrEqual(14);
      expect(text.querySelectorAll('tspan').length).toBeLessThanOrEqual(2);
    }
  });

  it('never draws two labels on top of each other', () => {
    const rects = visibleLabels().map((text) => text.getBoundingClientRect());
    const overlaps: string[] = [];

    rects.forEach((a, i) => {
      rects.slice(i + 1).forEach((b, offset) => {
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 1 && overlapY > 1) overlaps.push(`${i} over ${i + 1 + offset}`);
      });
    });

    expect(rects.length).toBeGreaterThan(0);
    expect(overlaps).toEqual([]);
  });
});
