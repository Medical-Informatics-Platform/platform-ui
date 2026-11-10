import { partialVariableNotes } from './variable-availability.utils';

describe('partialVariableNotes', () => {
  const map = new Map<string, readonly string[]>([
    ['age', ['CLM CHUV']],
    ['gcs', ['CLM CHUV', 'Dataset B']],
  ]);

  it('lists the selected variables some selected dataset lacks, in selection order, once', () => {
    expect(partialVariableNotes([
      { code: 'gcs', label: 'Glasgow coma scale' },
      { code: 'sex', label: 'Sex' },
      { code: 'age', name: 'Age' },
      { code: 'gcs', label: 'Glasgow coma scale' },
    ], map)).toEqual([
      { code: 'gcs', label: 'Glasgow coma scale', datasets: ['CLM CHUV', 'Dataset B'] },
      { code: 'age', label: 'Age', datasets: ['CLM CHUV'] },
    ]);
  });

  it('falls back to the code for the label and is empty without information', () => {
    expect(partialVariableNotes([{ code: 'age' }], map)).toEqual([{ code: 'age', label: 'age', datasets: ['CLM CHUV'] }]);
    expect(partialVariableNotes([{ code: 'age' }], new Map())).toEqual([]);
    expect(partialVariableNotes(null, map)).toEqual([]);
    expect(partialVariableNotes([{ code: 'age' }], null)).toEqual([]);
  });
});
