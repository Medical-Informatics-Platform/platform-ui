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

  it('maps Cox regression variable and covariate labels', () => {
    const mapped = mapAlgorithmResultEnums(
      'cox_regression_classical',
      {
        dependent_var: 'timesincebaseline',
        event_var: 'alzheimerbroadcategory',
        indep_vars: ['Intercept', 'gender[M]'],
        summary: { n_obs: 10, n_events: 4 },
      },
      {
        alzheimerbroadcategory: { AD: 'Alzheimer disease', Other: 'Other' },
        gender: { M: 'Male' },
      },
      { y: 'timesincebaseline', x: 'alzheimerbroadcategory' },
      {
        timesincebaseline: 'Time since baseline',
        alzheimerbroadcategory: 'Diagnosis',
        gender: 'Gender',
      }
    );

    expect(mapped.dependent_var).toBe('Time since baseline');
    expect(mapped.event_var).toBe('Diagnosis');
    expect(mapped.indep_vars).toEqual(['Intercept', 'Gender[Male]']);
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

  it('maps standardized mean difference groups using the x-variable enum map', () => {
    const mapped = mapAlgorithmResultEnums(
      'standardized_mean_difference',
      { comparisons: [{ group1: '1', group2: '2', smd: -0.277 }] },
      { biol_sex: { '1': 'male', '2': 'female' } },
      { y: 'age', x: 'biol_sex' }
    );

    expect(mapped.comparisons).toEqual([{ group1: 'male', group2: 'female', smd: -0.277 }]);
  });

  it('labels k-means variables and the matching centre keys', () => {
    const mapped = mapAlgorithmResultEnums(
      'kmeans',
      { variables: ['age', 'nihss_24h'], clusters: [{ label: 'Cluster 0', center: { age: 79.5, nihss_24h: 2 } }] },
      {},
      {},
      { age: 'Age', nihss_24h: '24h score' }
    );

    expect(mapped.variables).toEqual(['Age', '24h score']);
    expect(mapped.clusters[0].center).toEqual({ Age: 79.5, '24h score': 2 });
  });

  it('labels the variable that opens each k-means profile line', () => {
    const mapped = mapAlgorithmResultEnums(
      'kmeans',
      {
        variables: ['nihss', 'nihss_24h'],
        clusters: [{ label: 'Cluster 0', center: {}, profile: ['nihss_24h is above the overall mean', 'nihss is below the overall mean'] }],
      },
      {},
      {},
      { nihss: 'Admission score', nihss_24h: '24h score' }
    );

    expect(mapped.clusters[0].profile).toEqual(['24h score is above the overall mean', 'Admission score is below the overall mean']);
  });

  it('labels a mixed model grouping variable sent as a list', () => {
    const mapped = mapAlgorithmResultEnums(
      'lmm',
      { grouping_var: ['hospit_unit'], indep_vars: ['Intercept'] },
      {},
      {},
      { hospit_unit: 'Hospitalization unit' }
    );

    expect(mapped.grouping_var).toEqual(['Hospitalization unit']);
  });
});
