import type { VariableStats } from '../../../../models/algorithm-results.model';
import {
  HistogramPreviewVariable,
  histogramFromDescribeCounts,
  histogramResponseError,
  mapBinsToEnumLabels,
  parseHistogramResponse,
  withDefaultDropFor,
} from './histogram-preview.utils';

const sex: HistogramPreviewVariable = {
  name: 'Sex',
  type: 'nominal',
  enumerations: [{ code: 'F', label: 'Female' }, { code: 'M', label: 'Male' }],
};

const row = (variable: string, dataset: string, counts: Record<string, number>) =>
  ({ variable, dataset, data: { counts } }) as unknown as VariableStats;

const parse = (response: unknown, patch: Partial<Parameters<typeof parseHistogramResponse>[0]> = {}) =>
  parseHistogramResponse({
    response,
    code: 'age',
    variable: { name: 'Age', type: 'numeric' },
    kind: 'raw',
    groupingCode: null,
    groupLabel: (_variable, value) => value,
    datasets: ['a'],
    splitLabel: (code) => code,
    ...patch,
  });

describe('histogram preview utils', () => {
  it('labels bins only when an enumeration matches one', () => {
    expect(mapBinsToEnumLabels(['F', 'X'], sex.enumerations)).toEqual(['Female', 'X']);
    expect(mapBinsToEnumLabels(['A', 'B'], sex.enumerations)).toEqual(['A', 'B']);
    expect(mapBinsToEnumLabels([1, 2], undefined)).toEqual([1, 2]);
  });

  it('adds the default drop for one variable without overriding a strategy', () => {
    expect(withDefaultDropFor(null, 'age')).toEqual({ missing_values_handler: { strategies: { age: 'drop' } } });
    const configured = { missing_values_handler: { strategies: { age: 'mean' }, fill_values: {} }, other: 1 };
    expect(withDefaultDropFor(configured, 'age')).toEqual(configured);
    expect(withDefaultDropFor(configured, 'bmi')).toEqual({
      missing_values_handler: { strategies: { age: 'mean', bmi: 'drop' }, fill_values: {} },
      other: 1,
    });
  });

  it('builds a histogram from describe counts, preferring all datasets, or null without positive counts', () => {
    const rows = [row('sex', 'a', { F: 1, M: 1 }), row('sex', 'all datasets', { F: 3, M: 5 })];
    expect(histogramFromDescribeCounts(rows, 'sex', sex)).toEqual({
      bins: ['Female', 'Male'],
      counts: [3, 5],
      variableName: 'Sex',
      variableType: 'nominal',
    });
    expect(histogramFromDescribeCounts([row('sex', 'all datasets', { F: 0 })], 'sex', sex)).toBeNull();
    expect(histogramFromDescribeCounts(rows, 'other', sex)).toBeNull();
  });

  it('reads the message a failed response carries', () => {
    expect(histogramResponseError({ result: 'engine down ' }, 'engine down ')).toBe('engine down');
    expect(histogramResponseError({ result: { data: 'bad bins' } }, { data: 'bad bins' })).toBe('bad bins');
    expect(histogramResponseError({ message: 'nope' }, {})).toBe('nope');
    expect(histogramResponseError({ result: {} }, {})).toBeNull();
  });

  it('parses a histogram response into chart data', () => {
    const response = { result: { histogram: [{ var: 'age', bins: [0, 10, 20], counts: [4, 6] }] } };
    expect(parse(response)).toEqual({
      data: { bins: ['0', '10', '20'], counts: [4, 6], groups: undefined, variableName: 'Age', variableType: 'numeric', splitLabel: undefined },
      error: '',
    });
  });

  it('explains a response with no usable histogram', () => {
    expect(parse(null).error).toBe('Failed to load histogram preview.');
    expect(parse({ result: { data: 'insufficient data' } }).error).toBe('insufficient data');
    expect(parse({ result: {} }).error).toBe('No histogram data available for this variable.');
    expect(parse({ result: {} }, { kind: 'processed' }).error).toContain('after preprocessing');
    const empty = { result: { histogram: [{ var: 'age', bins: [0, 10], counts: [0] }] } };
    expect(parse(empty).error).toContain('privacy threshold');
  });
});
