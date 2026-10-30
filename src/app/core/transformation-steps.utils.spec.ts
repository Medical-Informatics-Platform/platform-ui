import { describe, it, expect } from 'vitest';
import {
  CREATOR_NAMES,
  fitSelectedCodes,
  fitVariablePool,
  newStepId,
  stepOutputNames,
  stepSourceVariables,
  splitPreprocessingSteps,
  TransformationStep,
} from './transformation-steps.utils';

const categoricalStep: TransformationStep = {
  id: 'c1',
  name: 'categorical_column_creator',
  parameters: {
    new_column_names: ['grp'],
    strategy: 'filter_rules',
    rules: { a: {}, b: {} },
    default_enumeration: 'other',
  },
};

const kmeansStep: TransformationStep = {
  id: 'k1',
  name: 'kmeans_cluster_creator',
  parameters: {
    new_column_names: ['km'] as [string],
    k: 2,
    enumeration_prefix: 'cluster_',
    reusable_preprocessing: { cluster_variables: ['a', 'b'] },
  },
};

const kmeansStepFallback: TransformationStep = {
  id: 'k2',
  name: 'kmeans_cluster_creator',
  parameters: {
    new_column_names: ['km2'] as [string],
    k: 2,
    enumeration_prefix: 'cluster_',
    variables: ['c', 'd'],
  },
};

const pcaStep: TransformationStep = {
  id: 'p1',
  name: 'pca_column_creator',
  parameters: {
    new_column_names: ['p1', 'p2'],
    n_components: 2,
    reusable_preprocessing: { base_parameters: { variables: ['x', 'y'] } },
  },
};

const pcaStepFallback: TransformationStep = {
  id: 'p2',
  name: 'pca_column_creator',
  parameters: { new_column_names: ['p3'], n_components: 1, variables: ['z'] },
};

describe('CREATOR_NAMES', () => {
  it('covers the three column-creating steps', () => {
    expect([...CREATOR_NAMES].sort()).toEqual([
      'categorical_column_creator',
      'kmeans_cluster_creator',
      'pca_column_creator',
    ]);
  });
});

describe('stepSourceVariables', () => {
  it('returns the field codes referenced inside a categorical step rules, not the rule keys', () => {
    expect(
      stepSourceVariables({
        id: 'c',
        name: 'categorical_column_creator',
        parameters: {
          new_column_names: ['grp'],
          rules: {
            a: { condition: 'AND', rules: [{ id: 'age', field: 'age', type: 'integer', input: 'number', operator: 'less', value: 60 }] },
            b: { condition: 'AND', rules: [{ field: 'sex', operator: 'in', value: ['1', '2'] }] },
          },
        },
      }),
    ).toEqual(['age', 'sex']);
  });

  it('returns an empty list for a categorical step with no rules', () => {
    expect(
      stepSourceVariables({
        id: 'c',
        name: 'categorical_column_creator',
        parameters: { new_column_names: ['g'] },
      }),
    ).toEqual([]);
  });

  it('returns an empty list for a categorical step whose rule filters reference no field', () => {
    expect(stepSourceVariables(categoricalStep)).toEqual([]);
  });

  it('reads cluster_variables for a kmeans step, falling back to variables', () => {
    expect(stepSourceVariables(kmeansStep)).toEqual(['a', 'b']);
    expect(stepSourceVariables(kmeansStepFallback)).toEqual(['c', 'd']);
  });

  it('reads base_parameters.variables for a pca step, falling back to variables', () => {
    expect(stepSourceVariables(pcaStep)).toEqual(['x', 'y']);
    expect(stepSourceVariables(pcaStepFallback)).toEqual(['z']);
  });
});

describe('stepOutputNames', () => {
  it('reads new_column_names', () => {
    expect(stepOutputNames(categoricalStep)).toEqual(['grp']);
    expect(stepOutputNames(pcaStep)).toEqual(['p1', 'p2']);
  });

  it('returns an empty list when new_column_names is absent', () => {
    expect(
      stepOutputNames({
        id: 'x',
        name: 'categorical_column_creator',
        parameters: {},
      }),
    ).toEqual([]);
  });
});

describe('splitPreprocessingSteps', () => {
  it('keeps the transformation order and gives each step a unique id', () => {
    const { singletons, transformations } = splitPreprocessingSteps([
      { name: 'missing_values_handler', parameters: { strategies: { a: 'drop' } } },
      { name: 'pca_column_creator', parameters: { new_column_names: ['a'] } },
      { name: 'categorical_column_creator', parameters: { new_column_names: ['b'] } },
      { name: 'pca_column_creator', parameters: { new_column_names: ['c'] } },
    ]);

    expect(transformations.map((t) => t.name)).toEqual([
      'pca_column_creator',
      'categorical_column_creator',
      'pca_column_creator',
    ]);
    expect(singletons).toEqual({ missing_values_handler: { strategies: { a: 'drop' } } });

    const ids = transformations.map((t) => t.id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every singleton step out of the transformation list', () => {
    const { transformations, singletons } = splitPreprocessingSteps([
      { name: 'outlier_winsorizer', parameters: { strategies: { age: 'iqr' } } },
      { name: 'longitudinal_transformer', parameters: { strategies: { age: 'diff' } } },
    ]);
    expect(transformations).toEqual([]);
    expect(Object.keys(singletons).sort()).toEqual([
      'longitudinal_transformer',
      'outlier_winsorizer',
    ]);
  });

  it('returns empty results for an empty step list', () => {
    const { singletons, transformations } = splitPreprocessingSteps([]);
    expect(singletons).toEqual({});
    expect(transformations).toEqual([]);
  });
});

describe('newStepId', () => {
  it('returns distinct 32-character hex ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newStepId()));
    expect(ids.size).toBe(50);
    ids.forEach((id) => expect(id).toMatch(/^[0-9a-f]{32}$/));
  });
});

describe('fitVariablePool / fitSelectedCodes', () => {
  const steps: TransformationStep[] = [
    { id: 'pca', name: 'pca_column_creator', parameters: { new_column_names: ['pca_pc1'] } },
    { id: 'km', name: 'kmeans_cluster_creator', parameters: { new_column_names: ['km_score'] } },
    { id: 'late', name: 'pca_column_creator', parameters: { new_column_names: ['late_pc1'] } },
  ];
  const candidates = [
    { code: 'age', type: 'real' },
    { code: 'sex', type: 'nominal' },
    { code: 'pca_pc1', type: 'real', isCreatedColumn: true },
    { code: 'km_score', type: 'real', isCreatedColumn: true },
    { code: 'late_pc1', type: 'real', isCreatedColumn: true },
    { code: 'age', type: 'real' },
  ];

  it('keeps numerical CDEs and earlier outputs, not own, later, nominal or repeated codes', () => {
    expect(fitVariablePool(steps, 'km', candidates).map((variable) => variable.code)).toEqual(['age', 'pca_pc1']);
  });

  it('starts CDEs selected and created columns unselected; a toggle flips each', () => {
    const pool = fitVariablePool(steps, 'km', candidates);
    expect(fitSelectedCodes(pool, new Set())).toEqual(['age']);
    expect(fitSelectedCodes(pool, new Set(['age', 'pca_pc1']))).toEqual(['pca_pc1']);
  });
});
