import { enrichPcaResult } from './result-label.utils';

describe('enrichPcaResult', () => {
  const labelled = [
    { code: 'age', label: 'Age' },
    { code: 'bmi', label: 'BMI' },
  ];

  it('labels the result variables in the order the result lists them', () => {
    const result = enrichPcaResult({ variables: ['bmi', 'age'] }, 'pca', labelled);

    expect((result as any).variable_names).toEqual(['BMI', 'Age']);
  });

  it('leaves a result without variables unchanged', () => {
    const result = { eigenvalues: [1, 0.5] };

    expect(enrichPcaResult(result, 'pca', labelled)).toBe(result);
  });

  it('leaves other algorithms unchanged', () => {
    const result = { variables: ['age'] };

    expect(enrichPcaResult(result, 'kmeans', labelled)).toBe(result);
  });
});
