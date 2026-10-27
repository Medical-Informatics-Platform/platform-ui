import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideEchartsCore } from 'ngx-echarts';
import { AlgorithmResultComponent } from './algorithm-result.component';

describe('AlgorithmResultComponent linear-regression review layout', () => {
  let fixture: ComponentFixture<AlgorithmResultComponent>;

  const linearResult = {
    dependent_var: 'MMSE',
    n_obs: 1284,
    df_model: 2,
    df_resid: 1281,
    rse: 3.94,
    r_squared: 0.412,
    r_squared_adjusted: 0.4111,
    f_stat: 448.72,
    f_pvalue: 0.00001,
    ll: -3581.2,
    aic: 7168.4,
    bic: 7183.9,
    indep_vars: ['Intercept', 'Age', 'Left hippocampus'],
    coefficients: [14.212, -0.031, 4.318],
    std_err: [1.8041, 0.0151, 0.291],
    t_stats: [7.8776, -2.053, 14.8385],
    pvalues: [0.00001, 0.0403, 0.00001],
    lower_ci: [10.6726, -0.0606, 3.7471],
    upper_ci: [17.7514, -0.0014, 4.8889],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlgorithmResultComponent],
      providers: [provideZonelessChangeDetection(), provideEchartsCore({ echarts: () => import('echarts') })],
    }).compileComponents();

    fixture = TestBed.createComponent(AlgorithmResultComponent);
  });

  function render(result: Record<string, unknown>, algorithm = 'linear_regression'): HTMLElement {
    fixture.componentRef.setInput('result', result);
    fixture.componentRef.setInput('algorithm', algorithm);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders key figures, sorted coefficients and interval plots for linear regression', () => {
    const html = render(linearResult);

    expect(html.querySelector('.lr-result')).toBeTruthy();
    expect(html.querySelectorAll('.key-figure').length).toBe(5);
    expect(html.querySelector('.coefficients-title')?.textContent?.trim()).toBe('Coefficients');
    expect(html.querySelector('.coef-row--head')?.textContent).toContain('Interval vs 0');
    expect(html.querySelectorAll('.coef-row').length).toBe(4); // header + 3 rows

    const variables = Array.from(html.querySelectorAll('.coef-row:not(.coef-row--head) .coef-variable'))
      .map((el) => el.textContent?.trim());
    expect(variables).toEqual(['Left hippocampus', 'Age', 'Intercept']);
    // Only the two non-intercept rows draw the interval-vs-zero plot.
    expect(html.querySelectorAll('.coef-plot').length).toBe(2);
    expect(html.querySelector('.coef-row.is-intercept')?.textContent).toContain('Intercept');
  });

  it('expands to all coefficient columns and model-fit details on demand', () => {
    const html = render(linearResult);

    const allColumns = Array.from(html.querySelectorAll<HTMLButtonElement>('.coef-columns button'))
      .find((button) => button.textContent?.includes('All columns'))!;
    allColumns.click();
    fixture.detectChanges();
    expect(html.querySelector('.coef-row--head')?.textContent).toContain('Std. error');
    expect(html.querySelector('.coef-row--head')?.textContent).toContain('t');

    const fitToggle = html.querySelector<HTMLButtonElement>('.model-fit-summary')!;
    expect(fitToggle.textContent).toContain('AIC');
    expect(html.querySelector('.model-fit-grid')).toBeFalsy();
    fitToggle.click();
    fixture.detectChanges();
    expect(html.querySelector('.model-fit-grid')?.textContent).toContain('Log-likelihood');
  });

  it('shows the logistic log-odds estimate, SE, z and p as key columns and the odds ratio with all columns', () => {
    const html = render({
      dependent_var: 'Good outcome',
      indep_vars: ['Intercept', 'Age'],
      summary: {
        coefficients: [7.06, -0.063], stderr: [0.13, 0.0016], z_scores: [54.8, -39.5], pvalues: [0, 0],
        lower_ci: [6.81, -0.066], upper_ci: [7.31, -0.06], n_obs: 27308,
      },
    }, 'logistic_regression');
    const headers = () => Array.from(html.querySelectorAll('.coef-row--head [role="columnheader"]')).map((el) => el.textContent?.trim());

    expect(headers()).toEqual(['Variable', 'Estimate', 'Std. error', 'z', 'p-value']);
    expect(html.querySelector('.coef-row:not(.coef-row--head) .coef-estimate')?.textContent).toBe('−0.063');

    Array.from(html.querySelectorAll<HTMLButtonElement>('.coef-columns button')).find((b) => b.textContent?.includes('All columns'))!.click();
    fixture.detectChanges();
    expect(headers()).toEqual(['Variable', 'Estimate', 'Std. error', 'z', 'Odds ratio', '95% CI', 'Interval vs 1', 'p-value']);
  });

  it('explains the figures and charts that need it under them', () => {
    const cv = render({ dependent_var: 'MMSE', root_mean_sq_error: [3.1, 0.2], mean_abs_error: [2.4, 0.1], n_obs: [100, 101] }, 'linear_regression_cv');
    expect(cv.querySelector('.results-note')?.textContent).toContain('RMSE (root mean squared error)');

    const nb = render({
      classes: ['no', 'yes'], feature_names: ['Age'], theta: [[78], [69]], var: [[131], [186]], class_count: [37366, 102452],
    }, 'naive_bayes_gaussian');
    expect(nb.querySelector('.gen-charts .results-note')?.textContent).toContain('standard deviations');
  });

  it('keeps the generic renderer for non-linear-regression algorithms', () => {
    const html = render({ title: 'Some other result' }, 'kmeans');

    expect(html.querySelector('.lr-result')).toBeFalsy();
    expect(html.querySelector('app-auto-renderer')).toBeTruthy();
  });

  it('does not repeat a table whose values the key figures already show', () => {
    const html = render({ t_stat: -3.9, df: 120, p: 0.0001, mean_diff: -1.2, se_diff: 0.3, ci_lower: -1.8, ci_upper: -0.6, cohens_d: -0.7 }, 'ttest_independent');

    expect(html.querySelector('app-key-figures')).toBeTruthy();
    expect(html.querySelector('.gen-charts .results-section-heading')?.textContent).toBe('Mean difference');
    expect(html.querySelectorAll('.ar-card').length).toBe(0);
    expect(html.querySelector('.ar-heading')).toBeFalsy();
  });

  it('brings the covered tables back on request', () => {
    const html = render({ t_stat: -3.9, df: 120, p: 0.0001, mean_diff: -1.2, se_diff: 0.3, ci_lower: -1.8, ci_upper: -0.6, cohens_d: -0.7 }, 'ttest_independent');
    const toggle = html.querySelector<HTMLButtonElement>('.tables-toggle')!;

    expect(toggle.textContent?.trim()).toBe('Show all values as tables');
    // The label says what the button does next; a pressed state on top would contradict it.
    expect(toggle.hasAttribute('aria-pressed')).toBe(false);
    toggle.click();
    fixture.detectChanges();
    expect(html.querySelectorAll('.ar-card').length).toBe(1);
    expect(toggle.textContent?.trim()).toBe('Hide tables repeated above');
  });

  const cardTitles = (html: HTMLElement) => Array.from(html.querySelectorAll('.ar-card .ar-title')).map((el) => el.textContent?.trim());
  const rowLabels = (html: HTMLElement, title: string) => {
    const card = Array.from(html.querySelectorAll('.ar-card')).find((el) => el.querySelector('.ar-title')?.textContent?.trim() === title);
    return Array.from(card?.querySelectorAll('tbody tr') ?? []).map((row) => row.querySelector('td')?.textContent?.trim());
  };

  it('summarises a one-sided paired t-test with its bound, level and measurement order from the run', () => {
    fixture.componentRef.setInput('parameters', { alt_hypothesis: 'greater', alpha: 0.1 });
    fixture.componentRef.setInput('xVar', 'rightorifg');
    fixture.componentRef.setInput('yVar', 'rightppplanumpolare');
    fixture.componentRef.setInput('labelMap', { rightorifg: 'Right orbital IFG', rightppplanumpolare: 'Right planum polare' });
    const html = render({ t_stat: -39.8, df: 216, p: 1, mean_diff: -0.502, se_diff: 0.0126, ci_lower: -0.5184, ci_upper: 'Infinity', cohens_d: -2.7 }, 'ttest_paired');

    const notes = Array.from(html.querySelectorAll('.key-figure-note')).map((el) => el.textContent?.trim());
    expect(notes).toContain('Right orbital IFG − Right planum polare · 90% one-sided CI ≥ −0.518 · SE 0.013');
  });

  it('keeps the t-test rows the key figures do not print', () => {
    const html = render({ t_stat: -3.9, df: 120, p: 0.0001, mean_diff: -1.2, ci_lower: -1.8, cohens_d: -0.7, mean_x: 4.2 }, 'ttest_independent');

    // One CI bound alone is not in the mean-difference figure, and mean_x has no figure.
    expect(rowLabels(html, 'Independent T-Test')).toEqual(['95% CI Lower', 'Mean X']);
  });

  it('keeps the F diagnostic and undefined metrics under the linear regression CV figures', () => {
    const html = render({
      dependent_var: 'y',
      n_obs: [100, 101],
      root_mean_sq_error: [1.2, 0.1],
      r_squared: [null, null],
      mean_abs_error: [0.7, 0.05],
      f_stat: [12.3, 1.1],
    }, 'linear_regression_cv');

    expect(html.querySelectorAll('.key-figure').length).toBeGreaterThan(0);
    expect(rowLabels(html, 'Error metrics')).toEqual(['R-squared', 'F diagnostic']);
  });

  describe('tables a chart replaces', () => {
    const cluster = (id: string, center: Record<string, number>) => ({
      cluster_id: id, label: `Cluster ${id}`, size_interval: '10-20', center, profile: [], quality: { compactness: null },
    });

    it('hides the k-means centres table under the heatmap, which prints every centre', () => {
      const html = render({
        variables: ['a', 'b', 'c'],
        clusters: [cluster('0', { a: 1, b: 2, c: 3 }), cluster('1', { a: 3, b: 4, c: 5 })],
      }, 'kmeans');

      expect(html.querySelector('.gen-charts')).toBeTruthy();
      expect(cardTitles(html)).not.toContain('Cluster Centers');
    });

    it('keeps the k-means centres table under the two-variable bubble chart, which only places them', () => {
      const html = render({
        variables: ['a', 'b'],
        clusters: [cluster('0', { a: 1, b: 2 }), cluster('1', { a: 3, b: 4 })],
      }, 'kmeans');

      expect(html.querySelector('.gen-charts')).toBeTruthy();
      expect(cardTitles(html)).toContain('Cluster Centers');
    });

    it('keeps the naive Bayes class summary when only the profile chart rendered', () => {
      const html = render({
        classes: ['A', 'B'],
        class_count: [40, 60],
        feature_names: ['x'],
        theta: [[1], [2]],
        var: [[1], [1]],
      }, 'naive_bayes_gaussian');

      expect(html.querySelector('.gen-charts')).toBeTruthy();
      expect(cardTitles(html)).toContain('Class Summary');
    });
  });
});
