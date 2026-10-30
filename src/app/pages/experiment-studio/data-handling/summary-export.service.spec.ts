import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CsvExportService } from '../../../services/csv-export.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import type { PivotBlock } from './data-handling.models';
import { SummaryExportService } from './summary-export.service';
import { emptySummaryView } from './utils/summary-view.utils';

const age: PivotBlock = {
  code: 'age',
  name: 'Age',
  columns: ['d1', 'all datasets'],
  rows: [{ metric: 'Mean', values: { d1: '61.00', 'all datasets': '62.50' } }],
};

function setup() {
  const studio = {
    selectedDataModel: signal({ code: 'dementia', label: 'Dementia' }),
    variableLabelMap: signal({ age: 'Age' }),
    getCategoricalEnumMaps: () => ({}),
    filterLogic: signal<unknown>(null),
    selectedDatasets: () => ['d1'],
    getDatasetLabelMap: () => ({ d1: 'Dataset one', 'all datasets': 'All datasets' }),
    getAppliedDescriptivePreprocessing: () => ({ missing_values_handler: { strategies: { age: 'drop' } } }),
    formatPreprocessingConfig: vi.fn(() => 'Missing values\nage: drop'),
  };
  const pdf = { exportDescriptiveStatisticsPdf: vi.fn((..._args: unknown[]) => Promise.resolve()) };
  const csv = { exportToCsv: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      SummaryExportService,
      { provide: ExperimentStudioService, useValue: studio },
      { provide: PdfExportService, useValue: pdf },
      { provide: CsvExportService, useValue: csv },
      { provide: RuntimeEnvService, useValue: { mipVersion: '9.9.9' } },
    ],
  });
  const summary = { ...emptySummaryView(false), data: [age], nonNominalVariables: [{ code: 'age' }], nominalVariables: [] };
  return { service: TestBed.inject(SummaryExportService), studio, pdf, csv, summary };
}

describe('SummaryExportService', () => {
  afterEach(() => document.querySelectorAll('.hidden-charts-for-export').forEach((node) => node.remove()));

  describe('toCsv', () => {
    it('writes one record per variable, metric and dataset under the surface\'s file name', () => {
      const { service, csv, summary } = setup();
      service.toCsv('processed', summary);

      expect(csv.exportToCsv).toHaveBeenCalledWith(
        [
          { Variable: 'Age', Metric: 'Mean', Dataset: 'Dataset one', Value: '61.00' },
          { Variable: 'Age', Metric: 'Mean', Dataset: 'All datasets', Value: '62.50' },
        ],
        ['Variable', 'Metric', 'Dataset', 'Value'],
        'processed_data_summary.csv',
      );
    });

    it('exports nothing for an empty surface', () => {
      const { service, csv } = setup();
      service.toCsv('raw', emptySummaryView(false));
      expect(csv.exportToCsv).not.toHaveBeenCalled();
    });
  });

  describe('toPdf', () => {
    function mountCharts(kind: string, numeric: number, nominal: number) {
      const host = document.createElement('div');
      host.className = `hidden-charts-for-export ${kind}-export`;
      host.innerHTML =
        `<div class="numeric-charts-export">${'<app-chart-renderer></app-chart-renderer>'.repeat(numeric)}</div>` +
        `<div class="nominal-charts-export">${'<app-chart-renderer></app-chart-renderer>'.repeat(nominal)}</div>`;
      document.body.appendChild(host);
    }

    it('hands the report the surface\'s own chart containers, labelled columns and setup', async () => {
      const { service, studio, pdf, summary } = setup();
      studio.filterLogic.set({ condition: 'AND', rules: [] });
      mountCharts('raw', 2, 1);
      mountCharts('processed', 5, 5);
      await service.toPdf('raw', summary);

      const [report] = pdf.exportDescriptiveStatisticsPdf.mock.calls[0] as [Record<string, any>];
      expect(report['title']).toBe('Raw data');
      expect(report['pathologyName']).toBe('Dementia');
      expect(report['charts'].length).toBe(2);
      expect(report['nominalCharts'].length).toBe(1);
      expect(report['mipVersion']).toBe('9.9.9');
      expect(report['variables'][0].columns).toEqual(['Dataset one', 'All datasets']);
      expect(report['variables'][0].rows[0].values).toEqual({ 'Dataset one': '61.00', 'All datasets': '62.50' });
      const context = new Map<string, unknown>(report['context']);
      expect(context.get('Datasets')).toEqual(['Dataset one']);
      expect(context.get('Filters')).not.toBeNull();
      expect(context.get('Preprocessing')).toBeNull();
    });

    it('leaves the cohort and preprocessing out of Source data and states preprocessing on Processed data', async () => {
      const { service, studio, pdf, summary } = setup();
      studio.filterLogic.set({ condition: 'AND', rules: [] });
      await service.toPdf('source', summary);
      await service.toPdf('processed', summary);

      const contextOf = (call: number) => new Map<string, unknown>((pdf.exportDescriptiveStatisticsPdf.mock.calls[call][0] as { context: Array<[string, unknown]> }).context);
      expect(contextOf(0).get('Filters')).toBeNull();
      expect(contextOf(0).get('Preprocessing')).toBeNull();
      expect(contextOf(1).get('Preprocessing')).toEqual(['Missing values', 'age: drop']);
    });

    it('is exporting only while the report is being generated', async () => {
      const { service, pdf, summary } = setup();
      let finish!: () => void;
      pdf.exportDescriptiveStatisticsPdf.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

      const pending = service.toPdf('raw', summary);
      expect(service.exporting()).toBe(true);
      finish();
      await pending;
      expect(service.exporting()).toBe(false);
    });

    it('logs a failed report instead of throwing and stops exporting', async () => {
      const { service, pdf, summary } = setup();
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      pdf.exportDescriptiveStatisticsPdf.mockRejectedValue(new Error('canvas'));

      await expect(service.toPdf('raw', summary)).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith('PDF export failed:', expect.any(Error));
      expect(service.exporting()).toBe(false);
      error.mockRestore();
    });
  });
});
