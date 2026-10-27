import {
  PCAReusablePreprocessing,
  buildPcaCreatorParameters,
  defaultPcaColumnNames,
  extractPcaRecipe,
} from './pca-column-source.utils';

const R: PCAReusablePreprocessing = {
  schema_version: '1',
  preprocessing_name: 'pca_column_creator',
  base_parameters: {
    variables: ['lefthippocampus', 'righthippocampus'],
    pca_variant: 'pca',
  },
  component_choices: [
    { component_id: 'PC1', explained_variance_ratio: 0.855 },
    { component_id: 'PC2', explained_variance_ratio: 0.145 },
  ],
};

describe('pca-column-source.utils', () => {
  describe('buildPcaCreatorParameters', () => {
    it('builds recipe-mode parameters with n_components from the selection', () => {
      expect(buildPcaCreatorParameters({
        recipe: R,
        selected: ['PC1', 'PC3'],
        names: ['pca_pc1', 'pca_pc3'],
      })).toEqual({
        reusable_preprocessing: R,
        selected_components: ['PC1', 'PC3'],
        new_column_names: ['pca_pc1', 'pca_pc3'],
        n_components: 2,
      });
    });

    it('builds fit-mode parameters without reusable_preprocessing', () => {
      expect(buildPcaCreatorParameters({
        variables: ['a', 'b'],
        selected: ['PC1'],
        names: ['pca_pc1'],
      })).not.toHaveProperty('reusable_preprocessing');
    });
  });

  describe('extractPcaRecipe', () => {
    it('returns null when schema_version is not 1', () => {
      expect(extractPcaRecipe({ reusable_preprocessing: { ...R, schema_version: '2' } })).toBeNull();
    });

    it('returns the recipe when schema_version is 1 and the name matches', () => {
      expect(extractPcaRecipe({ reusable_preprocessing: R })).toBe(R);
    });

    it('returns null when preprocessing_name is wrong', () => {
      expect(extractPcaRecipe({
        reusable_preprocessing: { ...R, preprocessing_name: 'kmeans_cluster_creator' },
      })).toBeNull();
    });
  });

  describe('defaultPcaColumnNames', () => {
    it('joins prefix and lowercased component ids', () => {
      expect(defaultPcaColumnNames('pca', ['PC1', 'PC2'])).toEqual(['pca_pc1', 'pca_pc2']);
      expect(defaultPcaColumnNames('pca2', ['PC1'])).toEqual(['pca2_pc1']);
    });
  });
});
