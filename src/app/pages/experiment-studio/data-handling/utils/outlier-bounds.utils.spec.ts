import type { OutlierPreviewRow } from '../data-handling.models';
import { outlierBounds, outlierBoundsView, outlierDistributionNumbers, reportBounds } from './outlier-bounds.utils';

const points = [
  { label: 'Mean', value: '50' },
  { label: 'Standard Deviation', value: '10' },
  { label: 'Min', value: '0' },
  { label: 'Q1', value: '40' },
  { label: 'Median', value: '50' },
  { label: 'Q3', value: '60' },
  { label: 'Max', value: '100' },
];
const numbers = outlierDistributionNumbers(points)!;
const report = (patch: Partial<OutlierPreviewRow>): OutlierPreviewRow => ({
  variable: 'age', dataset: 'a', strategy: 'MAD', tail: 'both', fold: '3', lowerBound: '', upperBound: '',
  lowerOutliers: '', upperOutliers: '', totalOutliers: '', outlierPercentage: '', ...patch,
});

describe('outlier bounds utils', () => {
  it('needs every quartile, and reads mean and std when present', () => {
    expect(numbers).toEqual({ min: 0, q1: 40, median: 50, q3: 60, max: 100, mean: 50, std: 10 });
    expect(outlierDistributionNumbers([])).toBeNull();
    expect(outlierDistributionNumbers(points.filter((point) => point.label !== 'Q3'))).toBeNull();
    expect(outlierDistributionNumbers(points.filter((point) => !/Mean|Standard/.test(point.label)))).toMatchObject({ mean: null, std: null });
  });

  it('prices IQR and Gaussian bounds and honours the tail', () => {
    expect(outlierBounds(numbers, { strategy: 'iqr', fold: 1.5, tail: 'both' }, [])).toEqual({ lo: 10, hi: 90 });
    expect(outlierBounds(numbers, { strategy: 'iqr', fold: 1.5, tail: 'right' }, [])).toEqual({ lo: null, hi: 90 });
    expect(outlierBounds(numbers, { strategy: 'gaussian', fold: 2, tail: 'left' }, [])).toEqual({ lo: 30, hi: null });
    expect(outlierBounds(numbers, { strategy: 'iqr', fold: Number.NaN, tail: 'both' }, [])).toBeNull();
  });

  it('falls back to the report bounds for strategies the summary cannot price', () => {
    const rows = [report({ lowerBound: '5', upperBound: '95' })];
    expect(reportBounds(rows)).toEqual({ lo: 5, hi: 95 });
    expect(outlierBounds(numbers, { strategy: 'mad', fold: 3, tail: 'both' }, rows)).toEqual({ lo: 5, hi: 95 });
    expect(outlierBounds({ ...numbers, std: null }, { strategy: 'gaussian', fold: 3, tail: 'both' }, rows)).toEqual({ lo: 5, hi: 95 });
    expect(outlierBounds(numbers, { strategy: 'mad', fold: 3, tail: 'both' }, [])).toBeNull();
    expect(reportBounds([report({})])).toBeNull();
  });

  it('draws the strip in percent of the span and says what is capped', () => {
    const view = outlierBoundsView(numbers, { strategy: 'iqr', fold: 1.5, tail: 'both' }, [report({ lowerOutliers: '2', upperOutliers: '3' })]);
    expect(view).toMatchObject({ min: 0, iqrLeft: 40, iqrWidth: 20, medianLeft: 50, loPct: 10, hiPct: 90, cappedLeft: 10, cappedRight: 10 });
    expect(view?.note).toBe('Below 10 or above 90 → capped · 5 values');
    expect(outlierBoundsView(numbers, { strategy: 'mad', fold: 3, tail: 'both' }, [])?.note).toBe('Bounds shown after Refresh report');
    expect(outlierBoundsView(null, { strategy: 'iqr', fold: 1.5, tail: 'both' }, [])).toBeNull();
    expect(outlierBoundsView({ ...numbers, max: 0 }, { strategy: 'iqr', fold: 1.5, tail: 'both' }, [])).toBeNull();
  });
});
