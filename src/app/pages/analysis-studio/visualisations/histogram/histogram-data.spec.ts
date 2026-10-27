import {
  MAX_HISTOGRAM_SPLIT_LEVELS,
  buildHistogramSplitOptions,
  buildStackedHistogramSeries,
  histogramCacheKey,
  isNominalHistogramNode,
  residualCount,
} from './histogram-data';

describe('histogram split helpers', () => {
  it('disables a split variable missing from a selected dataset and names the datasets', () => {
    const options = buildHistogramSplitOptions({
      plottedCode: 'age',
      selectedVariables: [
        { code: 'sex', label: 'Sex', type: 'nominal', enumerations: ['M', 'F'] },
        { code: 'apoe', label: 'APOE', type: 'nominal', enumerations: ['0', '1'] },
      ],
      datasetLevelCount: 2,
      unavailableVariables: new Map([['apoe', ['ADNI', 'CHUV']], ['dataset', ['ADNI']]]),
    });

    expect(options.find((option) => option.code === 'dataset')).toEqual(
      expect.objectContaining({ disabled: false, title: 'Split bars by dataset' })
    );
    expect(options.find((option) => option.code === 'sex')?.disabled).toBe(false);
    expect(options.find((option) => option.code === 'apoe')).toEqual({
      code: 'apoe',
      label: 'APOE',
      disabled: true,
      title: 'Not available in: ADNI, CHUV',
      unavailable: true,
    });
  });

  it('offers Dataset plus selected nominal variables, excluding the plotted variable', () => {
    const options = buildHistogramSplitOptions({
      plottedCode: 'age',
      selectedVariables: [
        { code: 'sex', label: 'Sex', type: 'nominal', enumerations: ['M', 'F'] },
        { code: 'age', label: 'Age', type: 'nominal', enumerations: ['young', 'old'] },
        { code: 'dataset', label: 'Dataset', type: 'nominal', enumerations: ['a', 'b', 'c'] },
        { code: 'weight', label: 'Weight', type: 'continuous' },
        { code: 'subjectid', label: 'Subject', type: 'nominal' },
      ],
      datasetLevelCount: 2,
    });

    expect(options.map((option) => option.code)).toEqual(['dataset', 'sex']);
    expect(options.every((option) => !option.disabled)).toBe(true);
  });

  it(`disables splits with more than ${MAX_HISTOGRAM_SPLIT_LEVELS} levels`, () => {
    const options = buildHistogramSplitOptions({
      plottedCode: 'age',
      selectedVariables: [
        {
          code: 'site',
          label: 'Site',
          type: 'nominal',
          enumerations: Array.from({ length: MAX_HISTOGRAM_SPLIT_LEVELS + 1 }, (_, index) => index),
        },
      ],
      datasetLevelCount: MAX_HISTOGRAM_SPLIT_LEVELS + 2,
    });

    expect(options.find((option) => option.code === 'dataset')?.disabled).toBe(true);
    expect(options.find((option) => option.code === 'site')?.disabled).toBe(true);
  });

  it('treats nominal and categorical nodes as non-splittable plots', () => {
    expect(isNominalHistogramNode({ type: 'continuous' })).toBe(false);
    expect(isNominalHistogramNode({ type: 'discrete' })).toBe(false);
    expect(isNominalHistogramNode({ type: 'nominal' })).toBe(true);
    expect(isNominalHistogramNode({ type: 'ordinal' })).toBe(true);
    expect(isNominalHistogramNode({ type: 'binary' })).toBe(true);
    expect(isNominalHistogramNode({ type: 'real' })).toBe(false);
  });

  it('keys the histogram cache by variable and split', () => {
    expect(histogramCacheKey('age', '')).toBe('age');
    expect(histogramCacheKey('age', 'dataset')).toBe('age::dataset');
  });
});

describe('buildStackedHistogramSeries', () => {
  const items = [
    { var: 'age', grouping_var: null, grouping_enum: null, bins: [0, 10, 20], counts: [10, 20, 30] },
    { var: 'age', grouping_var: 'dataset', grouping_enum: 'ds1', bins: [0, 10, 20], counts: [4, 8, null] },
    { var: 'age', grouping_var: 'dataset', grouping_enum: 'ds2', bins: [0, 10, 20], counts: [4, 8, 10] },
  ];

  it('returns the overall series when no grouping is requested', () => {
    expect(buildStackedHistogramSeries(items, 'age', null, () => 'x')).toEqual({
      bins: [0, 10, 20],
      counts: [10, 20, 30],
    });
  });

  it('keeps leading and trailing null counts on the overall series', () => {
    expect(buildStackedHistogramSeries(
      [{ var: 'age', bins: [0, 10, 20, 30], counts: [null, 8, 12, null] }],
      'age',
      null,
      () => 'x'
    )?.counts).toEqual([null, 8, 12, null]);
  });

  it('attaches grouped series for the requested split', () => {
    const stacked = buildStackedHistogramSeries(items, 'age', 'dataset', (_var, value) => value.toUpperCase());
    expect(stacked?.groups).toEqual([
      { key: 'ds1', label: 'DS1', counts: [4, 8, null] },
      { key: 'ds2', label: 'DS2', counts: [4, 8, 10] },
    ]);
    expect(stacked?.counts).toEqual([10, 20, 30]);
  });

  it('does not use a grouped entry as the bin totals when the overall entry is missing', () => {
    expect(buildStackedHistogramSeries(items.slice(1), 'age', 'dataset', (_var, value) => value)).toBeNull();
  });

  it('keeps a pooled dataset alongside its parts so the chart can dodge, not stack them', () => {
    const items = [
      { var: 'glucose', grouping_var: null, grouping_enum: null, bins: [0, 10], counts: [95, 20] },
      { var: 'glucose', grouping_var: 'dataset', grouping_enum: 'SSR', bins: [0, 10], counts: [95, 20] },
      { var: 'glucose', grouping_var: 'dataset', grouping_enum: 'SSR-even', bins: [0, 10], counts: [53, 10] },
      { var: 'glucose', grouping_var: 'dataset', grouping_enum: 'SSR-odd', bins: [0, 10], counts: [42, 10] },
    ];
    const stacked = buildStackedHistogramSeries(items, 'glucose', 'dataset', (_v, e) => e);
    // The backend lists a pooled dataset and its parts as separate groups whose
    // counts overlap, so stacking sums the same rows twice. The chart dodges
    // dataset splits (histogram-chart.ts) instead.
    expect(stacked?.groups?.map((group) => group.key)).toEqual(['SSR', 'SSR-even', 'SSR-odd']);
    expect(stacked?.groups?.[0].counts[0]).toBe(95);
    expect(stacked?.counts[0]).toBe(95);
  });

  it('drops unselected datasets and all-null groups', () => {
    const stacked = buildStackedHistogramSeries(
      [
        ...items,
        { var: 'age', grouping_var: 'dataset', grouping_enum: 'ds3', bins: [0, 10, 20], counts: [null, null, null] },
        { var: 'age', grouping_var: 'dataset', grouping_enum: 'other', bins: [0, 10, 20], counts: [2, 4, 6] },
      ],
      'age',
      'dataset',
      (_var, value) => value,
      ['ds1', 'ds3']
    );
    expect(stacked?.groups).toEqual([
      { key: 'ds1', label: 'ds1', counts: [4, 8, null] },
    ]);
  });
});

describe('residualCount', () => {
  it('is the leftover after summing visible group counts', () => {
    const series = (counts: Array<number | null>) =>
      counts.map((count, index) => ({ key: String(index), label: String(index), counts: [count] }));
    expect(residualCount(10, series([4, 4, null]), 0)).toBe(2);
    expect(residualCount(10, series([4, 6]), 0)).toBe(0);
    expect(residualCount(null, series([4]), 0)).toBe(0);
  });
});
