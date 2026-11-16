import { Page, Route } from '@playwright/test';

/** Signed-in user the studio guards accept. agreeNDA skips the terms page. */
export const STUDIO_USER = {
  username: 'ada',
  fullname: 'Ada Lovelace',
  email: 'ada@mip.test',
  subjectId: 'subject-ada',
  agreeNDA: true,
};

export interface StoredAnalysis {
  uuid: string;
  name: string;
  created: string;
  finished: string;
  shared: boolean;
  viewed: boolean;
  status: string;
  analysisRequest: Record<string, unknown>;
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
  // Slots declare the statistical `types` that match the CDE type one-to-one.
  const NUMERICAL = ['numerical'];
  const CATEGORICAL = ['nominal', 'ordinal', 'binary'];
  const yReal = inputField(NUMERICAL, { required: true, max_count: 1 });
  const yNominal = inputField(CATEGORICAL, { required: true, max_count: 1 });
  const yBinary = inputField(['binary'], { required: true, max_count: 1 });
  const xRealOrNominal = inputField([...NUMERICAL, ...CATEGORICAL], { required: true, min_count: 1, max_count: 1 });
  const xNominal = inputField(CATEGORICAL, { required: true, min_count: 1, max_count: 1 });
  const yRealMany = inputField(NUMERICAL, { required: true, min_count: 1 });

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
    spec('linear_regression', 'Linear regression', yReal, inputField([...NUMERICAL, ...CATEGORICAL], { min_count: 0 }), {
      alpha: { label: 'Alpha', desc: 'Regularisation strength', types: ['real'], required: false, default: 0.05 },
    }),
    spec('logistic_regression', 'Logistic regression', yBinary, inputField([...NUMERICAL, ...CATEGORICAL], { required: true, min_count: 1 })),
    spec('pearson_correlation', 'Pearson correlation', yReal, xRealOrNominal),
    spec('ttest_independent', 'Independent t-test', yReal, xNominal),
    spec('anova_oneway', 'One-way ANOVA', yReal, xNominal),
    spec('chi_squared', 'Chi-squared', yNominal, xNominal),
    spec('naive_bayes_gaussian', 'Naive Bayes gaussian', yNominal, inputField(NUMERICAL, { required: true, min_count: 1 })),
    spec('naive_bayes_categorical', 'Naive Bayes categorical', yNominal, inputField(CATEGORICAL, { required: true, min_count: 1 })),
    spec('kmeans', 'K-means', yRealMany),
    spec('pca', 'PCA', yRealMany),
    spec('describe', 'Describe', inputField([...NUMERICAL, ...CATEGORICAL], { required: true, min_count: 1 })),
    spec('histogram', 'Histogram', inputField([...NUMERICAL, ...CATEGORICAL], { required: true })),
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
          { code: '1', label: 'CHUV' },
          { code: '2', label: 'ADNI' },
        ],
      },
      {
        code: 'visitid',
        label: 'Visit',
        type: 'nominal',
        enumerations: [
          { code: '1', label: 'Baseline' },
          { code: '2', label: 'Month 12' },
        ],
      },
      { code: 'age', label: 'Age', type: 'continuous' },
      {
        code: 'sex',
        label: 'Sex',
        type: 'binary',
        enumerations: [
          { code: '0', label: 'Male' },
          { code: '1', label: 'Female' },
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
        enumeration_prefix: 'cluster_',
        preprocessing_name: 'kmeans_cluster_creator',
        cluster_variables: used,
        centers: { '0': center(80), '1': center(60) },
        source_context: {
          data_model: 'dementia:1',
          datasets: ['1', '2'],
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
          { code: '1', label: 'CHUV' },
          { code: '2', label: 'ADNI' },
        ],
      },
      { code: 'age', label: 'Age', type: 'continuous' },
      {
        code: 'sex',
        label: 'Sex',
        type: 'binary',
        enumerations: [
          { code: '0', label: 'Male' },
          { code: '1', label: 'Female' },
        ],
      },
      {
        code: 'apoe',
        label: 'APOE',
        type: 'nominal',
        enumerations: [
          { code: '1', label: 'e3' },
          { code: '2', label: 'e4' },
        ],
      },
      { code: 'mmse', label: 'MMSE', type: 'continuous' },
    ],
    groups: [],
  };
}

interface NumericalStats {
  num_dtps: number;
  num_na: number;
  num_total: number;
  mean: number;
  std: number;
  min: number;
  q1: number;
  q2: number;
  q3: number;
  max: number;
}

/**
 * Per-dataset summaries in the shape of Exaflow's `describe` (exaflow
 * algorithms/exareme3/statistics/describe.py). Unknown numerical codes reuse `age`.
 */
const NUMERICAL_STATS: Record<string, Record<string, NumericalStats>> = {
  age: {
    '1': { num_dtps: 48, num_na: 2, num_total: 50, mean: 71.6, std: 7.9, min: 52, q1: 66, q2: 72, q3: 77, max: 91 },
    '2': { num_dtps: 47, num_na: 3, num_total: 50, mean: 73.1, std: 8.4, min: 55, q1: 67, q2: 73, q3: 79, max: 94 },
  },
  mmse: {
    '1': { num_dtps: 45, num_na: 5, num_total: 50, mean: 24.6, std: 3.9, min: 13, q1: 22, q2: 25, q3: 28, max: 30 },
    '2': { num_dtps: 49, num_na: 1, num_total: 50, mean: 25.3, std: 3.4, min: 15, q1: 23, q2: 26, q3: 28, max: 30 },
  },
};

/** Category counts per dataset, for nominal variables and the columns the studio derives. */
const NOMINAL_COUNTS: Record<string, Record<string, Record<string, number>>> = {
  sex: { '1': { '0': 22, '1': 28 }, '2': { '0': 24, '1': 26 } },
  apoe: { '1': { '1': 36, '2': 14 }, '2': { '1': 33, '2': 17 } },
  sex_group: { '1': { female: 28, other: 22 }, '2': { female: 26, other: 24 } },
  kmeans_cluster: { '1': { '0': 23, '1': 25 }, '2': { '0': 22, '1': 25 } },
};

/** The `all datasets` row: summed counts, pooled mean and standard deviation, no quartiles. */
function globalStats(rows: NumericalStats[]) {
  const n = rows.reduce((sum, row) => sum + row.num_dtps, 0);
  const sx = rows.reduce((sum, row) => sum + row.mean * row.num_dtps, 0);
  const sxx = rows.reduce((sum, row) => sum + (row.num_dtps - 1) * row.std ** 2 + row.num_dtps * row.mean ** 2, 0);
  const mean = sx / n;
  return {
    num_dtps: n,
    num_na: rows.reduce((sum, row) => sum + row.num_na, 0),
    num_total: rows.reduce((sum, row) => sum + row.num_total, 0),
    mean,
    std: Math.sqrt((sxx - n * mean ** 2) / (n - 1)),
    min: Math.min(...rows.map((row) => row.min)),
    max: Math.max(...rows.map((row) => row.max)),
  };
}

function nominalTotals(rows: { num_dtps: number; num_na: number; num_total: number; counts: Record<string, number> }[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) for (const [level, count] of Object.entries(row.counts)) counts[level] = (counts[level] ?? 0) + count;
  return {
    num_dtps: rows.reduce((sum, row) => sum + row.num_dtps, 0),
    num_na: rows.reduce((sum, row) => sum + row.num_na, 0),
    num_total: rows.reduce((sum, row) => sum + row.num_total, 0),
    counts,
  };
}

/** Exaflow `describe`: one row per variable and dataset, then one `all datasets` row per variable. */
function describePayload(body: { analysisRequest?: { algorithm?: { y?: string[] }; inputdata?: { variables?: string[]; datasets?: string[] } } }) {
  const codes = (body?.analysisRequest?.algorithm?.y?.length
    ? body.analysisRequest.algorithm.y
    : body?.analysisRequest?.inputdata?.variables ?? []
  ).filter((code) => code && code !== 'dataset');
  const datasets = body?.analysisRequest?.inputdata?.datasets?.length ? body.analysisRequest.inputdata.datasets : ['1', '2'];

  const perDataset: { variable: string; dataset: string; data: object | null }[] = [];
  const global: typeof perDataset = [];
  for (const code of codes) {
    const nominal = NOMINAL_COUNTS[code];
    if (nominal) {
      const rows = datasets.flatMap((dataset) => {
        const counts = nominal[dataset];
        if (!counts) return [];
        const num_dtps = Object.values(counts).reduce((sum, count) => sum + count, 0);
        return [{ dataset, data: { num_dtps, num_na: 0, num_total: num_dtps, counts } }];
      });
      rows.forEach((row) => perDataset.push({ variable: code, ...row }));
      global.push({ variable: code, dataset: 'all datasets', data: rows.length ? nominalTotals(rows.map((row) => row.data)) : null });
    } else {
      const table = NUMERICAL_STATS[code] ?? NUMERICAL_STATS['age'];
      const rows = datasets.flatMap((dataset) => (table[dataset] ? [{ dataset, data: table[dataset] }] : []));
      rows.forEach((row) => perDataset.push({ variable: code, ...row }));
      global.push({ variable: code, dataset: 'all datasets', data: rows.length ? globalStats(rows.map((row) => row.data)) : null });
    }
  }
  return { featurewise: [...perDataset, ...global] };
}

/**
 * Exaflow `histogram` (exaflow tests/prod_env_tests/expected/histogram_expected.json):
 * bin edges for numerical variables, levels for nominal ones, and `null` where a count
 * is too small to share.
 */
const HISTOGRAMS: Record<string, { bins: (number | string)[]; counts: (number | null)[] }> = {
  age: { bins: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95], counts: [null, 11, 14, 18, 20, 14, 10, null, null] },
  sex: { bins: ['0', '1'], counts: [46, 54] },
};

function histogramPayload(body: { analysisRequest?: { algorithm?: { y?: string[] } } }) {
  const code = body?.analysisRequest?.algorithm?.y?.[0] ?? 'age';
  const histogram = HISTOGRAMS[code] ?? HISTOGRAMS['age'];
  return { histogram: [{ var: code, grouping_var: null, grouping_enum: null, ...histogram }] };
}

/**
 * Age ~ sex, in the shape Exaflow returns for linear_regression
 * (exaflow tests/prod_env_tests/expected/linear_regression_expected.json).
 */
export const LINEAR_REGRESSION_RESULT = {
  dependent_var: 'age',
  n_obs: 100,
  df_resid: 98.0,
  df_model: 1.0,
  rse: 7.912,
  r_squared: 0.0421,
  r_squared_adjusted: 0.0323,
  f_stat: 4.3082,
  f_pvalue: 0.04055,
  indep_vars: ['Intercept', 'sex[M]'],
  coefficients: [71.2041, 2.0512],
  std_err: [1.0213, 0.9882],
  t_stats: [69.7191, 2.0757],
  pvalues: [1.2e-80, 0.04055],
  lower_ci: [69.1773, 0.0901],
  upper_ci: [73.2309, 4.0123],
};

/**
 * PCA result shaped like Exaflow after PR #623 (changes.md §1): additive
 * `variables`, `components`, and `reusable_preprocessing` for `pca_column_creator`.
 * Numbers are illustrative; variable codes match the dementia mock model.
 */
function pcaResult() {
  return {
    title: 'Eigenvalues and Eigenvectors',
    n_obs: 95,
    eigenvalues: [1.71, 0.29],
    eigenvectors: [
      [0.707, 0.707],
      [-0.707, 0.707],
    ],
    variables: ['age', 'mmse'],
    components: [
      {
        component_id: 'PC1',
        explained_variance: 1.71,
        explained_variance_ratio: 0.855,
        cumulative_explained_variance: 0.855,
        loadings: { age: 0.707, mmse: 0.707 },
      },
      {
        component_id: 'PC2',
        explained_variance: 0.29,
        explained_variance_ratio: 0.145,
        cumulative_explained_variance: 1.0,
        loadings: { age: -0.707, mmse: 0.707 },
      },
    ],
    reusable_preprocessing: {
      schema_version: '1',
      preprocessing_name: 'pca_column_creator',
      base_parameters: {
        variables: ['age', 'mmse'],
        pca_variant: 'pca',
      },
      component_choices: [
        { component_id: 'PC1', explained_variance_ratio: 0.855 },
        { component_id: 'PC2', explained_variance_ratio: 0.145 },
      ],
    },
  };
}

function resultFor(name: string) {
  if (name === 'linear_regression') return LINEAR_REGRESSION_RESULT;
  if (name === 'pca') return pcaResult();
  return { title: `Result ${name}`, n_obs: 100 };
}

/** A saved run the dashboard can open straight into the studio. */
export function seedLinearAnalysis(overrides: Partial<StoredAnalysis> = {}): StoredAnalysis {
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
    analysisRequest: {
      inputdata: {
        data_model: 'dementia:1',
        datasets: ['1', '2'],
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

export interface RecordedRequest {
  method: string;
  path: string;
  body: Record<string, any>;
}

export interface StudioApi {
  /** The stored analyses. Push seeds here before the page loads them. */
  analyses: StoredAnalysis[];
  /** Every `/services` call, in order, with its parsed JSON body. */
  requests: RecordedRequest[];
  /** Calls no branch below answers. The fixture fails the test when this is not empty. */
  unhandled: string[];
}

/**
 * Intercept every `/services/*` call the app makes.
 * One in-memory list stands in for PostgreSQL so save and re-open share a store.
 * Tests override single endpoints with their own `page.route`, which runs first.
 */
export async function installAnalysisStudioApi(page: Page): Promise<StudioApi> {
  const analyses: StoredAnalysis[] = [];
  const requests: RecordedRequest[] = [];
  const unhandled: string[] = [];
  let sequence = 0;
  const runs = new Map<string, { analysisRequest: StoredAnalysis['analysisRequest']; result: StoredAnalysis['result'] }>();
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

    requests.push({ method, path, body: readBody() });

    if (path === '/services/activeUser' && method === 'GET') {
      return json(route, STUDIO_USER);
    }

    if (path === '/services/activeUser/agreeNDA' && method === 'POST') {
      return json(route, { ...STUDIO_USER, agreeNDA: true });
    }

    if (path === '/services/studies' && method === 'GET') {
      return json(route, { studies: [] });
    }

    if (path === '/services/data-models' && method === 'GET') {
      return json(route, [dataModel(), strokeModel()]);
    }

    if (path === '/services/specifications/inputdata' && method === 'GET') {
      return json(route, {
        data_model: inputField(['text'], { required: true }),
        datasets: inputField(['text'], { required: true }),
        filters: inputField(['jsonObject']),
        variables: inputField(['real', 'int', 'text'], { required: true, min_count: 1 }),
      });
    }

    if (path === '/services/specifications/preprocessing' && method === 'GET') {
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
        {
          name: 'pca_column_creator',
          label: 'PCA column creator',
          desc: 'Create principal component columns.',
          order: 3,
          parameters: {},
          outputs: {
            new_column_names_param: 'new_column_names',
            columns: [
              {
                type: 'real',
                stattype: 'numerical',
                column_count_param: 'n_components',
                enumerations: null,
              },
            ],
          },
        },
        {
          name: 'categorical_column_creator',
          label: 'Categorical column creator',
          desc: 'Create categorical columns from rules.',
          order: 4,
          parameters: {},
          outputs: {
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
          },
        },
        {
          name: 'kmeans_cluster_creator',
          label: 'K-means cluster creator',
          desc: 'Create cluster columns.',
          order: 5,
          parameters: {},
          outputs: {
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
          },
        },
      ]);
    }

    if (path === '/services/specifications/algorithms' && method === 'GET') {
      return json(route, algorithmSpecs());
    }

    if (path === '/services/analyses/preview' && method === 'POST') {
      const body = readBody();
      const name = body?.analysisRequest?.algorithm?.name;
      if (name === 'histogram') {
        return json(route, histogramPayload(body));
      }
      // Describe and outlier previews need featurewise rows. A real run needs status plus result.
      if (!name || name === 'describe' || name === 'outlier_report') {
        return json(route, describePayload(body));
      }
      if (name === 'kmeans') {
        const variables = body?.analysisRequest?.algorithm?.y;
        return json(route, kmeansReport(Array.isArray(variables) ? variables : []));
      }
      return json(route, { status: 'success', result: resultFor(name) });
    }

    // Studio Run: like the backend, keep the successful result so Save can persist it as is.
    if (path === '/services/analyses/runs' && method === 'POST') {
      const body = readBody();
      const name = String(body?.analysisRequest?.algorithm?.name ?? 'unknown');
      sequence += 1;
      const uuid = `run-${sequence}`;
      const result = name === 'describe' || name === 'outlier_report' ? describePayload(body) : resultFor(name);
      runs.set(uuid, { analysisRequest: body?.analysisRequest ?? {}, result });
      return json(route, { uuid, status: 'success', result });
    }

    if (path === '/services/analyses' && method === 'GET') {
      return json(route, {
        analyses: analyses,
        totalAnalyses: analyses.length,
        totalPages: analyses.length ? 1 : 0,
        currentPage: 0,
      });
    }

    // Save: persist a kept run by id. Like the backend, nothing runs again and the
    // response carries no result.
    if (path === '/services/analyses' && method === 'POST') {
      const body = readBody();
      if (!body?.runId || !String(body?.name ?? '').trim()) {
        return json(route, { message: 'runId and name are required.' }, 400);
      }
      const run = runs.get(String(body.runId));
      if (!run) return json(route, { message: 'This run is no longer available to save.' }, 404);
      sequence += 1;
      const stored: StoredAnalysis = {
        uuid: `exp-created-${sequence}`,
        name: String(body.name),
        created: new Date().toISOString(),
        finished: new Date().toISOString(),
        shared: false,
        viewed: false,
        status: 'success',
        analysisRequest: run.analysisRequest,
        result: run.result,
        createdBy: STUDIO_USER,
      };
      analyses.unshift(stored);
      return json(route, { ...stored, result: null }, 201);
    }

    const analysisMatch = path.match(/^\/services\/analyses\/([^/]+)$/);
    if (analysisMatch && method === 'GET') {
      const found = analyses.find((analysis) => analysis.uuid === analysisMatch[1]);
      if (!found) return json(route, { message: 'not found' }, 404);
      return json(route, found);
    }

    if (analysisMatch && method === 'DELETE') {
      const index = analyses.findIndex((analysis) => analysis.uuid === analysisMatch[1]);
      if (index < 0) return json(route, { message: 'not found' }, 404);
      analyses.splice(index, 1);
      return route.fulfill({ status: 204 });
    }

    if (analysisMatch && method === 'PATCH') {
      const found = analyses.find((analysis) => analysis.uuid === analysisMatch[1]);
      if (!found) return json(route, { message: 'not found' }, 404);
      const body = readBody();
      if (typeof body.name === 'string') found.name = body.name;
      if (typeof body.shared === 'boolean') found.shared = body.shared;
      return json(route, found);
    }

    // The app called an endpoint this mock does not know. Answer with an error, not an empty success.
    unhandled.push(`${method} ${path}`);
    return json(route, { message: `No mock for ${method} ${path}` }, 501);
  });

  return { analyses, requests, unhandled };
}
