import {
  collectVariableCodes,
  computeUnavailableVariables,
  isVariableUnavailable,
  unavailableDatasetsFor,
  unavailableTooltipFor,
  unavailableVariableTooltip,
} from './variable-availability.utils';

describe('computeUnavailableVariables', () => {
  const datasetsVariables = {
    ds_a: ['dataset', 'age', 'sex'],
    ds_b: ['dataset', 'age'],
    ds_c: ['dataset', 'sex'],
  };
  const labels = [
    { code: 'ds_a', label: 'Dataset A' },
    { code: 'ds_b', label: 'Dataset B' },
    { code: 'ds_c', label: 'Dataset C' },
  ];
  const variables = ['dataset', 'age', 'sex', 'mmse'];

  it('marks a variable unavailable in every selected dataset that lacks it, by label', () => {
    const result = computeUnavailableVariables(datasetsVariables, ['ds_a', 'ds_b', 'ds_c'], variables, labels);
    expect(result.get('sex')).toEqual(['Dataset B']);
    expect(result.get('age')).toEqual(['Dataset C']);
    expect(result.get('mmse')).toEqual(['Dataset A', 'Dataset B', 'Dataset C']);
  });

  it('only considers the selected datasets', () => {
    const result = computeUnavailableVariables(datasetsVariables, ['ds_a'], variables, labels);
    expect(result.has('sex')).toBe(false);
    expect(result.has('age')).toBe(false);
    expect(result.get('mmse')).toEqual(['Dataset A']);
  });

  it('never marks the dataset variable unavailable', () => {
    const result = computeUnavailableVariables({ ds_a: ['age'] }, ['ds_a'], ['dataset', 'Dataset', 'age'], labels);
    expect(result.size).toBe(0);
  });

  it('falls back to the dataset code when no label is known', () => {
    const result = computeUnavailableVariables({ ds_x: ['age'] }, ['ds_x'], ['sex'], labels);
    expect(result.get('sex')).toEqual(['ds_x']);
  });

  it('treats missing datasetsVariables, no selection and unknown datasets as no information', () => {
    expect(computeUnavailableVariables(undefined, ['ds_a'], variables, labels).size).toBe(0);
    expect(computeUnavailableVariables(null, ['ds_a'], variables, labels).size).toBe(0);
    expect(computeUnavailableVariables({}, ['ds_a'], variables, labels).size).toBe(0);
    expect(computeUnavailableVariables(datasetsVariables, [], variables, labels).size).toBe(0);
    expect(computeUnavailableVariables(datasetsVariables, ['ds_unknown'], variables, labels).size).toBe(0);
  });

  it('ignores a selected dataset without an entry but still applies the others', () => {
    const result = computeUnavailableVariables(datasetsVariables, ['ds_unknown', 'ds_b'], variables, labels);
    expect(result.get('sex')).toEqual(['Dataset B']);
  });

  it('treats an empty entry as a dataset without variables', () => {
    const result = computeUnavailableVariables({ ds_a: [], ds_b: ['age'] }, ['ds_a', 'ds_b'], ['dataset', 'age', 'sex'], labels);
    expect(result.get('age')).toEqual(['Dataset A']);
    expect(result.get('sex')).toEqual(['Dataset A', 'Dataset B']);
    expect(result.has('dataset')).toBe(false);
  });

  it('ignores an empty entry for a dataset that is not selected', () => {
    const result = computeUnavailableVariables({ ds_a: [], ds_b: ['age'] }, ['ds_b'], ['age'], labels);
    expect(result.size).toBe(0);
  });

  it('lists each dataset once even when selected twice', () => {
    const result = computeUnavailableVariables(datasetsVariables, ['ds_b', 'ds_b'], ['sex'], labels);
    expect(result.get('sex')).toEqual(['Dataset B']);
  });
});

describe('variable availability helpers', () => {
  const map = new Map([['sex', ['Dataset B', 'Dataset C']]]);

  it('formats the tooltip', () => {
    expect(unavailableVariableTooltip(['Dataset A', 'Dataset B'])).toBe('Not available in: Dataset A, Dataset B');
    expect(unavailableVariableTooltip([])).toBe('');
    expect(unavailableVariableTooltip(undefined)).toBe('');
    expect(unavailableVariableTooltip(['Dataset A'], 'Remove variables not available in'))
      .toBe('Remove variables not available in: Dataset A');
  });

  it('formats the tooltip for a node in one call', () => {
    expect(unavailableTooltipFor(map, { code: 'sex' })).toBe('Not available in: Dataset B, Dataset C');
    expect(unavailableTooltipFor(map, { code: 'sex', children: [{}] })).toBe('');
    expect(unavailableTooltipFor(map, { code: 'age' })).toBe('');
    expect(unavailableTooltipFor(null, { code: 'sex' })).toBe('');
  });

  it('looks up leaf variables and leaves groups alone', () => {
    expect(unavailableDatasetsFor(map, { code: 'sex' })).toEqual(['Dataset B', 'Dataset C']);
    expect(isVariableUnavailable(map, { code: 'sex' })).toBe(true);
    expect(isVariableUnavailable(map, { code: 'sex', children: [{}] })).toBe(false);
    expect(isVariableUnavailable(map, { code: 'age' })).toBe(false);
    expect(isVariableUnavailable(map, null)).toBe(false);
    expect(isVariableUnavailable(undefined, { code: 'sex' })).toBe(false);
  });

  it('collects variable codes from nested groups', () => {
    expect(collectVariableCodes({
      variables: [{ label: 'Dataset', code: 'dataset' }],
      groups: [
        { label: 'Demo', variables: [{ label: 'Age', code: 'age' }], groups: [{ label: 'Sub', variables: [{ label: 'Sex', code: 'sex' }] }] },
      ],
    })).toEqual(['dataset', 'age', 'sex']);
    expect(collectVariableCodes(null)).toEqual([]);
  });
});
