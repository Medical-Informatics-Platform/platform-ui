import JSZip from 'jszip';
import { CsvExportService, toCsv } from './csv-export.service';

describe('CsvExportService', () => {
  it('quotes only the cells that need it', () => {
    expect(toCsv(['Variable', 'Value'], [['age, years', 'say "hi"'], ['sex', null]]))
      .toBe('Variable,Value\r\n"age, years","say ""hi"""\r\nsex,');
  });

  it('adds per-group and residual columns when the histogram is split', () => {
    const service = new CsvExportService();
    let saved: { content: string; name: string } | null = null;
    vi.spyOn(service, 'downloadCsv').mockImplementation((content, name) => {
      saved = { content, name };
    });

    service.exportHistogramCsv(
      {
        bins: ['0', '10'],
        counts: [10, 20],
        groups: [{ key: 'a', label: 'Dataset A', counts: [4, 8] }],
      },
      'Age'
    );

    expect(saved!.name).toBe('Age_distribution.csv');
    expect(saved!.content).toBe(
      'Category,Count,Dataset A,Not shown (missing or < privacy threshold)\r\n0,10,4,6\r\n10,20,8,12'
    );
  });

  it('zips one CSV per table, the raw result and a README describing the setup', async () => {
    const service = new CsvExportService();
    let saved: { blob: Blob; name: string } | null = null;
    vi.spyOn(service as any, 'download').mockImplementation((blob: any, name: any) => (saved = { blob, name }));

    await service.exportExperimentZip({
      filename: 'My experiment',
      details: {
        experimentName: 'My experiment',
        algorithm: 'Logistic Regression',
        datasets: ['IST'],
        filters: [],
        preprocessing: 'none',
        mipVersion: '9.0.0',
      },
      tables: [{ title: 'Coefficients', columns: ['Variable', 'Estimate'], rows: [['age', '0.12']] }],
      result: { coefficients: [0.123456789] },
    });

    expect(saved!.name).toBe('My_experiment.zip');
    const zip = await JSZip.loadAsync(saved!.blob);
    expect(Object.keys(zip.files).sort()).toEqual(['README.txt', 'result.json', 'tables/', 'tables/01_coefficients.csv']);

    const csv = await zip.file('tables/01_coefficients.csv')!.async('string');
    expect(csv).toBe('\uFEFFVariable,Estimate\r\nage,0.12');
    expect(JSON.parse(await zip.file('result.json')!.async('string'))).toEqual({ coefficients: [0.123456789] });

    const readme = await zip.file('README.txt')!.async('string');
    expect(readme).toContain('Algorithm: Logistic Regression');
    expect(readme).toContain('Datasets: IST');
    expect(readme).toContain('Coefficients: 1 row; columns: Variable, Estimate');
    expect(readme).toContain('from MIP 9.0.0');
    // Empty setup fields are left out instead of printed as "none".
    expect(readme).not.toContain('Filters');
    expect(readme).not.toContain('Preprocessing');
  });

  it('zips exact values where the screen rounds or merges them', async () => {
    const service = new CsvExportService();
    let saved: { blob: Blob; name: string } | null = null;
    vi.spyOn(service as any, 'download').mockImplementation((blob: any, name: any) => (saved = { blob, name }));

    await service.exportExperimentZip({
      filename: 'run',
      details: { experimentName: 'run', algorithm: 'T-test', datasets: [], filters: [], preprocessing: '', mipVersion: null } as any,
      tables: [
        { title: 'Summary', columns: ['Metric', 'Value'], rows: [['p-value', { text: '< 0.001', value: 1.2e-9 }]] },
        { title: 'Merged', columns: ['Category', 'A'], rows: [['x', '3 · 50.0%']], export: { columns: ['Category', 'A count', 'A share'], rows: [['x', 3, 0.5]] } },
      ],
      result: null,
    });

    const zip = await JSZip.loadAsync(saved!.blob);
    expect(await zip.file('tables/01_summary.csv')!.async('string')).toBe('\uFEFFMetric,Value\r\np-value,1.2e-9');
    expect(await zip.file('tables/02_merged.csv')!.async('string')).toBe('\uFEFFCategory,A count,A share\r\nx,3,0.5');
    expect(await zip.file('README.txt')!.async('string')).toContain('Merged: 1 row; columns: Category, A count, A share');
  });
});
