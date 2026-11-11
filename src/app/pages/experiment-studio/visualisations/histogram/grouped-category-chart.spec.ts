import { buildGroupedCategoryClusters } from './grouped-category-chart';
import { createHistogram } from './histogram-chart';
import { HistogramChartData, histogramSeriesColor } from './histogram-data';

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

  it('draws a split categorical histogram as side-by-side clusters', () => {
    createHistogram(split, container);

    const clusters = Array.from(container.querySelectorAll<SVGGElement>('g.grouped-category-cluster'));
    expect(clusters.length).toBe(3);
    for (const [index, cluster] of clusters.entries()) {
      const bars = Array.from(cluster.querySelectorAll<SVGRectElement>('rect.grouped-category-bar'));
      expect(bars.length).toBe(2);
      expect(bars.every((bar) => bar.getAttribute('fill') === histogramSeriesColor(index))).toBe(true);
    }
    const text = container.textContent ?? '';
    expect(text).toContain('Dataset 2');
    expect(text).toContain('Male');
    expect(text).toContain('Female');
  });

  it('gives the taller bar of a cluster the larger height', () => {
    createHistogram(split, container);

    const first = container.querySelector('g.grouped-category-cluster')!;
    const [male, female] = Array.from(first.querySelectorAll<SVGRectElement>('rect.grouped-category-bar'));
    expect(Number(male.getAttribute('height'))).toBeGreaterThan(Number(female.getAttribute('height')));
  });

  it('keeps numeric splits stacked and unsplit categories unchanged', () => {
    createHistogram({ ...split, bins: ['0-10', '10-20'], variableType: 'real' }, container);
    expect(container.querySelector('g.grouped-category-cluster')).toBeNull();

    createHistogram({ ...split, groups: undefined }, container);
    expect(container.querySelector('g.grouped-category-cluster')).toBeNull();
  });
});
