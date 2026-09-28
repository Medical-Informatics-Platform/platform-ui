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

  describe('kmeansSourceIsReusable', () => {
    it('accepts a matching experiment regardless of dataset and filter key order', () => {
      const source = experiment({
        datasets: ['diabetes', 'hypertension'],
        filters: { rules: [rule('age', 'greater_or_equal', 18)], condition: 'AND' } as BackendFilter,
      });

      expect(kmeansSourceIsReusable(source, current)).toBeTrue();
    });

    it('rejects a non K-means experiment', () => {
      expect(kmeansSourceIsReusable(experiment({ algorithm: 'pca' }), { ...current, filters: null }))
        .toBeFalse();
    });

    it('rejects a run that did not finish successfully', () => {
      expect(kmeansSourceIsReusable(experiment({ status: 'error' }), { ...current, filters: null }))
        .toBeFalse();
    });

    it('rejects a different data model', () => {
      expect(kmeansSourceIsReusable(experiment({ dataModel: 'MIP:1.0' }), { ...current, filters: null }))
        .toBeFalse();
    });

    it('rejects different datasets', () => {
      expect(kmeansSourceIsReusable(experiment({ datasets: ['diabetes'] }), { ...current, filters: null }))
        .toBeFalse();
    });

    it('rejects different filters, including no source filters at all', () => {
      expect(kmeansSourceIsReusable(experiment({ filters: null }), current)).toBeFalse();
      expect(kmeansSourceIsReusable(experiment({ filters: group('OR', [rule('sex', 'equal', '1')]) }), current))
        .toBeFalse();
    });

    it('does not throw when the analysis is incomplete', () => {
      expect(kmeansSourceIsReusable({ status: 'success' } as BackendExperiment, current)).toBeFalse();
      expect(kmeansSourceIsReusable(
        { status: 'success', analysis: { algorithm: { name: 'kmeans' } } } as BackendExperiment,
        current
      )).toBeFalse();
    });
  });

  describe('extractReusablePreprocessing', () => {
    it('returns the preprocessing of a privacy_safe_cluster_report result', () => {
      const reusable = {
        schema_version: '1',
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
        schema_version: '1',
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
        schema_version: '1',
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
});
