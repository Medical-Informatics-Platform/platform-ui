import { BackendExperiment } from '../models/backend-experiment.model';
import { BackendFilter } from '../models/filters.model';
import {
  KMEANS_CLUSTER_CREATOR,
  KMEANS_RESULT_TYPE,
  KMeansSourceContext,
  canonicalFilterKey,
  extractReusablePreprocessing,
  findKMeansReport,
  findReusablePreprocessing,
  kmeansCreatorClusterChoices,
  kmeansCreatorVariables,
  analysisSourceIsReusable,
  kmeansSourceIsReusable,
} from './kmeans-cluster-source.utils';

function rule(field: string, operator: string, value: unknown): any {
  return { id: `${field}-${operator}`, field, type: 'string', input: 'text', operator, value };
}

function group(condition: 'AND' | 'OR', rules: unknown[]): BackendFilter {
  return { condition, rules: rules as BackendFilter['rules'] };
}

function experiment(overrides: {
  algorithm?: string;
  status?: string;
  dataModel?: string;
  datasets?: string[];
  filters?: BackendFilter | null;
}): BackendExperiment {
  return {
    uuid: 'uuid-1',
    name: 'K-means run',
    created: '2024-01-01T00:00:00Z',
    finished: '2024-01-01T00:05:00Z',
    shared: false,
    viewed: false,
    status: overrides.status ?? 'success',
    analysis: {
      inputdata: {
        data_model: overrides.dataModel ?? 'Stroke:3.7',
        datasets: overrides.datasets ?? ['diabetes', 'hypertension'],
        filters: overrides.filters ?? null,
        variables: ['age'],
      },
      algorithm: { name: overrides.algorithm ?? 'kmeans' },
    },
    createdBy: {
      username: 'u',
      fullname: 'U',
      email: 'u@example.org',
      subjectId: 's',
      agreeNDA: false,
    },
  } as BackendExperiment;
}

const current: KMeansSourceContext = {
  dataModel: 'Stroke:3.7',
  datasets: ['hypertension', 'diabetes'],
  filters: group('AND', [rule('age', 'greater_or_equal', 18)]),
} satisfies KMeansSourceContext;

describe('kmeans-cluster-source.utils', () => {
  describe('canonicalFilterKey', () => {
    it('ignores object key order', () => {
      expect(canonicalFilterKey({ b: 1, a: { d: 2, c: 3 } }))
        .toBe(canonicalFilterKey({ a: { c: 3, d: 2 }, b: 1 }));
    });

    it('keeps array order significant', () => {
      expect(canonicalFilterKey([1, 2])).not.toBe(canonicalFilterKey([2, 1]));
    });

    it('treats undefined like null', () => {
      expect(canonicalFilterKey(undefined)).toBe('null');
      expect(canonicalFilterKey(undefined)).toBe(canonicalFilterKey(null));
    });

    it('drops undefined object values like request serialization does', () => {
      expect(canonicalFilterKey({ a: 1, b: undefined })).toBe(canonicalFilterKey({ a: 1 }));
    });
  });

  describe('analysisSourceIsReusable', () => {
    it('accepts a matching experiment regardless of dataset and filter key order', () => {
      const source = experiment({
        datasets: ['diabetes', 'hypertension'],
        filters: { rules: [rule('age', 'greater_or_equal', 18)], condition: 'AND' } as BackendFilter,
      });

      expect(analysisSourceIsReusable(source, 'kmeans', current)).toBe(true);
      expect(kmeansSourceIsReusable(source, current)).toBe(true);
    });

    it('accepts a matching PCA experiment when algorithmName is pca', () => {
      expect(analysisSourceIsReusable(
        experiment({ algorithm: 'pca' }),
        'pca',
        { ...current, filters: null },
      )).toBe(true);
      expect(kmeansSourceIsReusable(experiment({ algorithm: 'pca' }), { ...current, filters: null }))
        .toBe(false);
    });

    it('rejects a non-matching algorithm', () => {
      expect(analysisSourceIsReusable(experiment({ algorithm: 'pca' }), 'kmeans', { ...current, filters: null }))
        .toBe(false);
    });

    it('rejects a run that did not finish successfully', () => {
      expect(analysisSourceIsReusable(experiment({ status: 'error' }), 'kmeans', { ...current, filters: null }))
        .toBe(false);
    });

    it('rejects a different data model', () => {
      expect(analysisSourceIsReusable(experiment({ dataModel: 'MIP:1.0' }), 'kmeans', { ...current, filters: null }))
        .toBe(false);
    });

    it('rejects different datasets', () => {
      expect(analysisSourceIsReusable(experiment({ datasets: ['diabetes'] }), 'kmeans', { ...current, filters: null }))
        .toBe(false);
    });

    it('rejects different filters, including no source filters at all', () => {
      expect(analysisSourceIsReusable(experiment({ filters: null }), 'kmeans', current)).toBe(false);
      expect(analysisSourceIsReusable(
        experiment({ filters: group('OR', [rule('sex', 'equal', '1')]) }),
        'kmeans',
        current,
      )).toBe(false);
    });

    it('does not throw when the analysis is incomplete', () => {
      expect(analysisSourceIsReusable({ status: 'success' } as BackendExperiment, 'kmeans', current)).toBe(false);
      expect(analysisSourceIsReusable(
        { status: 'success', analysis: { algorithm: { name: 'kmeans' } } } as BackendExperiment,
        'kmeans',
        current,
      )).toBe(false);
    });
  });

  describe('extractReusablePreprocessing', () => {
    it('returns the preprocessing of a privacy_safe_cluster_report result', () => {
      const reusable = {
        enumeration_prefix: 'cluster_',
        preprocessing_name: KMEANS_CLUSTER_CREATOR,
        cluster_variables: ['age', 'sex'],
        centers: { '0': { age: 61.5, sex: 1 } },
        source_context: {
          data_model: 'Stroke:3.7',
          datasets: ['diabetes'],
          input_fingerprint: 'abc',
        },
        available_outputs: [{ code: 'cluster_id' }],
        cluster_choices: [{ cluster_id: '0', label: 'Cluster 1' }],
      };

      expect(extractReusablePreprocessing({
        result_type: KMEANS_RESULT_TYPE,
        reusable_preprocessing: reusable,
      })).toBe(reusable);
      // Legacy stored results predate the result_type marker.
      expect(extractReusablePreprocessing({ reusable_preprocessing: reusable })).toBe(reusable);
    });

    it('rejects a different report type even when the preprocessing block looks reusable', () => {
      const reusable = {
        enumeration_prefix: 'cluster_',
        preprocessing_name: KMEANS_CLUSTER_CREATOR,
        cluster_variables: ['age'],
        centers: { '0': { age: 61.5 } },
        source_context: { data_model: 'Stroke:3.7', datasets: ['diabetes'], input_fingerprint: 'abc' },
        available_outputs: [],
        cluster_choices: [{ cluster_id: '0', label: 'Cluster 1' }],
      };

      expect(extractReusablePreprocessing({
        result_type: 'privacy_safe_outlier_report',
        reusable_preprocessing: reusable,
      })).toBeNull();
    });

    it('returns null for missing or malformed preprocessing', () => {
      expect(extractReusablePreprocessing({ centers: [[1, 2]] })).toBeNull();
      expect(extractReusablePreprocessing(null)).toBeNull();
      expect(extractReusablePreprocessing({ reusable_preprocessing: null })).toBeNull();
    });

    it('finds the reusable block in nested transient envelopes', () => {
      const reusable = {
        enumeration_prefix: 'cluster_',
        preprocessing_name: KMEANS_CLUSTER_CREATOR,
        cluster_variables: ['age'],
        centers: { c1: { age: 40 } },
        source_context: { data_model: 'Stroke:3.7', datasets: ['diabetes'], input_fingerprint: 'fp' },
        available_outputs: [],
        cluster_choices: [{ cluster_id: 'c1', label: 'Cluster 1' }],
      };
      const report = { result_type: KMEANS_RESULT_TYPE, reusable_preprocessing: reusable, clusters: [] };

      expect(findReusablePreprocessing({ result: report })).toBe(reusable);
      expect(findReusablePreprocessing({ result: { result: report } })).toBe(reusable);
    });

    it('finds a nested K-means report for display', () => {
      const report = { selected_k: 2, clusters: [{ cluster_id: 'c1', label: 'Cluster 1' }] };
      expect(findKMeansReport({ result: { result: report } })).toBe(report);
      expect(findKMeansReport({ result: { message: 'nope' } })).toBeNull();
    });
  });

  describe('kmeansCreatorVariables / kmeansCreatorClusterChoices', () => {
    it('reads recipe cluster_variables and cluster_choices', () => {
      const creator = {
        reusable_preprocessing: {
          cluster_variables: ['age', 'bmi'],
          cluster_choices: [
            { cluster_id: 'cluster_0', label: 'Cluster 0' },
            { cluster_id: 'cluster_1', label: 'Cluster 1' },
          ],
        },
      };
      expect(kmeansCreatorVariables(creator)).toEqual(['age', 'bmi']);
      expect(kmeansCreatorClusterChoices(creator)).toEqual([
        { cluster_id: 'cluster_0', label: 'Cluster 0' },
        { cluster_id: 'cluster_1', label: 'Cluster 1' },
      ]);
    });

    it('falls back to fit-mode variables and synthetic cluster_1..k', () => {
      const creator = {
        variables: ['age', 'bmi'],
        k: 3,
        enumeration_prefix: 'cluster_',
      };
      expect(kmeansCreatorVariables(creator)).toEqual(['age', 'bmi']);
      expect(kmeansCreatorClusterChoices(creator)).toEqual([
        { cluster_id: 'cluster_1', label: 'cluster_1' },
        { cluster_id: 'cluster_2', label: 'cluster_2' },
        { cluster_id: 'cluster_3', label: 'cluster_3' },
      ]);
    });

    it('defaults enumeration_prefix to cluster_ when synthesizing', () => {
      expect(kmeansCreatorClusterChoices({ variables: ['age'], k: 2 })).toEqual([
        { cluster_id: 'cluster_1', label: 'cluster_1' },
        { cluster_id: 'cluster_2', label: 'cluster_2' },
      ]);
    });
  });
});
