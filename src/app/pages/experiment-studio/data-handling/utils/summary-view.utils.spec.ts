import { PivotBlock } from '../data-handling.models';
import {
  datasetDisplayLabel,
  emptySummaryView,
  labelDatasetColumns,
  summaryCsvRows,
  summaryKindLabel,
} from './summary-view.utils';

const block: PivotBlock = {
  code: 'age',
  name: 'Age',
  columns: ['d1', 'all datasets'],
  rows: [
    { metric: 'Mean', values: { d1: '61.00', 'all datasets': '62.50' } },
    { metric: 'Max', values: { d1: '90.00' } },
  ],
};
const label = (code: string) => ({ d1: 'Dataset one', 'all datasets': 'All datasets' }[code] ?? code);

describe('emptySummaryView', () => {
  it('starts on the Table view with no data', () => {
    const view = emptySummaryView(true);
    expect(view.isLoading).toBe(true);
    expect(view.activeTab).toBe('Statistics');
    expect(view.data).toEqual([]);
    expect(view.selectedStatisticKey).toBeNull();
  });

  it('never shares caches between views', () => {
    const a = emptySummaryView(false);
    const b = emptySummaryView(false);
    expect(a.histogramDataByVariable).not.toBe(b.histogramDataByVariable);
    expect(a.data).not.toBe(b.data);
  });
});

describe('summary export helpers', () => {
  it('names each surface', () => {
    expect(['source', 'raw', 'processed'].map((kind) => summaryKindLabel(kind as never)))
      .toEqual(['Source data', 'Raw data', 'Processed data']);
  });

  it('resolves a dataset code to its label and leaves an unknown or empty code alone', () => {
    expect(datasetDisplayLabel('d1', { d1: 'Dataset one' })).toBe('Dataset one');
    expect(datasetDisplayLabel('d2', {})).toBe('d2');
    expect(datasetDisplayLabel('', { d1: 'Dataset one' })).toBe('');
  });

  it('renames dataset columns and carries their values over without touching the input', () => {
    const [labelled] = labelDatasetColumns([block], label);
    expect(labelled.columns).toEqual(['Dataset one', 'All datasets']);
    expect(labelled.rows[0].values).toEqual({ 'Dataset one': '61.00', 'All datasets': '62.50' });
    expect(labelled.code).toBe('age');
    expect(block.columns).toEqual(['d1', 'all datasets']);
  });

  it('writes a CSV record per metric and dataset, empty where a dataset has no value', () => {
    expect(summaryCsvRows([block], label)).toEqual([
      { Variable: 'Age', Metric: 'Mean', Dataset: 'Dataset one', Value: '61.00' },
      { Variable: 'Age', Metric: 'Mean', Dataset: 'All datasets', Value: '62.50' },
      { Variable: 'Age', Metric: 'Max', Dataset: 'Dataset one', Value: '90.00' },
      { Variable: 'Age', Metric: 'Max', Dataset: 'All datasets', Value: '' },
    ]);
  });
});
