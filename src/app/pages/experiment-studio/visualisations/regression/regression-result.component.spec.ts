import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CsvExportService } from '../../../../services/csv-export.service';
import { RegressionResultComponent } from './regression-result.component';
import { buildRegressionView } from './regression-view';

describe('RegressionResultComponent', () => {
  const logistic = {
    dependent_var: '3m mRS good outcome',
    indep_vars: ['Intercept', 'IVT[yes]', 'Age'],
    summary: {
      n_obs: 27308,
      coefficients: [7.0586, 0.4794, -0.063],
      stderr: [0.1287, 0.0405, 0.0016],
      lower_ci: [6.8063, 0.4, -0.0662],
      upper_ci: [7.311, 0.5587, -0.0599],
      z_scores: [54.82, 11.84, -39.52],
      pvalues: [0, 2.3e-32, 0],
      df_model: 2,
      df_resid: 27305,
      ll0: -16452.2,
      ll: -10977.8,
    },
  };

  it('exports the odds ratio and its CI in the coefficients CSV while the table shows only the key columns', () => {
    TestBed.configureTestingModule({ imports: [RegressionResultComponent], providers: [provideZonelessChangeDetection()] });
    const exportToCsv = vi.spyOn(TestBed.inject(CsvExportService), 'exportToCsv').mockImplementation(() => {});
    const view = buildRegressionView('logistic_regression', logistic, null)!;
    const fixture = TestBed.createComponent(RegressionResultComponent);
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();

    expect(fixture.componentInstance.coefficientColumns()).toBe('key');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.csv-link')!.click();

    const [rows, headers, filename] = exportToCsv.mock.calls[0];
    expect(headers).toEqual(['Variable', 'Estimate', 'Std. error', view.statLabel, 'Odds ratio', 'CI 95% lower', 'CI 95% upper', 'p-value']);
    expect(filename).toBe('3m_mrs_good_outcome_coefficients.csv');
    const ivt = rows.find((row) => row['Variable'] === 'IVT[yes]')!;
    expect(ivt['Estimate']).toBe('0.4794');
    expect(ivt['Odds ratio']).toBe(String(Math.exp(0.4794)));
    expect(ivt['CI 95% lower']).toBe(String(view.rows[0].lower));
    expect(ivt['CI 95% upper']).toBe(String(view.rows[0].upper));
    expect(ivt['p-value']).toBe('2.3e-32');
  });
});
