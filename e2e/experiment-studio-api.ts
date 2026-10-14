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
    chuv: { num_dtps: 48, num_na: 2, num_total: 50, mean: 71.6, std: 7.9, min: 52, q1: 66, q2: 72, q3: 77, max: 91 },
    adni: { num_dtps: 47, num_na: 3, num_total: 50, mean: 73.1, std: 8.4, min: 55, q1: 67, q2: 73, q3: 79, max: 94 },
  },
  mmse: {
    chuv: { num_dtps: 45, num_na: 5, num_total: 50, mean: 24.6, std: 3.9, min: 13, q1: 22, q2: 25, q3: 28, max: 30 },
    adni: { num_dtps: 49, num_na: 1, num_total: 50, mean: 25.3, std: 3.4, min: 15, q1: 23, q2: 26, q3: 28, max: 30 },
  },
};

/** Category counts per dataset, for nominal variables and the columns the studio derives. */
const NOMINAL_COUNTS: Record<string, Record<string, Record<string, number>>> = {
  sex: { chuv: { M: 22, F: 28 }, adni: { M: 24, F: 26 } },
  apoe: { chuv: { e3: 36, e4: 14 }, adni: { e3: 33, e4: 17 } },
  sex_group: { chuv: { female: 28, other: 22 }, adni: { female: 26, other: 24 } },
  kmeans_cluster: { chuv: { '0': 23, '1': 25 }, adni: { '0': 22, '1': 25 } },
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
function describePayload(body: { analysis?: { algorithm?: { y?: string[] }; inputdata?: { variables?: string[]; datasets?: string[] } } }) {
  const codes = (body?.analysis?.algorithm?.y?.length
    ? body.analysis.algorithm.y
    : body?.analysis?.inputdata?.variables ?? []
  ).filter((code) => code && code !== 'dataset');
  const datasets = body?.analysis?.inputdata?.datasets?.length ? body.analysis.inputdata.datasets : ['chuv', 'adni'];

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
  sex: { bins: ['M', 'F'], counts: [46, 54] },
};

function histogramPayload(body: { analysis?: { algorithm?: { y?: string[] } } }) {
  const code = body?.analysis?.algorithm?.y?.[0] ?? 'age';
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

function resultFor(name: string) {
  if (name === 'linear_regression') return LINEAR_REGRESSION_RESULT;
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

export interface RecordedRequest {
  method: string;
  path: string;
  body: Record<string, any>;
}

export interface StudioApi {
  /** The stored experiments. Push seeds here before the page loads them. */
  experiments: StoredExperiment[];
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
export async function installExperimentStudioApi(page: Page): Promise<StudioApi> {
  const experiments: StoredExperiment[] = [];
  const requests: RecordedRequest[] = [];
  const unhandled: string[] = [];
  let sequence = 0;
  const runs = new Map<string, { analysis: StoredExperiment['analysis']; result: StoredExperiment['result'] }>();
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

    if (path === '/services/experiment-folders' && method === 'GET') {
      return json(route, { folders: [] });
    }

    if (path === '/services/data-models' && method === 'GET') {
      return json(route, [dataModel(), strokeModel()]);
    }

    if (path === '/services/specifications/inputdata' && method === 'GET') {
      return json(route, {
        data_model: inputField(['text'], { required: true }),
        datasets: inputField(['text'], { required: true }),
        filters: inputField(['jsonObject']),
        variables: inputField(['real', 'int', 'text', 'nominal'], { required: true, min_count: 1 }),
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
      ]);
    }

    if (path === '/services/specifications/algorithms' && method === 'GET') {
      return json(route, algorithmSpecs());
    }

    if (path === '/services/experiments/transient' && method === 'POST') {
      const body = readBody();
      const name = body?.analysis?.algorithm?.name;
      if (name === 'histogram') {
        return json(route, histogramPayload(body));
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

    // Studio Run: like the backend, keep the successful result so Save can persist it as is.
    if (path === '/services/experiments/runs' && method === 'POST') {
      const body = readBody();
      const name = String(body?.analysis?.algorithm?.name ?? 'unknown');
      sequence += 1;
      const uuid = `run-${sequence}`;
      const result = name === 'describe' || name === 'outlier_report' ? describePayload(body) : resultFor(name);
      runs.set(uuid, { analysis: body?.analysis ?? {}, result });
      return json(route, { uuid, status: 'success', result });
    }

    const saveRunMatch = path.match(/^\/services\/experiments\/runs\/([^/]+)\/save$/);
    if (saveRunMatch && method === 'POST') {
      const run = runs.get(saveRunMatch[1]);
      if (!run) return json(route, { message: 'This run is no longer available to save.' }, 404);
      sequence += 1;
      const stored: StoredExperiment = {
        uuid: `exp-created-${sequence}`,
        name: String(readBody()?.name),
        created: new Date().toISOString(),
        finished: new Date().toISOString(),
        shared: false,
        viewed: false,
        status: 'success',
        analysis: run.analysis,
        result: run.result,
        createdBy: STUDIO_USER,
      };
      experiments.unshift(stored);
      return json(route, stored, 201);
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
      const found = experiments.find((experiment) => experiment.uuid === experimentMatch[1]);
      if (!found) return json(route, { message: 'not found' }, 404);
      return json(route, found);
    }

    if (experimentMatch && method === 'DELETE') {
      const index = experiments.findIndex((experiment) => experiment.uuid === experimentMatch[1]);
      if (index < 0) return json(route, { message: 'not found' }, 404);
      experiments.splice(index, 1);
      return route.fulfill({ status: 204 });
    }

    if (experimentMatch && method === 'PATCH') {
      const found = experiments.find((experiment) => experiment.uuid === experimentMatch[1]);
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

  return { experiments, requests, unhandled };
}
