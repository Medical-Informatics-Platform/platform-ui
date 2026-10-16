import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CsvExportService } from '../../../../services/csv-export.service';
import { KeyFiguresComponent } from '../summary/key-figures.component';
import { CoefficientColumn, CoefficientRow, RegressionView } from './regression-view';

type CoefficientColumnMode = 'key' | 'all';
type TextColumn = Exclude<CoefficientColumn, 'interval'>;

/** Grid track of each column after the variable name. */
const COLUMN_WIDTHS: Record<CoefficientColumn, string> = {
  estimate: '0.7fr',
  coefficient: '0.7fr',
  stdErr: '0.7fr',
  stat: '0.55fr',
  ci: '1.1fr',
  interval: '1.3fr',
  p: '0.6fr',
};

const COLUMN_TEXT: Record<TextColumn, keyof CoefficientRow> = {
  estimate: 'estimateText',
  coefficient: 'coefficientText',
  stdErr: 'stdErrText',
  stat: 'statText',
  ci: 'ciText',
  p: 'pText',
};

/** Key figures, one coefficients card with an interval-vs-zero column, and collapsed model-fit details. */
@Component({
  selector: 'app-regression-result',
  imports: [KeyFiguresComponent],
  templateUrl: './regression-result.component.html',
  styleUrl: './regression-result.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegressionResultComponent {
  private readonly csvExport = inject(CsvExportService);

  readonly view = input.required<RegressionView>();
  readonly coefficientColumns = signal<CoefficientColumnMode>('key');
  readonly fitOpen = signal(false);
  readonly columns = computed(() => (this.coefficientColumns() === 'all' ? this.view().allColumns : this.view().keyColumns));
  readonly showsInterval = computed(() => this.columns().includes('interval'));
  /** Grid tracks for the container's wide and narrow (< 620px, no interval sketch) layouts. */
  readonly gridColumns = computed(() => ['minmax(0, 1.3fr)', ...this.columns().map((column) => COLUMN_WIDTHS[column])].join(' '));
  readonly narrowGridColumns = computed(() =>
    ['minmax(96px, 1fr)', ...this.columns().filter((column) => column !== 'interval').map(() => 'auto')].join(' '),
  );
  readonly hasLevels = computed(() => this.view().rows.some((row) => row.level !== null));
  /** "an odds ratio", "a hazard ratio". */
  readonly ratioPhrase = computed(() => {
    const label = this.view().estimateLabel.toLowerCase();
    return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`;
  });

  columnLabel(column: CoefficientColumn): string {
    const model = this.view();
    switch (column) {
      case 'estimate': return model.estimateLabel;
      case 'coefficient': return model.coefficientLabel ?? '';
      case 'stdErr': return 'Std. error';
      case 'stat': return model.statLabel;
      case 'ci': return '95% CI';
      case 'interval': return `Interval vs ${model.nullValue}`;
      case 'p': return 'p-value';
    }
  }

  cellText(row: CoefficientRow, column: TextColumn): string {
    return String(row[COLUMN_TEXT[column]]);
  }

  /** The shown columns as raw, unrounded numbers with an ASCII minus and separate CI bounds, so the
   *  file reads as numeric columns in a spreadsheet or R; blanks stand for missing values. */
  downloadCoefficientsCsv(): void {
    const model = this.view();
    const raw = (value: number | null) => (value === null ? '' : String(value));
    const fields: [string, (row: CoefficientRow) => number | null][] = this.columns().flatMap((column) => {
      switch (column) {
        case 'interval': return [];
        case 'ci': return [['CI 95% lower', (row: CoefficientRow) => row.lower], ['CI 95% upper', (row: CoefficientRow) => row.upper]];
        case 'estimate': return [[this.columnLabel(column), (row: CoefficientRow) => row.estimate]];
        case 'coefficient': return [[this.columnLabel(column), (row: CoefficientRow) => row.coefficient]];
        case 'stdErr': return [[this.columnLabel(column), (row: CoefficientRow) => row.stdErr]];
        case 'stat': return [[this.columnLabel(column), (row: CoefficientRow) => row.stat]];
        case 'p': return [[this.columnLabel(column), (row: CoefficientRow) => row.pValue]];
      }
    });
    const headers = ['Variable', ...fields.map(([header]) => header)];
    const rows = model.rows.map((row) => ({
      'Variable': row.variable,
      ...Object.fromEntries(fields.map(([header, value]) => [header, raw(value(row))])),
    }));
    const slug = model.dependent.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'coefficients';
    this.csvExport.exportToCsv(rows, headers, `${slug}_coefficients.csv`);
  }
}
