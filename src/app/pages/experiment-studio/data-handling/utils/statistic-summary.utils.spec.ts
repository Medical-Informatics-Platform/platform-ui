import { VariableStats } from '../../../../models/algorithm-results.model';
import { VariableRow } from '../data-handling.models';
import {
  categoryCounts,
  enumLabelMap,
  isCategoricalVariable,
  pivotByDataset,
  pooledTotalRows,
  variableLabel,
} from './statistic-summary.utils';

const numeric = (dataset: string, mean: number | null): VariableStats => ({
  variable: 'age',
  dataset,
  data: { num_dtps: 1200, num_na: 3, num_total: 1203, mean, std: 1.234567, min: 1, q1: 2, q2: 3, q3: 4, max: 5 },
});
const nominal = (dataset: string, counts: Record<string, number>): VariableStats => ({
  variable: 'sex',
  dataset,
  data: { num_dtps: 10, num_na: 0, num_total: 10, counts },
});
const sex: VariableRow = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F', label: 'Female' }, { code: 'M', label: 'Male' }] };

describe('statistic-summary utils', () => {
  it('labels a variable by name, then label, then code', () => {
    expect(variableLabel({ code: 'a', name: 'N', label: 'L' })).toBe('N');
    expect(variableLabel({ code: 'a', label: 'L' })).toBe('L');
    expect(variableLabel({ code: 'a' })).toBe('a');
  });

  it('treats nominal or enumerated variables as categorical', () => {
    expect(isCategoricalVariable({ code: 'a', type: 'Nominal' })).toBe(true);
    expect(isCategoricalVariable({ code: 'a', type: 'real', enumerations: [{ code: '1' }] })).toBe(true);
    expect(isCategoricalVariable({ code: 'a', type: 'real' })).toBe(false);
  });

  it('maps enumeration codes to labels', () => {
    expect([...enumLabelMap(sex)]).toEqual([['F', 'Female'], ['M', 'Male']]);
    expect(enumLabelMap(undefined).size).toBe(0);
  });

  it('reads category counts only from nominal stats', () => {
    expect(categoryCounts(nominal('d', { F: 1 }).data)).toEqual({ F: 1 });
    expect(categoryCounts(numeric('d', 1).data)).toEqual({});
    expect(categoryCounts(null)).toEqual({});
  });

  it('reads the pooled record count', () => {
    expect(pooledTotalRows([numeric('d1', 1), numeric('all datasets', 1)])).toBe(1203);
    expect(pooledTotalRows([numeric('d1', 1)])).toBeNull();
  });

  it('pivots a numeric variable into every metric, one column per dataset', () => {
    const [block] = pivotByDataset([numeric('d1', 61.25), numeric('d2', null)], [{ code: 'age', name: 'Age' }], ['d1', 'd2']);
    expect(block.code).toBe('age');
    expect(block.name).toBe('Age');
    expect(block.columns).toEqual(['d1', 'd2']);
    expect(block.rows.map((row) => row.metric)).toEqual(
      ['Datapoints', 'Missing', 'Total', 'Mean', 'Standard Deviation', 'Min', 'Q1', 'Median', 'Q3', 'Max']);
    expect(block.rows[0].values).toEqual({ d1: '1200', d2: '1200' });
    expect(block.rows[3].values['d2']).toBe('N/A');
  });

  it('pivots category counts in enumeration order, then unknown categories', () => {
    const [block] = pivotByDataset([nominal('d1', { M: 4, X: 1, F: 5 })], [sex], ['d1', 'd2']);
    expect(block.name).toBe('Sex');
    expect(block.rows.map((row) => row.metric)).toEqual(['Datapoints', 'Missing', 'Total', 'Female', 'Male', 'X']);
    expect(block.rows[3].values).toEqual({ d1: '5', d2: 'N/A' });
  });

  it('shows only record counts for a categorical variable without category counts', () => {
    const rows: VariableStats[] = [{ variable: 'sex', dataset: 'd1', data: null }];
    const [block] = pivotByDataset(rows, [sex], ['d1']);
    expect(block.rows.map((row) => row.metric)).toEqual(['Datapoints', 'Missing', 'Total']);
  });

  it('falls back to the code for variables it does not know', () => {
    expect(pivotByDataset([numeric('d1', 1)], [], ['d1'])[0].name).toBe('age');
  });
});
