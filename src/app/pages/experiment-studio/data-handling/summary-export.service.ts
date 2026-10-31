import { Injectable, inject, signal } from '@angular/core';
import { formatFilterExpression } from '../../../core/filter-display.utils';
import { CsvExportService } from '../../../services/csv-export.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { SummaryKind, SummaryView } from './data-handling.models';
import {
  SUMMARY_CSV_COLUMNS,
  datasetDisplayLabel,
  labelDatasetColumns,
  summaryCsvRows,
  summaryKindLabel,
} from './utils/summary-view.utils';

/**
 * Exports one summary surface (Source, Raw or Processed) as a PDF report or a CSV. Provided
 * by the Data Handling panel, whose template keeps the off-screen chart surfaces the PDF
 * reads: `.hidden-charts-for-export.<kind>-export` with a `.numeric-charts-export` and a
 * `.nominal-charts-export` container of `app-chart-renderer`s.
 */
@Injectable()
export class SummaryExportService {
  private readonly studio = inject(ExperimentStudioService);
  private readonly pdfExport = inject(PdfExportService);
  private readonly csvExport = inject(CsvExportService);
  private readonly mipVersion = inject(RuntimeEnvService).mipVersion;

  /** True while a PDF is being generated, so the panel can cover the page. */
  readonly exporting = signal(false);

  async toPdf(kind: SummaryKind, summary: SummaryView): Promise<void> {
    this.exporting.set(true);
    try {
      const numericCharts = document.querySelectorAll(
        `.hidden-charts-for-export.${kind}-export .numeric-charts-export app-chart-renderer`
      ) as NodeListOf<HTMLElement>;

      const nominalCharts = document.querySelectorAll(
        `.hidden-charts-for-export.${kind}-export .nominal-charts-export app-chart-renderer`
      ) as NodeListOf<HTMLElement>;

      const dataModel = this.studio.selectedDataModel();
      const pathologyName = dataModel?.label || dataModel?.code || '';

      const labelMap = this.studio.variableLabelMap();
      const enumMaps = this.studio.getCategoricalEnumMaps();
      const filterLogic = this.studio.filterLogic();
      await this.pdfExport.exportDescriptiveStatisticsPdf({
        title: summaryKindLabel(kind),
        pathologyName,
        context: [
          ['Datasets', this.studio.selectedDatasets().map((code) => this.datasetLabel(code))],
          // Source data is the selection before any cohort rule or preprocessing.
          ['Filters', kind !== 'source' && filterLogic ? formatFilterExpression(filterLogic, { labelMap, enumMaps }) : null],
          ['Preprocessing', kind === 'processed'
            ? this.studio.formatPreprocessingConfig(this.studio.getAppliedDescriptivePreprocessing(), labelMap, enumMaps).split('\n')
            : null],
        ],
        variables: labelDatasetColumns(summary.data, (code) => this.datasetLabel(code)),
        charts: numericCharts,
        nonNominalVariables: summary.nonNominalVariables,
        nominalCharts,
        nominalVariables: summary.nominalVariables,
        mipVersion: this.mipVersion,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      this.exporting.set(false);
    }
  }

  toCsv(kind: SummaryKind, summary: SummaryView): void {
    if (!summary.data.length) return;
    const rows = summaryCsvRows(summary.data, (code) => this.datasetLabel(code));
    this.csvExport.exportToCsv(rows, SUMMARY_CSV_COLUMNS, `${kind}_data_summary.csv`);
  }

  private datasetLabel(code: string): string {
    return datasetDisplayLabel(code, this.studio.getDatasetLabelMap());
  }
}
