import { describe, expect, it } from 'vitest';
import { stepIcon, stepPickerGroups } from './step-picker.utils';

describe('stepIcon', () => {
  it('gives every known step its own icon', () => {
    expect(stepIcon('outlier_winsorizer')).toBe('fas fa-line-chart');
    expect(stepIcon('global_imputer')).toBe('fas fa-fill-drip');
    expect(stepIcon('global_winsorizer')).toBe('fas fa-compress');
    expect(stepIcon('variable_transformer')).toBe('fas fa-arrow-up-right-dots');
    expect(stepIcon('variable_scaler')).toBe('fas fa-ruler-horizontal');
    expect(stepIcon('one_hot_encoder')).toBe('fas fa-table-columns');
    expect(stepIcon('ordinal_encoder')).toBe('fas fa-arrow-down-1-9');
    expect(stepIcon('missing_indicator')).toBe('fas fa-flag');
    expect(stepIcon('outlier_detector')).toBe('fas fa-magnifying-glass-chart');
    expect(stepIcon('longitudinal_transformer')).toBe('fas fa-code-compare');
  });

  it('falls back to the branch icon for a step it does not know', () => {
    expect(stepIcon('a_step_the_engine_adds_later')).toBe('fas fa-code-branch');
  });
});

describe('stepPickerGroups', () => {
  it('returns no group when nothing can be added', () => {
    expect(stepPickerGroups([])).toEqual([]);
  });

  it('sorts the preprocessing steps into missing values, then outliers', () => {
    const groups = stepPickerGroups([
      { name: 'outlier_winsorizer' },
      { name: 'global_imputer', label: 'Global Imputer', desc: 'Impute missing values in place.' },
      { name: 'global_winsorizer', label: 'Global Winsorizer', desc: 'Clip numerical variables.' },
    ]);

    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ['missing', 'Fill missing values'],
      ['outliers', 'Cap outliers'],
    ]);
    expect(groups[0].options.map((option) => option.id)).toEqual(['global_imputer']);
    // Inside a group the steps keep the order they were given in.
    expect(groups[1].options.map((option) => option.id)).toEqual(['outlier_winsorizer', 'global_winsorizer']);
  });

  it('sorts the transformation steps by purpose, in a fixed order', () => {
    const groups = stepPickerGroups([
      { name: 'kmeans_cluster_creator', label: 'K-means cluster column', desc: 'Group records.' },
      { name: 'longitudinal_transformer' },
      { name: 'outlier_detector', label: 'Outlier Detector', desc: 'Detect outliers.' },
      { name: 'ordinal_encoder', label: 'Ordinal Encoder', desc: 'Integer codes.' },
      { name: 'variable_scaler' },
      { name: 'missing_indicator', label: 'Missing Indicator', desc: 'Flag gaps.' },
      { name: 'one_hot_encoder', label: 'One-Hot Encoder', desc: 'Dummy columns.' },
      { name: 'variable_transformer' },
      { name: 'categorical_column_creator', label: 'Nominal column from rules', desc: 'Name categories.' },
      { name: 'pca_column_creator', label: 'PCA component columns', desc: 'Project.' },
    ]);

    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ['reshape', 'Reshape and scale'],
      ['encode', 'Encode categories'],
      ['flag', 'Flag records'],
      ['visits', 'Compare visits'],
      ['create', 'Create a column'],
    ]);
    expect(groups.map((group) => group.options.map((option) => option.id))).toEqual([
      ['variable_scaler', 'variable_transformer'],
      ['ordinal_encoder', 'one_hot_encoder'],
      ['outlier_detector', 'missing_indicator'],
      ['longitudinal_transformer'],
      ['kmeans_cluster_creator', 'categorical_column_creator', 'pca_column_creator'],
    ]);
  });

  it('names the steps that own a station exactly as their station is titled', () => {
    const options = stepPickerGroups([
      { name: 'outlier_winsorizer' },
      { name: 'variable_transformer' },
      { name: 'variable_scaler' },
      { name: 'longitudinal_transformer' },
    ]).flatMap((group) => group.options);

    expect(options.map((option) => option.title)).toEqual([
      'Outlier Handling',
      'Variable Transforms',
      'Variable Scaling',
      'Longitudinal Transformation',
    ]);
    expect(options[0]).toEqual({
      id: 'outlier_winsorizer',
      icon: 'fas fa-line-chart',
      title: 'Outlier Handling',
      subtitle: 'Cap extreme values so a few outliers do not skew results. Numerical variables only.',
    });
    expect(options[1].subtitle).toBe(
      'Reshape skewed values with log, square root, Yeo-Johnson or quantile. Numerical variables only.',
    );
    expect(options[2].subtitle).toBe(
      'Bring numerical variables to a comparable range: standard, robust, min-max or max absolute.',
    );
    expect(options[3].subtitle).toBe('Compare two visits per variable. Required for two-visit pathologies.');
  });

  it('takes the title and description of a catalog step from the engine', () => {
    const [group] = stepPickerGroups([
      { name: 'one_hot_encoder', label: 'One-Hot Encoder', desc: 'Create 0/1 dummy columns from categorical variables.' },
    ]);

    expect(group.options).toEqual([{
      id: 'one_hot_encoder',
      icon: 'fas fa-table-columns',
      title: 'One-Hot Encoder',
      subtitle: 'Create 0/1 dummy columns from categorical variables.',
    }]);
  });

  it('prefers the icon handed in with the step', () => {
    const [group] = stepPickerGroups([
      { name: 'kmeans_cluster_creator', label: 'K-means cluster column', desc: 'Group records.', icon: 'fas fa-diagram-project' },
    ]);

    expect(group.options[0].icon).toBe('fas fa-diagram-project');
  });

  it('keeps a step it does not know, under its own name, in a last group', () => {
    const groups = stepPickerGroups([
      { name: 'brand_new_step' },
      { name: 'variable_scaler' },
    ]);

    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ['reshape', 'Reshape and scale'],
      ['other', 'More steps'],
    ]);
    expect(groups[1].options).toEqual([
      { id: 'brand_new_step', icon: 'fas fa-code-branch', title: 'brand_new_step', subtitle: '' },
    ]);
  });
});
