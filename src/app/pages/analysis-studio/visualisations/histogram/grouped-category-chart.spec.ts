import { buildGroupedCategoryClusters } from './grouped-category-chart';
import { createHistogram } from './histogram-chart';
import {
  HistogramChartData,
  HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP,
  histogramSeriesColor,
} from './histogram-data';

describe('grouped category chart', () => {
  const split: HistogramChartData = {
    bins: ['Male', 'Female'],
    counts: [30000, 27000],
    variableName: 'Sex',
    variableType: 'nominal',
    splitLabel: 'Dataset',
    groups: [
      { key: 'ds1', label: 'Dataset 1', counts: [10000, 9000] },
      { key: 'ds2', label: 'Dataset 2', counts: [10000, null] },
      { key: 'ds3', label: 'Dataset 3', counts: [10000, 9000] },
    ],
  };

  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '720px';
    document.body.appendChild(container);
  });

  afterEach(() => container.remove());

  const visibleText = (el: Element): string =>
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('');

  it('builds one cluster per group with one bar per category, colours in series order', () => {
    const clusters = buildGroupedCategoryClusters(split);

    expect(clusters.map((cluster) => cluster.label)).toEqual(['Dataset 1', 'Dataset 2', 'Dataset 3']);
    expect(clusters.map((cluster) => cluster.key)).toEqual(['ds1', 'ds2', 'ds3']);
    expect(clusters.map((cluster) => cluster.color)).toEqual([0, 1, 2].map(histogramSeriesColor));
    expect(clusters[0].bars).toEqual([{ bin: 'Male', count: 10000 }, { bin: 'Female', count: 9000 }]);
    // A count hidden by the privacy threshold stays null; it is not turned into 0.
    expect(clusters[1].bars[1]).toEqual({ bin: 'Female', count: null });
  });

  it('returns no clusters when the data is not split', () => {
    expect(buildGroupedCategoryClusters({ ...split, groups: undefined })).toEqual([]);
    expect(buildGroupedCategoryClusters({ ...split, groups: [] })).toEqual([]);
  });

  it('draws a split categorical histogram as one shared-axis chart with grouped bars', () => {
    createHistogram(split, container);

    // One <g> per plotted bin, each holding one bar per visible group.
    const bins = Array.from(container.querySelectorAll<SVGGElement>('g.grouped-category-bin'));
    expect(bins.length).toBe(2);
    expect(bins.map((bin) => bin.getAttribute('data-bin'))).toEqual(['Male', 'Female']);

    const bars = Array.from(container.querySelectorAll<SVGElement>('.grouped-category-bar'));
    expect(bars.length).toBe(6);
    expect(bars.map((bar) => bar.getAttribute('data-group'))).toEqual(['ds1', 'ds2', 'ds3', 'ds1', 'ds2', 'ds3']);
    expect(bars.map((bar) => bar.getAttribute('fill'))).toEqual([
      histogramSeriesColor(0), histogramSeriesColor(1), histogramSeriesColor(2),
      histogramSeriesColor(0), histogramSeriesColor(1), histogramSeriesColor(2),
    ]);

    // The printed axis is bins only: no per-cluster or split label rows.
    expect(container.querySelector('.grouped-category-cluster')).toBeNull();
    expect(container.querySelector('.grouped-category-cluster-label')).toBeNull();
    expect(container.querySelector('.grouped-category-split-label')).toBeNull();

    // Each bin label is rendered exactly once, centred on its group cluster.
    const binLabels = Array.from(container.querySelectorAll('.grouped-category-bin-label')).map(visibleText);
    expect(binLabels).toEqual(['Male', 'Female']);
  });

  it('draws a privacy-hidden count as a zero-height bar', () => {
    createHistogram(split, container);

    const masked = container.querySelector('.grouped-category-bar[data-bin="Female"][data-group="ds2"]');
    expect(masked).not.toBeNull();
    expect(Number(masked!.getAttribute('height'))).toBe(0);
    expect(container.querySelector('.grouped-category-bar-count')?.textContent).toContain('10k');
  });

  it('gives the taller bar of a bin the larger height', () => {
    createHistogram({
      ...split,
      groups: [
        { key: 'ds1', label: 'Dataset 1', counts: [10000, 1000] },
        { key: 'ds2', label: 'Dataset 2', counts: [10000, null] },
      ],
    }, container);

    const firstMale = container.querySelector<SVGElement>(
      '.grouped-category-bar[data-bin="Male"][data-group="ds1"]'
    );
    const firstFemale = container.querySelector<SVGElement>(
      '.grouped-category-bar[data-bin="Female"][data-group="ds1"]'
    );
    expect(Number(firstMale!.getAttribute('height'))).toBeGreaterThan(Number(firstFemale!.getAttribute('height')));

    expect(
      Array.from(container.querySelectorAll('.grouped-category-bar-count[data-bin="Male"]')).map(
        (label) => label.textContent
      )
    ).toEqual(['10k', '10k']);
  });

  it('rotates and truncates bin labels that cannot fit their band, keeping the full text', () => {
    const dense: HistogramChartData = {
      bins: ['A very long cerebral infarction phenotype name', 'Another long cerebral infarction phenotype name', 'Third long phenotype name'],
      counts: [30000, 27000, 12000],
      variableName: 'Diagnosis',
      variableType: 'nominal',
      splitLabel: 'Dataset',
      groups: [
        { key: 'ds1', label: 'Dataset 1', counts: [10000, 9000, 4000] },
        { key: 'ds2', label: 'Dataset 2', counts: [10000, 9000, 4000] },
      ],
    };
    createHistogram(dense, container);

    const labels = Array.from(container.querySelectorAll<SVGTextElement>('.grouped-category-bin-label'));
    expect(labels.length).toBe(3);
    expect(labels.every((label) => label.getAttribute('text-anchor') === 'end')).toBe(true);
    expect(labels.every((label) => String(label.getAttribute('transform')).startsWith('rotate(-35'))).toBe(true);
    expect(labels.some((label) => visibleText(label).endsWith('…'))).toBe(true);
    expect(labels.map((label) => label.querySelector('title')?.textContent))
      .toEqual(dense.bins);
    // The bottom margin grew to hold the rotated labels.
    expect(Number(container.querySelector('svg')!.getAttribute('height'))).toBeGreaterThan(360);
  });

  it('keeps numeric splits stacked and unsplit categories unchanged', () => {
    createHistogram({ ...split, bins: ['0-10', '10-20'], variableType: 'real' }, container);
    expect(container.querySelector('g.grouped-category-bin')).toBeNull();

    createHistogram({ ...split, groups: undefined }, container);
    expect(container.querySelector('g.grouped-category-bin')).toBeNull();
  });

  it('keeps the colour slot of a hidden group for the remaining groups', () => {
    createHistogram(split, container, { hiddenGroups: new Set(['ds1']) });

    const bars = Array.from(container.querySelectorAll<SVGElement>('.grouped-category-bar'));
    expect(bars.map((bar) => bar.getAttribute('data-group'))).toEqual(['ds2', 'ds3', 'ds2', 'ds3']);
    expect(bars.map((bar) => bar.getAttribute('fill'))).toEqual([
      histogramSeriesColor(1), histogramSeriesColor(2),
      histogramSeriesColor(1), histogramSeriesColor(2),
    ]);
  });

  it('shows the shared histogram tooltip with the group label on hover', () => {
    createHistogram(split, container);

    const hits = Array.from(container.querySelectorAll('.bar-hit-area'));
    expect(hits).toHaveLength(6);
    hits[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const tooltip = container.querySelector('.histogram-chart-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('Sex');
    expect(tooltip?.textContent).toContain('Dataset 1');
    expect(tooltip?.textContent).toContain('Male');
    expect(tooltip?.textContent).toContain('Count');
    expect(tooltip?.textContent).toContain('10,000');
    expect(container.querySelector('rect.grouped-category-bar title')).toBeNull();

    const hovered = container.querySelector('.grouped-category-bar[data-bin="Male"][data-group="ds1"]');
    const other = container.querySelector('.grouped-category-bar[data-bin="Male"][data-group="ds2"]');
    expect(hovered?.getAttribute('opacity')).toBe('1');
    expect(other?.getAttribute('opacity')).toBe('0.45');
  });

  it('shows the privacy message when hovering a masked group bar', () => {
    createHistogram(split, container);

    const maskedHit = container.querySelector('.bar-hit-area[data-bin="Female"][data-group="ds2"]');
    expect(maskedHit).not.toBeNull();
    maskedHit!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const tooltip = container.querySelector('.histogram-chart-tooltip');
    expect(tooltip?.textContent).toContain('Dataset 2');
    expect(tooltip?.textContent).toContain('Female');
    expect(tooltip?.textContent).toContain(HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP);
  });

  it('draws Count and variable axis titles', () => {
    createHistogram(split, container);

    const yTitle = container.querySelector<SVGTextElement>('.grouped-category-y-title')!;
    const xTitle = container.querySelector<SVGTextElement>('.grouped-category-x-title')!;
    expect(yTitle.textContent).toBe('Count');
    expect(xTitle.textContent).toBe('Sex');
    expect(yTitle.style.fontWeight).toBe('500');
    expect(xTitle.style.fontWeight).toBe('500');
    expect(yTitle.style.textTransform).toBe('');
    expect(xTitle.style.textTransform).toBe('');
  });

  it('appends the unit to the x-axis title when the node carries one', () => {
    createHistogram({ ...split, units: 'code' }, container);
    expect(container.querySelector('.grouped-category-x-title')?.textContent).toBe('Sex (code)');
  });
});
