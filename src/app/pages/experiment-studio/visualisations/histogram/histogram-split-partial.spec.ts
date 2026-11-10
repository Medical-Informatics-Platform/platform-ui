import { buildHistogramSplitOptions } from './histogram-data';

describe('histogram split options for partially available variables', () => {
  const sex = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'f' }, { code: 'm' }] };

  it('offers a split variable missing in some dataset as enabled, flagged, with the datasets in the title', () => {
    const options = buildHistogramSplitOptions({
      plottedCode: 'age',
      selectedVariables: [sex],
      datasetLevelCount: 2,
      unavailableVariables: new Map([['sex', ['CLM CHUV']]]),
    });

    const option = options.find((entry) => entry.code === 'sex')!;
    expect(option.disabled).toBe(false);
    expect(option.unavailable).toBe(true);
    expect(option.title).toContain('Split bars by Sex');
    expect(option.title).toContain('Not available in: CLM CHUV');
  });

  it('still disables a split with too many categories, partial or not', () => {
    const many = { ...sex, enumerations: Array.from({ length: 9 }, (_, i) => ({ code: `c${i}` })) };
    const options = buildHistogramSplitOptions({
      plottedCode: 'age',
      selectedVariables: [many],
      datasetLevelCount: 2,
      unavailableVariables: new Map([['sex', ['CLM CHUV']]]),
    });

    expect(options.find((entry) => entry.code === 'sex')?.disabled).toBe(true);
  });
});
