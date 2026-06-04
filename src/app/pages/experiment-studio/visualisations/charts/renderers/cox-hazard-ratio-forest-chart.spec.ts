import {
  buildCoxHazardRatioForestChart,
  extractCoxForestRows,
  formatClinicianPValue,
  isCoxInterceptTerm,
  shortenCoxFactorLabel,
} from './cox-hazard-ratio-forest-chart';

describe('cox-hazard-ratio-forest-chart', () => {
  it('skips intercept and keeps clinician-oriented rows', () => {
    const rows = extractCoxForestRows({
      indep_vars: ['Intercept', 'Age'],
      summary: {
        hazard_ratios: [1.1, 0.74],
        hr_lower_ci: [1.0, 0.61],
        hr_upper_ci: [1.2, 0.9],
        pvalues: [0.5, 0.002],
      },
    });

    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe('Age');
    expect(isCoxInterceptTerm('Intercept')).toBeTrue();
  });

  it('shortens bracketed factor names for the y-axis', () => {
    const short = shortenCoxFactorLabel(
      'Dataset Registry origin[SSR Swiss Stroke Registry (even)]'
    );
    expect(short).toContain('·');
    expect(short).not.toContain('[SSR Swiss Stroke Registry (even)]');
  });

  it('formats small p-values for clinicians', () => {
    expect(formatClinicianPValue(0.0004)).toBe('<0.001');
    expect(formatClinicianPValue(0.04)).toBe('0.040');
  });

  it('builds a chart when at least one factor is present', () => {
    const charts = buildCoxHazardRatioForestChart({
      indep_vars: ['Sex[female]'],
      summary: {
        hazard_ratios: [0.96],
        hr_lower_ci: [0.27],
        hr_upper_ci: [3.41],
        pvalues: [0.95],
      },
    });

    expect(charts.length).toBe(1);
    expect(charts[0].title).toEqual(jasmine.objectContaining({ text: 'Hazard ratios (95% CI)' }));
  });
});
