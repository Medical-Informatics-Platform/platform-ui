import { PivotBlock } from '../data-handling.models';
import {
  barWidth,
  blockCoverage,
  blockDistribution,
  categoryShares,
  coverageByDataset,
  coveragePercent,
  coverageSeverity,
  coverageTitle,
  metricGroupLabel,
  missingShareNote,
  pooledCoverage,
  pooledMetricText,
} from './summary-coverage.utils';

const row = (metric: string, values: Record<string, string>) => ({ metric, values });

const numeric: PivotBlock = {
  code: 'age',
  name: 'Age',
  columns: ['d1', 'd2', 'all datasets'],
  rows: [
    row('Datapoints', { d1: '90', d2: '8', 'all datasets': '98' }),
    row('Missing', { d1: '10', d2: '2', 'all datasets': '12' }),
    row('Total', { d1: '100', d2: '10', 'all datasets': '110' }),
    row('Mean', { d1: '70.00', d2: '65.00', 'all datasets': '1,234.50' }),
    row('Median', { d1: '71.00', d2: '66.00', 'all datasets': 'N/A' }),
  ],
};

const nominal: PivotBlock = {
  code: 'sex',
  name: 'Sex',
  columns: ['d1', 'd2'],
  rows: [
    row('Datapoints', { d1: '10', d2: '4' }),
    row('Missing', { d1: '0', d2: '0' }),
    row('Total', { d1: '10', d2: '4' }),
    row('Female', { d1: '6', d2: '1' }),
    row('Male', { d1: '4', d2: '3' }),
    row('Other', { d1: '', d2: '0' }),
  ],
};

describe('summary-coverage utils', () => {
  describe('pooled metric reads', () => {
    it('prefers the pooled column and falls back to the first dataset', () => {
      expect(pooledMetricText(numeric, 'Total')).toBe('110');
      expect(pooledMetricText(nominal, 'Total')).toBe('10');
    });

    it('reports N/A for a metric the block does not have', () => {
      expect(pooledMetricText(nominal, 'Mean')).toBe('N/A');
    });
  });

  describe('blockCoverage', () => {
    it('prices missing values against the pooled total', () => {
      expect(blockCoverage(numeric)).toEqual({ total: 110, missing: 12, share: 12 / 110 });
    });

    it('is null without a block or without records', () => {
      expect(blockCoverage(null)).toBeNull();
      expect(blockCoverage(undefined)).toBeNull();
      expect(blockCoverage({ ...numeric, rows: [row('Total', { 'all datasets': '0' })] })).toBeNull();
      expect(blockCoverage({ ...numeric, rows: [] })).toBeNull();
    });

    it('never reports more missing values than records', () => {
      const block = { ...numeric, rows: [row('Missing', { 'all datasets': '30' }), row('Total', { 'all datasets': '20' })] };
      expect(blockCoverage(block)).toEqual({ total: 20, missing: 20, share: 1 });
    });

    it('rounds the missing count to whole records', () => {
      const block = { ...numeric, rows: [row('Missing', { 'all datasets': '2.6' }), row('Total', { 'all datasets': '10' })] };
      expect(blockCoverage(block)?.missing).toBe(3);
    });
  });

  describe('pooledCoverage', () => {
    it('sums counts and divides once instead of averaging shares', () => {
      const clean: PivotBlock = { ...numeric, code: 'b', rows: [row('Missing', { 'all datasets': '0' }), row('Total', { 'all datasets': '890' })] };
      const pooled = pooledCoverage([numeric, clean]);
      expect(pooled).toEqual({ total: 1000, missing: 12, share: 0.012, variables: 2 });
    });

    it('skips blocks without statistics and is null when none has any', () => {
      expect(pooledCoverage([numeric, { ...numeric, rows: [] }])?.variables).toBe(1);
      expect(pooledCoverage([{ ...numeric, rows: [] }])).toBeNull();
      expect(pooledCoverage([])).toBeNull();
    });
  });

  describe('missingShareNote', () => {
    it('states the share beside the Missing cell of one dataset', () => {
      expect(missingShareNote(numeric, numeric.rows[1], 'd1')).toBe('10%');
      expect(missingShareNote(numeric, numeric.rows[1], 'd2')).toBe('20%');
    });

    it('says nothing for other metrics or when the pair is not numeric', () => {
      expect(missingShareNote(numeric, numeric.rows[3], 'd1')).toBeNull();
      expect(missingShareNote(numeric, numeric.rows[1], 'missing-column')).toBeNull();
      expect(missingShareNote({ ...numeric, rows: [numeric.rows[1]] }, numeric.rows[1], 'd1')).toBeNull();
    });
  });

  describe('coverageByDataset', () => {
    const label = (code: string) => ({ 'all datasets': 'All datasets', d1: 'Dataset 1', d2: 'Dataset 2' }[code] ?? code);

    it('splits coverage per dataset and leaves the rollup column out', () => {
      expect(coverageByDataset(numeric, label)).toEqual([
        { label: 'Dataset 1', missing: 10, total: 100, share: 0.1 },
        { label: 'Dataset 2', missing: 2, total: 10, share: 0.2 },
      ]);
    });

    it('recognises an already-labelled rollup column', () => {
      const labelled: PivotBlock = { ...numeric, columns: ['d1', 'All datasets'], rows: [
        row('Missing', { d1: '1', 'All datasets': '1' }),
        row('Total', { d1: '5', 'All datasets': '5' }),
      ] };
      expect(coverageByDataset(labelled, label).map((tile) => tile.label)).toEqual(['Dataset 1']);
    });

    it('drops datasets without records and is empty without the rows', () => {
      const empty: PivotBlock = { ...numeric, rows: [row('Missing', { d1: '0' }), row('Total', { d1: '0', d2: '4' })] };
      expect(coverageByDataset(empty, label)).toEqual([{ label: 'Dataset 2', missing: 0, total: 4, share: 0 }]);
      expect(coverageByDataset({ ...numeric, rows: [numeric.rows[0]] }, label)).toEqual([]);
      expect(coverageByDataset(null, label)).toEqual([]);
    });
  });

  describe('blockDistribution', () => {
    it('lists the pooled distribution rows in display form', () => {
      expect(blockDistribution(numeric)).toEqual([
        { label: 'Mean', value: (1234.5).toLocaleString(undefined, { maximumFractionDigits: 2 }) },
      ]);
    });

    it('omits metrics a nominal block does not carry and counts', () => {
      expect(blockDistribution(nominal)).toEqual([]);
      expect(blockDistribution(null)).toEqual([]);
    });
  });

  describe('categoryShares', () => {
    it('reads categories after the record counts as shares of the datapoints', () => {
      expect(categoryShares(nominal)).toEqual([
        { label: 'Female', value: '6', share: 0.6 },
        { label: 'Male', value: '4', share: 0.4 },
        { label: 'Other', value: '0', share: 0 },
      ]);
    });

    it('caps the list and caps each share at 1', () => {
      expect(categoryShares(nominal, 1).map((item) => item.label)).toEqual(['Female']);
      const skewed: PivotBlock = { ...nominal, rows: [row('Datapoints', { d1: '2' }), row('Odd', { d1: '5' })] };
      expect(categoryShares(skewed)[0].share).toBe(1);
    });

    it('has no shares without datapoints', () => {
      const none: PivotBlock = { ...nominal, rows: [row('A', { d1: '3' })] };
      expect(categoryShares(none)).toEqual([{ label: 'A', value: '3', share: 0 }]);
      expect(categoryShares(undefined)).toEqual([]);
    });
  });

  describe('metricGroupLabel', () => {
    it('opens a group where count-ness changes', () => {
      const labels = numeric.rows.map((_, index) => metricGroupLabel(numeric.rows, index));
      expect(labels).toEqual(['Coverage', null, null, 'Distribution', null]);
    });
  });

  describe('presentation helpers', () => {
    it('formats shares as whole or one-decimal percentages', () => {
      expect(coveragePercent({ share: 0.091 })).toBe('9.1%');
      expect(coveragePercent({ share: 0.5 })).toBe('50%');
      expect(coveragePercent({ share: 0 })).toBe('0%');
    });

    it('bands severity at 10% and 50%', () => {
      expect(coverageSeverity({ share: 0.099 })).toBe('none');
      expect(coverageSeverity({ share: 0.1 })).toBe('warning');
      expect(coverageSeverity({ share: 0.49 })).toBe('warning');
      expect(coverageSeverity({ share: 0.5 })).toBe('high');
    });

    it('writes the full count for a tooltip', () => {
      expect(coverageTitle({ total: 1000, missing: 12 })).toBe(`${(12).toLocaleString()} of ${(1000).toLocaleString()} values missing`);
    });

    it('scales a bar between a 2% track and a full bar', () => {
      expect(barWidth(0, 1000)).toBe(2);
      expect(barWidth('x', 1000)).toBe(2);
      expect(barWidth(0.05, 1000)).toBe(50);
      expect(barWidth(0.5, 1000)).toBe(100);
    });
  });
});
