import { AutoRendererComponent } from './auto-renderer.component';
import { AlgorithmTableRegistry } from './algorithm-table-registry';

describe('AutoRendererComponent', () => {
  it('renders tables for known algorithms', () => {
    const cmp = new AutoRendererComponent();
    cmp.algorithm = 'kmeans';
    cmp.value = { centers: [[1, 2], [3, 4]] };

    cmp.ngOnChanges({});

    const tables = cmp.tableSpec();
    expect(tables).toBeTruthy();
    expect(tables?.[0].columns.length).toBe(2);
  });

  it('sets error when builder is missing', () => {
    const cmp = new AutoRendererComponent();
    cmp.algorithm = 'does-not-exist';
    cmp.value = {};

    cmp.ngOnChanges({});

    expect(cmp.tableSpec()).toBeNull();
    expect(cmp.error()).toContain('No renderer');
  });

  it('caches identical inputs to avoid redundant work', () => {
    const cmp = new AutoRendererComponent();
    cmp.algorithm = 'kmeans';
    cmp.value = { centers: [[1, 2]] };

    const spy = spyOn(AlgorithmTableRegistry, 'kmeans').and.callThrough();

    cmp.ngOnChanges({});
    cmp.ngOnChanges({});

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('recomputes when mapping inputs change even if value is unchanged', () => {
    const cmp = new AutoRendererComponent();
    cmp.algorithm = 'kmeans';
    cmp.value = { centers: [[1, 2]] };

    const spy = spyOn(AlgorithmTableRegistry, 'kmeans').and.callThrough();

    cmp.ngOnChanges({});
    cmp.labelMap = { x1: 'X 1' };
    cmp.ngOnChanges({});

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('uses result title for single-table algorithms', () => {
    const cmp = new AutoRendererComponent();
    cmp.algorithm = 'kmeans';
    cmp.value = { title: 'Custom K-Means Title', centers: [[1, 2], [3, 4]] };

    cmp.ngOnChanges({});

    const tables = cmp.tableSpec();
    expect(tables?.length).toBe(1);
    expect(tables?.[0].title).toBe('Custom K-Means Title');
  });

  it('prefixes first table title for multi-table algorithms when result title exists', () => {
    const cmp = new AutoRendererComponent();
    cmp.algorithm = 'linear_regression_cv';
    cmp.value = {
      title: 'Linear Regression CV Report',
      n_obs: [100, 101],
      mean_sq_error: { mean: 1.1, std: 0.1 },
      r_squared: { mean: 0.9, std: 0.02 },
    };

    cmp.ngOnChanges({});

    const tables = cmp.tableSpec();
    expect(tables?.length).toBe(2);
    expect(tables?.[0].title).toBe('Linear Regression CV Report - Training set sample sizes');
    expect(tables?.[1].title).toBe('Error metrics');
  });

  it('uses fallback title when result title is missing', () => {
    const cmp = new AutoRendererComponent();
    cmp.algorithm = 'kmeans';
    cmp.fallbackTitle = 'Result K-Means';
    cmp.value = { centers: [[1, 2], [3, 4]] };

    cmp.ngOnChanges({});

    const tables = cmp.tableSpec();
    expect(tables?.length).toBe(1);
    expect(tables?.[0].title).toBe('K-Means Centers');
  });

  it('has renderers for new Exaflow algorithms', () => {
    const payloads: Record<string, any> = {
      lmm: {
        indep_vars: ['Intercept'],
        coefficients: [1],
        std_err: [0.1],
        t_stats: [10],
        pvalues: [0.01],
        lower_ci: [0.8],
        upper_ci: [1.2],
      },
      glmm_binary: {
        indep_vars: ['Intercept'],
        coefficients: [0.5],
      },
      glmm_ordinal: {
        indep_vars: ['Intercept'],
        coefficients: [0.5],
        category_order: ['Low', 'High'],
        cutpoints: [0.1],
      },
      chi_squared: {
        chi2: 1.2,
        p_value: 0.2,
        dof: 1,
        expected: [[1, 2]],
        x_labels: ['A'],
        y_labels: ['B', 'C'],
      },
      fisher_exact: {
        odds_ratio: 1.1,
        p_value: 0.4,
        x_labels: ['A', 'B'],
        y_labels: ['C', 'D'],
      },
    };

    Object.entries(payloads).forEach(([algorithm, value]) => {
      const cmp = new AutoRendererComponent();
      cmp.algorithm = algorithm;
      cmp.value = value;

      cmp.ngOnChanges({});

      expect(cmp.error()).toBeNull();
      expect(cmp.tableSpec()?.length).toBeGreaterThan(0);
    });
  });
});
