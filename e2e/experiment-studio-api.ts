import { Page, Route } from '@playwright/test';

/** Signed-in user the studio guards accept. agreeNDA skips the terms page. */
export const STUDIO_USER = {
  username: 'ada',
  fullname: 'Ada Lovelace',
  email: 'ada@mip.test',
  subjectId: 'subject-ada',
  agreeNDA: true,
};

export interface StoredExperiment {
  uuid: string;
  name: string;
  created: string;
  finished: string;
  shared: boolean;
  viewed: boolean;
  status: string;
  analysis: Record<string, unknown>;
  result?: unknown;
  createdBy: typeof STUDIO_USER;
}

const inputField = (types: string[], extra: Record<string, unknown> = {}) => ({
  label: '',
  desc: '',
  types,
  required: false,
  ...extra,
});

/** Catalog entries the algorithm panel groups by CATEGORY_MAPPING. */
function algorithmSpecs() {
  const yReal = inputField(['real'], { required: true, max_count: 1 });
  const yNominal = inputField(['nominal'], { required: true, max_count: 1 });
  const xRealOrNominal = inputField(['real', 'nominal'], { required: true, min_count: 1, max_count: 1 });
  const xNominal = inputField(['nominal'], { required: true, min_count: 1, max_count: 1 });
  const yRealMany = inputField(['real'], { required: true, min_count: 1 });

  const spec = (
    name: string,
    label: string,
    y: Record<string, unknown>,
    x?: Record<string, unknown>,
    parameters: Record<string, unknown> | null = null,
  ) => ({
    name,
    label,
    desc: `${label} specification used by the mocked studio.`,
    type: 'algorithm',
    y,
    ...(x ? { x } : {}),
    requires_validation_datasets: false,
    parameters,
    required_preprocessing: [],
  });

  return [
    spec('linear_regression', 'Linear regression', yReal, inputField(['real', 'nominal'], { min_count: 0 }), {
      alpha: { label: 'Alpha', desc: 'Regularisation strength', types: ['real'], required: false, default: 0.05 },
    }),
    spec('logistic_regression', 'Logistic regression', yNominal, inputField(['real', 'nominal'], { required: true, min_count: 1 })),
    spec('pearson_correlation', 'Pearson correlation', yReal, xRealOrNominal),
    spec('ttest_independent', 'Independent t-test', yReal, xNominal),
    spec('anova_oneway', 'One-way ANOVA', yReal, xNominal),
    spec('chi_squared', 'Chi-squared', yNominal, xNominal),
    spec('naive_bayes_gaussian', 'Naive Bayes gaussian', yNominal, inputField(['real'], { required: true, min_count: 1 })),
    spec('naive_bayes_categorical', 'Naive Bayes categorical', yNominal, inputField(['nominal'], { required: true, min_count: 1 })),
    spec('kmeans', 'K-means', yRealMany),
    spec('pca', 'PCA', yRealMany),
    spec('describe', 'Describe', inputField(['real', 'nominal'], { required: true, min_count: 1 })),
    spec('histogram', 'Histogram', inputField(['real', 'nominal', 'text'], { required: true })),
  ];
}

function strokeModel() {
  return {
    uuid: 'dm-stroke',
    code: 'stroke',
    version: '1',
    label: 'Stroke',
    longitudinal: true,
    released: true,
    variables: [
      {
        code: 'dataset',
        label: 'Dataset',
        type: 'nominal',
        enumerations: [
          { code: 'chuv', label: 'CHUV' },
          { code: 'adni', label: 'ADNI' },
        ],
      },
      {
        code: 'visitid',
        label: 'Visit',
        type: 'nominal',
        enumerations: [
          { code: 'bl', label: 'Baseline' },
          { code: 'm12', label: 'Month 12' },
        ],
      },
      { code: 'age', label: 'Age', type: 'real', sql_type: 'real' },
      {
        code: 'sex',
        label: 'Sex',
        type: 'nominal',
        enumerations: [
          { code: 'M', label: 'Male' },
          { code: 'F', label: 'Female' },
        ],
      },
    ],
    groups: [],
  };
}

function kmeansReport(variables: string[]) {
  const codes = variables.filter(Boolean);
  const used = codes.length ? codes : ['age'];
  const center = (value: number) => Object.fromEntries(used.map((code) => [code, value]));
  return {
    status: 'success',
    result: {
      result_type: 'privacy_safe_cluster_report',
      selected_k: 2,
      k_selection: 'elbow',
      elbow: { k_min: 2, k_max: 6 },
      n_obs_interval: '80–100',
      clusters: [
        { cluster_id: '0', label: 'Cluster 0', size_interval: '40–50', interpretation: 'Higher scores' },
        { cluster_id: '1', label: 'Cluster 1', size_interval: '40–50', interpretation: 'Lower scores' },
      ],
      reusable_preprocessing: {
        schema_version: '1',
        preprocessing_name: 'kmeans_cluster_creator',
        cluster_variables: used,
        centers: { '0': center(80), '1': center(60) },
        source_context: {
          data_model: 'dementia:1',
          datasets: ['chuv', 'adni'],
          input_fingerprint: 'mock',
        },
        available_outputs: [],
        cluster_choices: [
          { cluster_id: '0', label: 'Cluster 0' },
          { cluster_id: '1', label: 'Cluster 1' },
        ],
      },
    },
  };
}

function dataModel() {
  return {
    uuid: 'dm-dementia',
    code: 'dementia',
    version: '1',
    label: 'Dementia',
    longitudinal: false,
    released: true,
    variables: [
      {
        code: 'dataset',
        label: 'Dataset',
        type: 'nominal',
        enumerations: [
          { code: 'chuv', label: 'CHUV' },
          { code: 'adni', label: 'ADNI' },
        ],
      },
      { code: 'age', label: 'Age', type: 'real', sql_type: 'real' },
      {
        code: 'sex',
        label: 'Sex',
        type: 'nominal',
        enumerations: [
          { code: 'M', label: 'Male' },
          { code: 'F', label: 'Female' },
        ],
      },
      {
        code: 'apoe',
        label: 'APOE',
        type: 'nominal',
        enumerations: [
          { code: 'e3', label: 'e3' },
          { code: 'e4', label: 'e4' },
        ],
      },
      { code: 'mmse', label: 'MMSE', type: 'real', sql_type: 'real' },
    ],
    groups: [],
  };
}

function describePayload(body: { analysis?: { algorithm?: { y?: string[] }; inputdata?: { variables?: string[] } } }) {
  const codes = body?.analysis?.algorithm?.y?.length
    ? body.analysis.algorithm.y
    : body?.analysis?.inputdata?.variables ?? [];
  const featurewise = codes
    .filter((code) => code && code !== 'dataset')
    .map((code) => {
      const nominal = code === 'sex' || code === 'apoe';
      return {
        variable: code,
        dataset: 'chuv',
        data: nominal
          ? { num_dtps: 100, num_na: 0, num_total: 100, counts: code === 'sex' ? { M: 40, F: 60 } : { e3: 70, e4: 30 } }
          : { num_dtps: 90, num_na: 10, num_total: 100, mean: 72, std: 8, min: 50, q1: 66, q2: 72, q3: 78, max: 95 },
      };
    });
  return { featurewise, dataset_labels: { chuv: 'CHUV', adni: 'ADNI' } };
}

function resultFor(name: string) {
  if (name === 'linear_regression') {
    return {
      title: 'Result Linear regression',
      dependent_var: 'age',
      indep_vars: ['sex', 'intercept'],
      n_obs: 100,
    };
  }
  return { title: `Result ${name}`, n_obs: 100 };
}

/** A saved run the dashboard can open straight into the studio. */
export function seedLinearExperiment(overrides: Partial<StoredExperiment> = {}): StoredExperiment {
  const now = new Date().toISOString();
  return {
    uuid: 'exp-seed-1',
    name: 'Baseline age model',
    created: now,
    finished: now,
    shared: false,
    viewed: true,
    status: 'success',
    createdBy: STUDIO_USER,
    analysis: {
      inputdata: {
        data_model: 'dementia:1',
        datasets: ['chuv', 'adni'],
        filters: null,
        variables: ['age', 'sex'],
      },
      preprocessing: [
        { name: 'missing_values_handler', parameters: { strategies: { age: 'drop', sex: 'drop' } } },
      ],
      algorithm: {
        name: 'linear_regression',
        y: ['age'],
        x: ['sex'],
        parameters: { alpha: 0.05 },
      },
    },
    result: resultFor('linear_regression'),
    ...overrides,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Intercept every `/services/*` call the studio and dashboard make.
 * One in-memory list stands in for PostgreSQL so save and re-open share a store.
 */
export async function installExperimentStudioApi(page: Page, initial: StoredExperiment[] = []): Promise<StoredExperiment[]> {
  const experiments = [...initial];
  let sequence = experiments.length;
  let specsLeft = 3;
  let markSpecsReady: () => void = () => undefined;
  const specsReady = new Promise<void>((resolve) => {
    markSpecsReady = resolve;
  });

  const noteSpec = () => {
    specsLeft -= 1;
    if (specsLeft <= 0) markSpecsReady();
  };

  await page.route('**/services/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method();

    const readBody = () => {
      const raw = request.postData();
      if (!raw) return {};
      try {
        return JSON.parse(raw) as Record<string, any>;
      } catch {
        return {};
      }
    };

    if (path === '/services/activeUser' && method === 'GET') {
      return json(route, STUDIO_USER);
    }

    if (path === '/services/experiment-folders' && method === 'GET') {
      return json(route, { folders: [] });
    }

    if (path === '/services/data-models' && method === 'GET') {
      return json(route, [dataModel(), strokeModel()]);
    }

    if (path === '/services/specifications/inputdata' && method === 'GET') {
      noteSpec();
      return json(route, {
        data_model: inputField(['text'], { required: true }),
        datasets: inputField(['text'], { required: true }),
        filters: inputField(['jsonObject']),
        variables: inputField(['real', 'int', 'text', 'nominal'], { required: true, min_count: 1 }),
      });
    }

    if (path === '/services/specifications/preprocessing' && method === 'GET') {
      noteSpec();
      return json(route, [
        {
          name: 'missing_values_handler',
          label: 'Missing values',
          desc: 'Decide what happens to missing values.',
          order: 1,
          parameters: {},
        },
        {
          name: 'outlier_winsorizer',
          label: 'Outlier winsorizer',
          desc: 'Cap extreme values.',
          order: 2,
          parameters: {},
        },
      ]);
    }

    if (path === '/services/specifications/algorithms' && method === 'GET') {
      noteSpec();
      return json(route, algorithmSpecs());
    }

    if (path === '/services/experiments/transient' && method === 'POST') {
      const body = readBody();
      const name = body?.analysis?.algorithm?.name;
      if (name === 'histogram') {
        return json(route, { bins: [50, 70, 90], counts: [10, 20], variable: body?.analysis?.algorithm?.y?.[0] ?? 'age' });
      }
      // Describe and outlier previews need featurewise rows. A real run needs status plus result.
      if (!name || name === 'describe' || name === 'outlier_report') {
        return json(route, describePayload(body));
      }
      if (name === 'kmeans') {
        const variables = body?.analysis?.algorithm?.y;
        return json(route, kmeansReport(Array.isArray(variables) ? variables : []));
      }
      return json(route, { status: 'success', result: resultFor(name) });
    }

    if (path === '/services/experiments' && method === 'GET') {
      return json(route, {
        experiments,
        totalExperiments: experiments.length,
        totalPages: experiments.length ? 1 : 0,
        currentPage: 0,
      });
    }

    if (path === '/services/experiments' && method === 'POST') {
      const body = readBody();
      const name = String(body?.analysis?.algorithm?.name ?? 'unknown');
      sequence += 1;
      const stored: StoredExperiment = {
        uuid: `exp-created-${sequence}`,
        name: String(body?.name ?? `experiment_${name}`),
        created: new Date().toISOString(),
        finished: new Date().toISOString(),
        shared: false,
        viewed: false,
        status: 'success',
        analysis: body?.analysis ?? {},
        result: resultFor(name),
        createdBy: STUDIO_USER,
      };
      experiments.unshift(stored);
      return json(route, { uuid: stored.uuid, status: 'pending' });
    }

    const experimentMatch = path.match(/^\/services\/experiments\/([^/]+)$/);
    if (experimentMatch && method === 'GET') {
      // Hydration reads the catalog. Hold the experiment until specifications have answered.
      await Promise.race([specsReady, new Promise((resolve) => setTimeout(resolve, 15_000))]);
      const found = experiments.find((experiment) => experiment.uuid === experimentMatch[1]);
      if (!found) return json(route, { message: 'not found' }, 404);
      return json(route, found);
    }

    if (experimentMatch && method === 'PATCH') {
      const found = experiments.find((experiment) => experiment.uuid === experimentMatch[1]);
      if (!found) return json(route, { message: 'not found' }, 404);
      const body = readBody();
      if (typeof body.name === 'string') found.name = body.name;
      if (typeof body.shared === 'boolean') found.shared = body.shared;
      return json(route, found);
    }

    return json(route, {});
  });

  return experiments;
}
