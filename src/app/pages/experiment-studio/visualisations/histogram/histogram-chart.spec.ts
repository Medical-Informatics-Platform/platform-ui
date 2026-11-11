import {
  clipHistogramNullEdges,
  createHistogram,
  describeClippedNullEdges,
  formatClippedNullEdgesNote,
  orderHorizontalBarRows,
  selectXTickValues,
  shouldClipNullEdges,
  withoutHiddenGroups,
  wrapCategoryLabel,
} from './histogram-chart';
import {
  HISTOGRAM_EDGE_PRIVACY_TOOLTIP,
  HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP,
  histogramSeriesColor,
} from './histogram-data';

describe('wrapCategoryLabel', () => {
  it('keeps short labels on a single line', () => {
    expect(wrapCategoryLabel('Age')).toEqual(['Age']);
    expect(wrapCategoryLabel('Detailed acute treatment')).toEqual(['Detailed acute treatment']);
  });

  it('breaks long labels at a space near the midpoint', () => {
    expect(wrapCategoryLabel('Cerebrovascular risk assessment protocol')).toEqual([
      'Cerebrovascular risk',
      'assessment protocol',
    ]);
  });

  it('breaks at the only space when it is the nearest break point', () => {
    // 30 chars, single space at index 25 -> the only available word break.
    expect(wrapCategoryLabel('abcdefghijklmnopqrstuvwxy z123')).toEqual([
      'abcdefghijklmnopqrstuvwxy',
      'z123',
    ]);
  });

  it('keeps a label with no space on one line', () => {
    expect(wrapCategoryLabel('abcdefghijklmnopABCDEFGHIJKLMNOP')).toEqual([
      'abcdefghijklmnopABCDEFGHIJKLMNOP',
    ]);
  });

  it('returns the empty label unchanged', () => {
    expect(wrapCategoryLabel('')).toEqual(['']);
  });
});

describe('clipHistogramNullEdges', () => {
  it('trims leading and trailing null counts but keeps interior null bins', () => {
    expect(clipHistogramNullEdges(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      [44, null, 10, 22, 84, 266, 1214, 3106, 2802, 470, 206, 50, 46, null, null]
    )).toEqual({
      bins: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
      counts: [44, null, 10, 22, 84, 266, 1214, 3106, 2802, 470, 206, 50, 46],
    });
  });

  it('trims trailing null counts on edge-based histograms', () => {
    expect(clipHistogramNullEdges(
      [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      [null, 190000, 20000, 5000, null, null, null, null, null, null]
    )).toEqual({
      bins: ['10', '20', '30'],
      counts: [190000, 20000, 5000],
    });
  });

  it('keeps categorical bins aligned with counts', () => {
    expect(clipHistogramNullEdges(
      ['A', 'B', 'C', 'D'],
      [null, 3, 5, null]
    )).toEqual({
      bins: ['B', 'C'],
      counts: [3, 5],
    });
  });

  it('returns empty data when all counts are null', () => {
    expect(clipHistogramNullEdges([0, 10, 20], [null, null])).toEqual({
      bins: [],
      counts: [],
    });
  });

  it('clips grouped counts with the same window as the totals', () => {
    expect(clipHistogramNullEdges(
      [0, 1, 2, 3],
      [null, 10, 20, null],
      [{ key: 'a', label: 'A', counts: [1, 4, 8, 2] }]
    )).toEqual({
      bins: ['1', '2'],
      counts: [10, 20],
      groups: [{ key: 'a', label: 'A', counts: [4, 8] }],
    });
  });
});

describe('selectXTickValues', () => {
  const denseBins = ['110', '115', '120', '125', '130', '135', '140', '145', '150', '155', '160', '165', '170', '175', '180', '185', '190', '195', '200', '205', '210', '215'];

  it('keeps all labels when there is enough width', () => {
    expect(selectXTickValues(['110', '115', '120'], 400, 3)).toEqual(['110', '115', '120']);
  });

  it('subsamples dense multi-digit numeric labels', () => {
    const ticks = selectXTickValues(denseBins, 529, 3);
    expect(ticks.length).toBeLessThan(denseBins.length);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks[0]).toBe('110');
    expect(ticks[ticks.length - 1]).toBe('215');
  });

  it('does not place the last bin right next to the previous tick', () => {
    const ticks = selectXTickValues(denseBins, 529, 3);
    const indices = ticks.map((tick) => denseBins.indexOf(tick));
    const gaps = indices.slice(1).map((index, i) => index - indices[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(gaps[0]);
  });
});

describe('orderHorizontalBarRows', () => {
  it('keeps numeric histogram bins in value order', () => {
    expect(orderHorizontalBarRows(['30', '45', '60'], [10, 80, 20])).toEqual([
      { bin: '30', count: 10 },
      { bin: '45', count: 80 },
      { bin: '60', count: 20 },
    ]);
  });

  it('sorts named group bins by count descending', () => {
    expect(orderHorizontalBarRows(['Acute', 'Hospitalization'], [4, 12])).toEqual([
      { bin: 'Hospitalization', count: 12 },
      { bin: 'Acute', count: 4 },
    ]);
  });
});

describe('shouldClipNullEdges', () => {
  it('returns true for numeric bins', () => {
    expect(shouldClipNullEdges([0, 1, 2, 3])).toBe(true);
  });

  it('returns false for nominal bins', () => {
    expect(shouldClipNullEdges(['yes', 'no', 'unknown'])).toBe(false);
  });
});

describe('describeClippedNullEdges', () => {
  it('returns the trimmed bin edges', () => {
    expect(describeClippedNullEdges(
      [0, 10, 20, 30, 40],
      [null, 5, 8, null, null]
    )).toEqual({ below: '10', above: '30' });
  });

  it('is null when nothing was trimmed or bins are nominal', () => {
    expect(describeClippedNullEdges([0, 10, 20], [4, 5, 6])).toBeNull();
    expect(describeClippedNullEdges(['yes', 'no'], [null, 3])).toBeNull();
  });

  it('formats the Data Exploration warning from those edges', () => {
    expect(formatClippedNullEdgesNote({ below: '10', above: '30' })).toBe(
      'Values below 10 / above 30 masked (too few records per bin for privacy). Review outliers in Data Handling.'
    );
    expect(formatClippedNullEdgesNote({ below: null, above: '85' })).toBe(
      'Values above 85 masked (too few records per bin for privacy). Review outliers in Data Handling.'
    );
    expect(formatClippedNullEdgesNote(null)).toBeNull();
  });
});

describe('createHistogram with floating-point bin edges', () => {
  let container: HTMLDivElement;

  afterEach(() => {
    container?.remove();
  });

  it('sizes the plot from formatted labels so it stays inside the container', () => {
    container = document.createElement('div');
    container.style.width = '511px';
    document.body.appendChild(container);
    const bins = Array.from({ length: 30 }, (_, i) => String(i * 0.02 - Number.EPSILON * i));
    const counts = bins.map((_, i) => 1000 - i * 30);

    createHistogram({ bins, counts, variableName: 'Predicted death', variableType: 'real' }, container, {});

    const svg = container.querySelector('svg')!;
    expect(Number(svg.getAttribute('width'))).toBe(511);
    const translateX = parseFloat(svg.querySelector(':scope > g')!.getAttribute('transform')!.slice('translate('.length));
    expect(translateX).toBeLessThan(120);
    const tickText = Array.from(container.querySelectorAll('.tick text')).map((t) => t.textContent);
    expect(tickText.every((t) => (t ?? '').length <= 4)).toBe(true);
  });
});

describe('withoutHiddenGroups', () => {
  const data = {
    bins: ['0', '10'],
    counts: [10, 20],
    groups: [
      { key: 'a', label: 'A', counts: [4, null] },
      { key: 'b', label: 'B', counts: [5, null] },
    ],
  };

  it('re-totals each bin from the groups still shown plus the masked remainder', () => {
    const filtered = withoutHiddenGroups(data, new Set(['b']));
    expect(filtered.groups?.map((group) => group.key)).toEqual(['a']);
    // Bin 0: A's 4 plus the 1 no group accounts for. Bin 1: both groups masked, all 20 stay.
    expect(filtered.counts).toEqual([5, 20]);
  });

  it('keeps a privacy-null bin total null', () => {
    const filtered = withoutHiddenGroups({ ...data, counts: [null, 20] }, new Set(['b']));
    expect(filtered.counts[0]).toBeNull();
  });

  it('returns the data unchanged when nothing is hidden', () => {
    expect(withoutHiddenGroups(data, new Set())).toBe(data);
  });
});

describe('createHistogram stacked groups', () => {
  const unsplit = {
    bins: ['0', '10', '20'],
    counts: [10, 20, 30],
    variableName: 'Age',
  };
  const groups = [
    { key: 'a', label: 'Group A', counts: [4, 8, 10] },
    { key: 'b', label: 'Group B', counts: [4, 8, 10] },
  ];
  let container: HTMLDivElement;
  let unsplitContainer: HTMLDivElement;

  afterEach(() => {
    container?.remove();
    unsplitContainer?.remove();
  });

  function mount(): HTMLDivElement {
    const host = document.createElement('div');
    host.style.width = '480px';
    document.body.appendChild(host);
    return host;
  }

  it('draws stacked segments per bin and a residual when groups do not sum', () => {
    container = mount();
    createHistogram({ ...unsplit, groups, splitLabel: 'Dataset' }, container, {});

    const bars = Array.from(container.querySelectorAll('.bar'));
    expect(bars).toHaveLength(9);
    expect(container.querySelectorAll('.bar-residual')).toHaveLength(3);
    expect(container.querySelectorAll('.bar-value')).toHaveLength(3);
  });

  it('drops a hidden group but keeps the masked remainder drawn', () => {
    container = mount();
    createHistogram({ ...unsplit, groups, splitLabel: 'Dataset' }, container, { hiddenGroups: new Set(['b']) });

    expect(container.querySelectorAll('.bar[data-group="b"]')).toHaveLength(0);
    expect(container.querySelectorAll('.bar[data-group="a"]')).toHaveLength(3);
    // Totals 10/20/30 minus both groups leave 2/4/10 masked; hiding B must not hide them.
    expect(container.querySelectorAll('.bar-residual')).toHaveLength(3);
    expect(container.querySelector('.histogram-legend')).toBeNull();
  });

  it('keeps a hidden group\'s colour slot so the others keep their colours', () => {
    container = mount();
    createHistogram({ ...unsplit, groups, splitLabel: 'Dataset' }, container, { hiddenGroups: new Set(['a']) });
    const bar = container.querySelector('.bar[data-group="b"]');
    expect(bar?.getAttribute('fill')).toBe(histogramSeriesColor(1));
  });

  it('does not draw a slate box around bars or yellow segments', () => {
    container = mount();
    createHistogram({
      ...unsplit,
      groups: [
        ...groups,
        { key: 'c', label: 'Group C', counts: [2, 4, 10] },
      ],
    }, container, {});

    for (const bar of Array.from(container.querySelectorAll('.bar'))) {
      const stroke = bar.getAttribute('stroke');
      expect(stroke === null || stroke === 'none').toBe(true);
    }
    expect(container.querySelector('[stroke="#475569"]')).toBeNull();
    const hue = Array.from(container.querySelectorAll('.bar-hue-edge')).map(
      (line) => line.getAttribute('stroke')
    );
    expect(hue.length).toBeGreaterThan(0);
    expect(hue.every((color) => color === '#d99a00')).toBe(true);
  });

  it('fades other stacks on hover', () => {
    container = mount();
    createHistogram({ ...unsplit, groups }, container, {});

    const hits = Array.from(container.querySelectorAll('.bar-hit-area'));
    hits[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const hovered = Array.from(container.querySelectorAll('.bar[data-index="0"]'));
    const other = Array.from(container.querySelectorAll('.bar[data-index="1"]'));
    expect(hovered.every((bar) => bar.getAttribute('opacity') === '1')).toBe(true);
    expect(other.every((bar) => bar.getAttribute('opacity') === '0.45')).toBe(true);
    expect(container.querySelector('.histogram-chart-tooltip')?.textContent).toContain('Total');
  });

  it('keeps the stacked bar height equal to the unsplit total', () => {
    unsplitContainer = mount();
    container = mount();
    createHistogram(unsplit, unsplitContainer, {});
    createHistogram({ ...unsplit, groups }, container, {});

    const unsplitBars = Array.from(unsplitContainer.querySelectorAll('.bar'));
    expect(unsplitBars).toHaveLength(3);
    for (let index = 0; index < 3; index += 1) {
      const unsplitHeight = (unsplitBars[index] as SVGGraphicsElement).getBBox().height;
      const stackedHeight = Array.from(container.querySelectorAll(`.bar[data-index="${index}"]`))
        .reduce((sum, bar) => sum + (bar as SVGGraphicsElement).getBBox().height, 0);
      expect(stackedHeight).toBeCloseTo(unsplitHeight, 0);
    }
  });
});

describe('createHistogram numeric bins', () => {
  let container: HTMLDivElement;

  afterEach(() => {
    container?.remove();
  });

  function barLeft(bar: Element): number {
    const match = (bar.getAttribute('d') ?? '').match(/^M([\d.]+),/);
    return match ? Number(match[1]) : NaN;
  }

  function barRight(bar: Element): number {
    const match = (bar.getAttribute('d') ?? '').match(/H([\d.]+)/);
    return match ? Number(match[1]) : NaN;
  }

  it('draws adjacent numeric bars with no gaps', () => {
    container = document.createElement('div');
    container.style.width = '480px';
    document.body.appendChild(container);
    createHistogram({ bins: ['0', '10', '20'], counts: [10, 20, 30], variableName: 'Age' }, container, {});

    const bars = Array.from(container.querySelectorAll('.bar'));
    expect(bars).toHaveLength(3);
    expect(Math.abs(barRight(bars[0]) - barLeft(bars[1]))).toBeLessThanOrEqual(1);
    expect(Math.abs(barRight(bars[1]) - barLeft(bars[2]))).toBeLessThanOrEqual(1);
    expect(container.querySelectorAll('.bar-value')).toHaveLength(3);
  });

  it('hides total labels when bars are too narrow', () => {
    container = document.createElement('div');
    container.style.width = '200px';
    document.body.appendChild(container);
    createHistogram({
      bins: Array.from({ length: 20 }, (_, i) => String(i)),
      counts: Array.from({ length: 20 }, () => 10),
      variableName: 'Age',
    }, container, {});

    expect(container.querySelectorAll('.bar-value')).toHaveLength(0);
  });

  it('draws adjacent numeric bars with no gaps when stacked', () => {
    container = document.createElement('div');
    container.style.width = '480px';
    document.body.appendChild(container);
    createHistogram({
      bins: ['0', '10', '20'],
      counts: [10, 20, 30],
      groups: [
        { key: 'a', label: 'A', counts: [4, 8, 10] },
        { key: 'b', label: 'B', counts: [6, 12, 20] },
      ],
      variableName: 'Age',
      splitLabel: 'Sex',
    }, container, {});

    const bars = [0, 1, 2].map((index) => container.querySelector(`.bar[data-index="${index}"]`)!);
    expect(Math.abs(barRight(bars[0]) - barLeft(bars[1]))).toBeLessThanOrEqual(1);
    expect(Math.abs(barRight(bars[1]) - barLeft(bars[2]))).toBeLessThanOrEqual(1);
  });

  it('keeps gaps between nominal bars', () => {
    container = document.createElement('div');
    container.style.width = '480px';
    document.body.appendChild(container);
    createHistogram({ bins: ['Female', 'Male'], counts: [12, 8], variableName: 'Sex' }, container, {});

    const bars = Array.from(container.querySelectorAll('.bar'));
    expect(bars).toHaveLength(2);
    expect(barRight(bars[0])).toBeLessThan(barLeft(bars[1]) - 1);
  });
});

describe('createHistogram privacy stubs', () => {
  let container: HTMLDivElement;

  afterEach(() => {
    container?.remove();
  });

  it('trims privacy-null edges by default and does not hatch them', () => {
    container = document.createElement('div');
    container.style.width = '480px';
    document.body.appendChild(container);
    createHistogram(
      { bins: ['0', '10', '20', '30'], counts: [null, 8, 12, null], variableName: 'Age' },
      container,
      {}
    );

    expect(container.querySelectorAll('.bar-privacy-stub')).toHaveLength(0);
    expect(container.querySelectorAll('.bar')).toHaveLength(2);
  });

  it('keeps edge nulls and hatches them when clipping is off', () => {
    container = document.createElement('div');
    container.style.width = '480px';
    document.body.appendChild(container);
    createHistogram(
      { bins: ['0', '10', '20', '30'], counts: [null, 8, null, 4], variableName: 'Age' },
      container,
      { clipNullEdges: false }
    );

    const stubs = Array.from(container.querySelectorAll('.bar-privacy-stub'));
    expect(stubs).toHaveLength(2);
    expect(container.querySelectorAll('.bar:not(.bar-privacy-stub)')).toHaveLength(2);

    const hits = Array.from(container.querySelectorAll('.bar-hit-area'));
    hits[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(container.querySelector('.histogram-chart-tooltip')?.textContent).toContain(HISTOGRAM_EDGE_PRIVACY_TOOLTIP);

    hits[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(container.querySelector('.histogram-chart-tooltip')?.textContent).toContain(HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP);
  });

  it('treats every bin in a leading or trailing null run as an edge', () => {
    container = document.createElement('div');
    container.style.width = '480px';
    document.body.appendChild(container);
    createHistogram(
      { bins: ['0', '10', '20', '30', '40'], counts: [null, null, 8, null, null], variableName: 'Age' },
      container,
      { clipNullEdges: false }
    );

    const hits = Array.from(container.querySelectorAll('.bar-hit-area'));
    for (const index of [1, 3]) {
      hits[index].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(container.querySelector('.histogram-chart-tooltip')?.textContent).toContain(HISTOGRAM_EDGE_PRIVACY_TOOLTIP);
    }
  });
});

describe('createHistogram in an unlaid-out container', () => {
  const SAMPLE = {
    bins: ['0-1', '1-2', '2-3', '3-4', '4-5'],
    counts: [12, 30, 22, 5, 1],
    variableName: 'Age',
  };
  let host: HTMLDivElement;

  afterEach(() => {
    host?.remove();
  });

  /** Mirrors a Studio step hidden with `display: none`: every getBBox() is empty. */
  function hiddenContainer(): HTMLDivElement {
    host = document.createElement('div');
    host.style.display = 'none';
    const container = document.createElement('div');
    container.style.width = '480px';
    host.appendChild(container);
    document.body.appendChild(host);
    return container;
  }

  it('keeps the computed height for the vertical chart', () => {
    const container = hiddenContainer();
    createHistogram(SAMPLE, container, {});

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(Number(svg!.getAttribute('height'))).toBeGreaterThan(150);
    expect(parseFloat(container.style.height)).toBeGreaterThan(150);
  });

  it('keeps the computed height for the horizontal chart', () => {
    const container = hiddenContainer();
    createHistogram(SAMPLE, container, { orientation: 'horizontal' });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(Number(svg!.getAttribute('height'))).toBeGreaterThan(150);
    expect(parseFloat(container.style.height)).toBeGreaterThan(150);
  });
});
