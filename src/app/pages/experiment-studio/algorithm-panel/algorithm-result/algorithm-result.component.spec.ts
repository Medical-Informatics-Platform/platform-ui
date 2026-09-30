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

  it('renders key figures, the coefficient forest and sorted coefficients for linear regression', () => {
    const html = render(linearResult);

    expect(html.querySelector('.lr-result')).toBeTruthy();
    expect(html.querySelectorAll('.key-figure').length).toBe(5);
    expect(html.querySelector('.coefficients-title')?.textContent?.trim()).toBe('Coefficients');
    // The forest plot draws every interval on one scale, so the table no longer repeats them.
    expect(html.querySelector('.chart-title')?.textContent).toBe('Coefficient forest plot');
    expect(html.querySelector('.coef-row--head')?.textContent).not.toContain('Interval vs 0');
    expect(html.querySelectorAll('.coef-row').length).toBe(4); // header + 3 rows

    const variables = Array.from(html.querySelectorAll('.coef-row:not(.coef-row--head) .coef-variable'))
      .map((el) => el.textContent?.trim());
    expect(variables).toEqual(['Left hippocampus', 'Age', 'Intercept']);
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

  it('keeps the generic renderer for non-linear-regression algorithms', () => {
    const html = render({ title: 'Some other result' }, 'kmeans');

    expect(html.querySelector('.lr-result')).toBeFalsy();
    expect(html.querySelector('app-auto-renderer')).toBeTruthy();
  });

  it('bolds p-values against the chosen significance level', () => {
    const html = render(linearResult);
    const pBold = () => html.querySelectorAll('.coef-row:not(.coef-row--head):not(.is-intercept) .coef-p.is-significant').length;
    expect(pBold()).toBe(2);

    const strict = Array.from(html.querySelectorAll<HTMLButtonElement>('.alpha-control button'))
      .find((button) => button.textContent?.trim() === '0.01')!;
    strict.click();
    fixture.detectChanges();

    expect(pBold()).toBe(1); // Age, p = 0.0403, is no longer below α
    expect(html.querySelector('.coef-note')?.textContent).toContain('below 0.01');
    fixture.componentInstance.alpha.set(0.05);
  });
});

