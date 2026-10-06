import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CsvExportService } from '../../../../services/csv-export.service';
import { RegressionView } from './regression-view';

type CoefficientColumnMode = 'key' | 'all';

/** Key figures, one coefficients card with an interval-vs-zero column, and collapsed model-fit details. */
@Component({
  selector: 'app-regression-result',
  templateUrl: './regression-result.component.html',
  styleUrl: './regression-result.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegressionResultComponent {
  private readonly csvExport = inject(CsvExportService);

  readonly view = input.required<RegressionView>();
  readonly coefficientColumns = signal<CoefficientColumnMode>('key');
  readonly fitOpen = signal(false);

  /** Raw, unrounded numbers with an ASCII minus and separate CI bounds, so the file
   *  reads as numeric columns in a spreadsheet or R; blanks stand for missing values. */
  downloadCoefficientsCsv(): void {
    const model = this.view();
    const allColumns = this.coefficientColumns() === 'all';
    const headers = [
      'Variable',
      model.estimateLabel,
      ...(allColumns ? [...(model.coefficientLabel ? [model.coefficientLabel] : []), 'Std. error', model.statLabel] : []),
      'CI 95% lower',
      'CI 95% upper',
      'p',
    ];
    const raw = (value: number | null) => (value === null ? '' : String(value));
    const rows = model.rows.map((row) => ({
      'Variable': row.variable,
      [model.estimateLabel]: raw(row.estimate),
      ...(model.coefficientLabel ? { [model.coefficientLabel]: raw(row.coefficient) } : {}),
      'Std. error': raw(row.stdErr),
      [model.statLabel]: raw(row.stat),
      'CI 95% lower': raw(row.lower),
      'CI 95% upper': raw(row.upper),
      'p': raw(row.pValue),
    }));
    const slug = model.dependent.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'coefficients';
    this.csvExport.exportToCsv(rows, headers, `${slug}_coefficients.csv`);
  }
}
