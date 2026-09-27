import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { AutoRendererComponent } from './auto-renderer.component';
import { AlgorithmTableRegistry } from './algorithm-table-registry';

describe('AutoRendererComponent', () => {
  let fixture: ComponentFixture<AutoRendererComponent>;
  let cmp: AutoRendererComponent;

  const kmeansResult = {
    title: 'K-Means',
    variables: ['a', 'b'],
    k_selection: 'manual',
    selected_k: 2,
    initialization_method: 'k-means++',
    n_init: 10,
    n_obs_interval: '100-200',
    center_definition: 'c',
    intended_use: [],
    privacy_note: 'p',
    clusters: [
      {
        cluster_id: '0',
        label: 'Cluster 0',
        size_interval: '10-20',
        center: { a: 1, b: 2 },
        profile: ['p0'],
        interpretation: 'i0',
        quality: { compactness: null },
      },
      {
        cluster_id: '1',
        label: 'Cluster 1',
        size_interval: '20-30',
        center: { a: 3, b: 4 },
        profile: ['p1'],
        interpretation: 'i1',
        quality: { compactness: null },
      },
    ],
    elbow: null,
    converged: true,
    n_iter: 5,
    warnings: [],
    limitations: [],
  };

  const setInputs = (inputs: Record<string, unknown>): void => {
    Object.entries(inputs).forEach(([name, value]) => {
      fixture.componentRef.setInput(name, value);
    });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutoRendererComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AutoRendererComponent);
    cmp = fixture.componentInstance;
  });

  it('renders tables for known algorithms', () => {
    setInputs({ algorithm: 'kmeans', value: kmeansResult });

    const tables = cmp.tableSpec();
    expect(tables).toBeTruthy();
    expect(tables?.[1].columns).toEqual(['Cluster', 'Size', 'a', 'b']);
  });

  it('sets error when builder is missing', () => {
    setInputs({ algorithm: 'does-not-exist', value: {} });

    expect(cmp.tableSpec()).toBeNull();
    expect(cmp.error()).toContain('No renderer');
  });

  it('caches identical inputs to avoid redundant work', () => {
    const spy = spyOn(AlgorithmTableRegistry, 'kmeans').and.callThrough();

    setInputs({ algorithm: 'kmeans', value: kmeansResult });
    fixture.detectChanges();
    setInputs({ algorithm: 'kmeans', value: { ...kmeansResult } });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('recomputes when mapping inputs change even if value is unchanged', () => {
    const spy = spyOn(AlgorithmTableRegistry, 'kmeans').and.callThrough();

    setInputs({ algorithm: 'kmeans', value: kmeansResult });
    setInputs({ labelMap: { x1: 'X 1' } });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('uses result title for single-table algorithms', () => {
    setInputs({
      algorithm: 'binned_mann_whitney_u_test',
      value: { title: 'Custom Title', u_stat: 1, p_value: 0.5, z_score: 0.1, n1: 10, n2: 12 },
    });

    const tables = cmp.tableSpec();
    expect(tables?.length).toBe(1);
    expect(tables?.[0].title).toBe('Custom Title');
  });

  it('prefixes first table title for multi-table algorithms when result title exists', () => {
    setInputs({
      algorithm: 'linear_regression_cv',
      value: {
        title: 'Linear Regression CV Report',
        n_obs: [100, 101],
        mean_sq_error: { mean: 1.1, std: 0.1 },
        r_squared: { mean: 0.9, std: 0.02 },
      },
    });

    const tables = cmp.tableSpec();
    expect(tables?.length).toBe(2);
    expect(tables?.[0].title).toBe('Linear Regression CV Report - Training set sample sizes');
    expect(tables?.[1].title).toBe('Error metrics');
  });

  it('uses fallback title when result title is missing', () => {
    setInputs({
      algorithm: 'binned_mann_whitney_u_test',
      fallbackTitle: 'Result K-Means',
      value: { u_stat: 1, p_value: 0.5, z_score: 0.1, n1: 10, n2: 12 },
    });

    const tables = cmp.tableSpec();
    expect(tables?.length).toBe(1);
    expect(tables?.[0].title).toBe('Binned Mann-Whitney U Test');
  });

  it('uses full-width layout for tables with long row labels', () => {
    const table = {
      title: 'Fixed Effects',
      columns: ['Variable', 'Coefficient'],
      rows: [
        [
          'Vessel imaging findings[stenosis 50-99% in suspected ischemic territory]',
          '-1.171',
        ],
      ],
    };

    expect(cmp.isCompactTable(table)).toBeFalse();
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
      outlier_report: {
        featurewise: [
          {
            variable: 'age',
            dataset: 'ds1',
            data: {
              strategy: 'iqr',
              tail: 'both',
              fold: 1.5,
              lower_bound: null,
              upper_bound: 90,
              lower_outlier_count: 0,
              upper_outlier_count: 1,
              total_outlier_count: 1,
              total_outlier_percentage: 5,
            },
          },
        ],
      },
    };

    Object.entries(payloads).forEach(([algorithm, value]) => {
      setInputs({ algorithm, value });

      expect(cmp.error()).toBeNull();
      expect(cmp.tableSpec()?.length).toBeGreaterThan(0);
    });
  });
});
