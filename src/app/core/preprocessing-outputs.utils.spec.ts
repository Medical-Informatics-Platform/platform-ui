import { describe, it, expect } from 'vitest';
import {
  PreprocessingOutputs,
  resolvePreprocessingOutputs,
} from './preprocessing-outputs.utils';

const PCA_OUTPUTS: PreprocessingOutputs = {
  new_column_names_param: 'new_column_names',
  columns: [
    {
      type: 'real',
      stattype: 'numerical',
      column_count_param: 'n_components',
      enumerations: null,
    },
  ],
};

const CATEGORICAL_OUTPUTS: PreprocessingOutputs = {
  new_column_names_param: 'new_column_names',
  columns: [
    {
      type: 'text',
      stattype: 'nominal',
      column_count_param: null,
      enumerations: {
        source_parameter_name: 'rules',
        source_type: 'dict_keys',
        additional_value_parameter_name: 'default_enumeration',
        prefix_parameter_name: null,
      },
    },
  ],
};

const KMEANS_OUTPUTS: PreprocessingOutputs = {
  new_column_names_param: 'new_column_names',
  columns: [
    {
      type: 'int',
      stattype: 'nominal',
      column_count_param: null,
      enumerations: {
        source_parameter_name: 'k',
        source_type: 'prefixed_range',
        additional_value_parameter_name: null,
        prefix_parameter_name: 'enumeration_prefix',
      },
    },
  ],
};

describe('resolvePreprocessingOutputs', () => {
  it('expands a PCA block by n_components', () => {
    expect(
      resolvePreprocessingOutputs(PCA_OUTPUTS, {
        n_components: 2,
        new_column_names: ['a', 'b'],
      }),
    ).toEqual([
      { code: 'a', type: 'real', stattype: 'numerical', enumerations: [] },
      { code: 'b', type: 'real', stattype: 'numerical', enumerations: [] },
    ]);
  });

  it('builds nominal categories from rules plus default', () => {
    const cols = resolvePreprocessingOutputs(CATEGORICAL_OUTPUTS, {
      new_column_names: ['grp'],
      rules: { lo: {}, hi: {} },
      default_enumeration: 'other',
    })!;
    expect(cols[0].enumerations.map((e) => e.code)).toEqual(['lo', 'hi', 'other']);
    expect(cols[0].enumerations.map((e) => e.label)).toEqual(['lo', 'hi', 'other']);
  });

  it('builds prefixed K-means categories', () => {
    const cols = resolvePreprocessingOutputs(KMEANS_OUTPUTS, {
      new_column_names: ['km'],
      k: 3,
      enumeration_prefix: 'cluster_',
    })!;
    expect(cols[0].enumerations.map((e) => e.code)).toEqual([
      'cluster_1',
      'cluster_2',
      'cluster_3',
    ]);
  });

  it('returns null on a name-count mismatch', () => {
    expect(
      resolvePreprocessingOutputs(PCA_OUTPUTS, {
        n_components: 2,
        new_column_names: ['a'],
      }),
    ).toBeNull();
  });

  it('returns null when a repeat count is missing or not a positive integer', () => {
    expect(
      resolvePreprocessingOutputs(PCA_OUTPUTS, {
        new_column_names: ['a', 'b'],
      }),
    ).toBeNull();
    expect(
      resolvePreprocessingOutputs(PCA_OUTPUTS, {
        n_components: 0,
        new_column_names: ['a', 'b'],
      }),
    ).toBeNull();
    expect(
      resolvePreprocessingOutputs(PCA_OUTPUTS, {
        n_components: true,
        new_column_names: ['a', 'b'],
      }),
    ).toBeNull();
  });

  it('returns null on a blank column name', () => {
    expect(
      resolvePreprocessingOutputs(PCA_OUTPUTS, {
        n_components: 2,
        new_column_names: ['a', '  '],
      }),
    ).toBeNull();
  });

  it('returns null on duplicate column names', () => {
    expect(
      resolvePreprocessingOutputs(PCA_OUTPUTS, {
        n_components: 2,
        new_column_names: ['a', 'a'],
      }),
    ).toBeNull();
  });

  it('returns null when the names are not an array', () => {
    expect(
      resolvePreprocessingOutputs(PCA_OUTPUTS, {
        n_components: 2,
        new_column_names: 'ab',
      }),
    ).toBeNull();
  });

  it('returns null when a dict_keys enumeration source is empty', () => {
    expect(
      resolvePreprocessingOutputs(CATEGORICAL_OUTPUTS, {
        new_column_names: ['grp'],
        rules: {},
      }),
    ).toBeNull();
  });

  it('omits the additional value when it is null', () => {
    const cols = resolvePreprocessingOutputs(CATEGORICAL_OUTPUTS, {
      new_column_names: ['grp'],
      rules: { lo: {} },
      default_enumeration: null,
    })!;
    expect(cols[0].enumerations.map((e) => e.code)).toEqual(['lo']);
  });

  it('returns null when a prefixed_range source or prefix is missing', () => {
    expect(
      resolvePreprocessingOutputs(KMEANS_OUTPUTS, {
        new_column_names: ['km'],
        enumeration_prefix: 'cluster_',
      }),
    ).toBeNull();
    expect(
      resolvePreprocessingOutputs(KMEANS_OUTPUTS, {
        new_column_names: ['km'],
        k: 2,
      }),
    ).toBeNull();
  });

  it('expands multiple columns with mixed repeat counts in order', () => {
    const multi: PreprocessingOutputs = {
      new_column_names_param: 'new_column_names',
      columns: [
        {
          type: 'real',
          stattype: 'numerical',
          column_count_param: 'n_components',
          enumerations: null,
        },
        {
          type: 'text',
          stattype: 'nominal',
          column_count_param: null,
          enumerations: {
            source_parameter_name: 'rules',
            source_type: 'dict_keys',
            additional_value_parameter_name: null,
            prefix_parameter_name: null,
          },
        },
      ],
    };
    const cols = resolvePreprocessingOutputs(multi, {
      n_components: 2,
      new_column_names: ['a', 'b', 'grp'],
      rules: { lo: {}, hi: {} },
    })!;
    expect(cols.map((c) => c.code)).toEqual(['a', 'b', 'grp']);
    expect(cols[2].enumerations.map((e) => e.code)).toEqual(['lo', 'hi']);
  });
});
