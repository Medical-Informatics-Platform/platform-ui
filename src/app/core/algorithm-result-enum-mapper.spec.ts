import { mapAlgorithmResultEnums } from './algorithm-result-enum-mapper';

describe('mapAlgorithmResultEnums', () => {
  it('maps naive bayes classes using y-variable enum map', () => {
    const enumMaps = {
      diagnosis: {
        '0': 'Control',
        '1': 'Case',
      },
    };

    const mapped = mapAlgorithmResultEnums(
      'naive_bayes_gaussian',
      {
        classes: [0, 1],
        class_prior: [0.4, 0.6],
      },
      enumMaps,
      { y: 'diagnosis' }
    );

    expect(mapped.classes).toEqual(['Control', 'Case']);
  });

  it('maps mixed-effects variable labels and ordinal categories', () => {
    const mapped = mapAlgorithmResultEnums(
      'glmm_ordinal',
      {
        dependent_var: 'agegroup',
        grouping_var: 'dataset',
        indep_vars: ['Intercept', 'gender[M]'],
        category_order: ['young', 'old'],
      },
      {
        agegroup: { young: 'Young', old: 'Old' },
        gender: { M: 'Male' },
      },
      { y: 'agegroup' },
      {
        agegroup: 'Age group',
        dataset: 'Dataset',
        gender: 'Gender',
      }
    );

    expect(mapped.dependent_var).toBe('Age group');
    expect(mapped.grouping_var).toBe('Dataset');
    expect(mapped.indep_vars).toEqual(['Intercept', 'Gender[Male]']);
    expect(mapped.category_order).toEqual(['Young', 'Old']);
  });

  it('maps categorical table labels using y and x enum maps', () => {
    const mapped = mapAlgorithmResultEnums(
      'chi_squared',
      {
        x_labels: ['AD', 'Other'],
        y_labels: ['F', 'M'],
      },
      {
        diagnosis: { AD: 'Alzheimer disease', Other: 'Other diagnosis' },
        gender: { F: 'Female', M: 'Male' },
      },
      { x: 'diagnosis', y: 'gender' }
    );

    expect(mapped.x_labels).toEqual(['Alzheimer disease', 'Other diagnosis']);
    expect(mapped.y_labels).toEqual(['Female', 'Male']);
  });
});
