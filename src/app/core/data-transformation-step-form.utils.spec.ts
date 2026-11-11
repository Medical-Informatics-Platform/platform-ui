import { describe, expect, it } from 'vitest';
import { RawPreprocessingStep } from '../models/backend-algorithms.model';
import {
  buildStepParameters,
  defaultStepValues,
  filterStepParameters,
  isGenericCatalogStep,
  stepFields,
  stepValuesFromParameters,
  summarizeStepParameters,
  unsupportedRequiredFields,
  isPreprocessingSingleton,
  isTransformationSingleton,
  stepNote,
  stepStage,
  valueOptionsForVariable,
} from './data-transformation-step-form.utils';

const param = (extra: Record<string, unknown>) => ({
  label: 'L', desc: 'D', types: ['text'], required: false, multiple: false, default: null,
  enums: null, dict_keys_enums: null, dict_values_type: null, dict_values_enums: null, min: null, max: null,
  ...extra,
});

/** Assumed shape of the engine's outlier detector step. */
const outlierDetector = {
  name: 'outlier_detector', label: 'Outlier Detector', desc: 'Flags outliers.',
  parameters: {
    strategies: param({
      types: ['dict'], required: true,
      dict_keys_enums: { type: 'input_var_names', source: ['variables'] },
      dict_values_enums: { type: 'list', source: ['zscore', 'robust'] },
    }),
    threshold: param({ types: ['real'], default: 3, min: 0 }),
  },
} as unknown as RawPreprocessingStep;

const indicator = {
  name: 'missing_indicator', label: 'Missing Indicator', desc: 'Adds indicator columns.',
  parameters: {
    variables: param({ types: ['text'], required: true, multiple: true }),
    new_column_names: param({ types: ['text'], required: true, multiple: true }),
    sparse: param({ types: ['bool'], default: false }),
  },
} as unknown as RawPreprocessingStep;

describe('preprocessing step form utils', () => {
  it('leaves the dedicated singletons and the creators to their own stations', () => {
    for (const name of ['missing_values_handler', 'outlier_winsorizer', 'longitudinal_transformer',
      'variable_transformer', 'variable_scaler', 'categorical_column_creator', 'kmeans_cluster_creator', 'pca_column_creator']) {
      expect(isGenericCatalogStep(name)).toBe(false);
    }
    expect(isGenericCatalogStep('outlier_detector')).toBe(true);
    expect(isGenericCatalogStep('missing_indicator')).toBe(true);
  });

  it('derives field kinds from the parameter schema', () => {
    expect(stepFields(outlierDetector).map((f) => [f.key, f.kind, f.itemKind, f.required]))
      .toEqual([['strategies', 'variable-map', 'enum', true], ['threshold', 'real', 'real', false]]);
    expect(stepFields(indicator).map((f) => [f.key, f.kind]))
      .toEqual([['variables', 'variables'], ['new_column_names', 'list'], ['sparse', 'bool']]);
  });

  it('builds a per-variable map payload with a number parameter', () => {
    const fields = stepFields(outlierDetector);
    const values = { ...defaultStepValues(fields), strategies: { age: 'zscore', mmse: 'robust', gone: 'zscore', blank: '' }, threshold: '2.5' };
    const { parameters, errors } = buildStepParameters(fields, values, new Set(['age', 'mmse', 'blank']));
    expect(errors).toEqual({});
    expect(parameters).toEqual({ strategies: { age: 'zscore', mmse: 'robust' }, threshold: 2.5 });
  });

  it('sends the schema default and omits an emptied optional number', () => {
    const fields = stepFields(outlierDetector);
    expect(defaultStepValues(fields)['threshold']).toBe('3');
    const cleared = buildStepParameters(fields, { strategies: { age: 'zscore' }, threshold: '' }, null);
    expect(cleared.parameters).toEqual({ strategies: { age: 'zscore' } });
  });

  it('reports a required field left empty and bad numbers instead of guessing', () => {
    const fields = stepFields(outlierDetector);
    expect(buildStepParameters(fields, defaultStepValues(fields), null).errors['strategies']).toMatch(/required/);
    expect(buildStepParameters(fields, { strategies: { a: 'zscore' }, threshold: '-1' }, null).errors['threshold']).toMatch(/at least 0/);
    expect(buildStepParameters(fields, { strategies: { a: 'zscore' }, threshold: 'x' }, null).errors['threshold']).toMatch(/number/);
  });

  it('builds variable lists, name lists and booleans', () => {
    const fields = stepFields(indicator);
    const values = { variables: ['age', 'mmse'], new_column_names: 'age_na, mmse_na', sparse: true };
    expect(buildStepParameters(fields, values, new Set(['age', 'mmse'])).parameters)
      .toEqual({ variables: ['age', 'mmse'], new_column_names: ['age_na', 'mmse_na'], sparse: true });
    // A deselected variable drops out of the list; with none left the required list is an error.
    expect(buildStepParameters(fields, values, new Set(['x'])).errors['variables']).toMatch(/required/);
  });

  it('round-trips applied parameters into the form', () => {
    const fields = stepFields(indicator);
    const parameters = { variables: ['age'], new_column_names: ['age_na'], sparse: false };
    expect(buildStepParameters(fields, stepValuesFromParameters(fields, parameters), null).parameters).toEqual(parameters);
  });

  it('trims variable-bound parameters to the selection and drops a step left without any', () => {
    const fields = stepFields(outlierDetector);
    const params = { strategies: { age: 'zscore', mmse: 'robust' }, threshold: 3 };
    expect(filterStepParameters(fields, params, new Set(['age']))).toEqual({ strategies: { age: 'zscore' }, threshold: 3 });
    expect(filterStepParameters(fields, params, new Set(['other']))).toBeNull();
  });

  it('marks required parameters it cannot edit', () => {
    const spec = { name: 'x', label: 'X', desc: '', parameters: { reusable_preprocessing: param({ types: ['dict'], required: true }) } } as unknown as RawPreprocessingStep;
    expect(unsupportedRequiredFields(stepFields(spec)).map((f) => f.key)).toEqual(['reusable_preprocessing']);
  });

  it('summarizes parameters with variable labels', () => {
    expect(summarizeStepParameters({ strategies: { age: 'zscore' }, threshold: 3, variables: ['mmse'] }, { age: 'Age', mmse: 'MMSE' }))
      .toEqual(['Age: zscore', 'threshold: 3', 'variables: MMSE']);
  });

  describe('global imputer contract', () => {
    const imputer = {
      name: 'global_imputer', label: 'Global Imputer', desc: '',
      parameters: {
        strategies: param({
          types: ['dict'], required: true,
          dict_keys_enums: { type: 'input_var_names', source: ['variables'] },
          dict_values_enums: { type: 'list', source: ['mean', 'median', 'most_frequent', 'constant'] },
        }),
        fill_values: param({ types: ['dict'], dict_keys_enums: { type: 'input_var_names', source: ['variables'] } }),
      },
    } as unknown as RawPreprocessingStep;

    it('offers mean and median to numerical variables and most_frequent to nominal ones; constant to both', () => {
      const options = ['mean', 'median', 'most_frequent', 'constant'];
      expect(valueOptionsForVariable('global_imputer', options, true)).toEqual(['mean', 'median', 'constant']);
      expect(valueOptionsForVariable('global_imputer', options, false)).toEqual(['most_frequent', 'constant']);
      expect(valueOptionsForVariable('other_step', options, false)).toEqual(options);
    });

    it('sends fill values only for constant variables, as numbers for numerical ones', () => {
      const fields = stepFields(imputer);
      const values = {
        strategies: { age: 'constant', sex: 'constant', mmse: 'mean' },
        fill_values: { age: '0', sex: 'F', mmse: '9' },
      };
      const { parameters, errors } = buildStepParameters(fields, values, null, { stepName: 'global_imputer', numericalCodes: new Set(['age', 'mmse']) });
      expect(errors).toEqual({});
      expect(parameters).toEqual({
        strategies: { age: 'constant', sex: 'constant', mmse: 'mean' },
        fill_values: { age: 0, sex: 'F' },
      });
    });

    it('rejects a non-numeric fill value for a numerical variable', () => {
      const fields = stepFields(imputer);
      const result = buildStepParameters(fields, { strategies: { age: 'constant' }, fill_values: { age: 'abc' } }, null, { stepName: 'global_imputer', numericalCodes: new Set(['age']) });
      expect(result.errors['fill_values']).toMatch(/number/);
    });
  });
});

describe('pipeline stage of each catalog step', () => {
  // In place and the same meaning and range: Preprocessing. A new column or a changed meaning: Data transformation.
  const PREPROCESSING = ['missing_values_handler', 'outlier_winsorizer', 'global_imputer', 'global_winsorizer'];
  const TRANSFORMATION = [
    'kmeans_cluster_creator', 'pca_column_creator', 'categorical_column_creator', 'longitudinal_transformer',
    'variable_transformer', 'variable_scaler', 'missing_indicator', 'outlier_detector', 'one_hot_encoder', 'ordinal_encoder',
  ];

  it('puts the in-place steps in Preprocessing and every other catalog step in Data transformation', () => {
    for (const name of PREPROCESSING) expect(stepStage(name), name).toBe('preprocessing');
    for (const name of TRANSFORMATION) expect(stepStage(name), name).toBe('transformation');
    expect(PREPROCESSING.length + TRANSFORMATION.length).toBe(14);
  });

  it('keeps the column creators out of both singleton groups', () => {
    for (const name of ['kmeans_cluster_creator', 'pca_column_creator', 'categorical_column_creator']) {
      expect(isTransformationSingleton(name)).toBe(false);
      expect(isPreprocessingSingleton(name)).toBe(false);
    }
    expect(isTransformationSingleton('variable_scaler')).toBe(true);
    expect(isPreprocessingSingleton('global_imputer')).toBe(true);
  });

  it('files a step the engine adds later under Data transformation until it is classified', () => {
    expect(stepStage('some_future_step')).toBe('transformation');
  });

  it('explains the outlier detector and the missing indicator, whose position the stage rule does not cover', () => {
    expect(stepNote('outlier_detector')).toMatch(/Drop and Set missing edit the data in place/);
    expect(stepNote('missing_indicator')).toMatch(/before missing values/);
    expect(stepNote('one_hot_encoder')).toBe('');
  });
});
