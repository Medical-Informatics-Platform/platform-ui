import JSZip from 'jszip';
import { CsvExportService, toCsv } from './csv-export.service';

describe('CsvExportService', () => {
  it('quotes only the cells that need it', () => {
    expect(toCsv(['Variable', 'Value'], [['age, years', 'say "hi"'], ['sex', null]]))
      .toBe('Variable,Value\r\n"age, years","say ""hi"""\r\nsex,');
  });

  it('zips one CSV per table, the raw result and a README describing the setup', async () => {
    const service = new CsvExportService();
    let saved: { blob: Blob; name: string } | null = null;
    spyOn(service as any, 'download').and.callFake((blob: Blob, name: string) => (saved = { blob, name }));

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
});
