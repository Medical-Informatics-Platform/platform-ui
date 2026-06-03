import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { AutoRendererComponent } from './auto-renderer.component';
import { AlgorithmTableRegistry } from './algorithm-table-registry';

describe('AutoRendererComponent', () => {
  let fixture: ComponentFixture<AutoRendererComponent>;
  let cmp: AutoRendererComponent;

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
    setInputs({ algorithm: 'kmeans', value: { centers: [[1, 2], [3, 4]] } });

    const tables = cmp.tableSpec();
    expect(tables).toBeTruthy();
    expect(tables?.[0].columns.length).toBe(2);
  });

  it('sets error when builder is missing', () => {
    setInputs({ algorithm: 'does-not-exist', value: {} });

    expect(cmp.tableSpec()).toBeNull();
    expect(cmp.error()).toContain('No renderer');
  });

  it('caches identical inputs to avoid redundant work', () => {
    const spy = spyOn(AlgorithmTableRegistry, 'kmeans').and.callThrough();

    setInputs({ algorithm: 'kmeans', value: { centers: [[1, 2]] } });
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('recomputes when mapping inputs change even if value is unchanged', () => {
    const spy = spyOn(AlgorithmTableRegistry, 'kmeans').and.callThrough();

    setInputs({ algorithm: 'kmeans', value: { centers: [[1, 2]] } });
    setInputs({ labelMap: { x1: 'X 1' } });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('uses result title for single-table algorithms', () => {
    setInputs({
      algorithm: 'kmeans',
      value: { title: 'Custom K-Means Title', centers: [[1, 2], [3, 4]] },
    });

    const tables = cmp.tableSpec();
    expect(tables?.length).toBe(1);
    expect(tables?.[0].title).toBe('Custom K-Means Title');
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
      algorithm: 'kmeans',
      fallbackTitle: 'Result K-Means',
      value: { centers: [[1, 2], [3, 4]] },
    });

    const tables = cmp.tableSpec();
    expect(tables?.length).toBe(1);
    expect(tables?.[0].title).toBe('K-Means Centers');
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
