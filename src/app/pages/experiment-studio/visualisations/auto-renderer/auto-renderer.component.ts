import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { CsvExportService } from '../../../../services/csv-export.service';
import { getAlgorithmTableBuilder, TableSpec } from './algorithm-table-registry';
import { EnumMaps } from '../../../../core/algorithm-result-enum-mapper';


@Component({
  selector: 'app-auto-renderer',
  imports: [],
  templateUrl: './auto-renderer.component.html',
  styleUrl: './auto-renderer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoRendererComponent {
  private readonly csvExport = inject(CsvExportService);
  readonly value = input<any>(null);
  readonly algorithm = input<string | null>(null);
  readonly fallbackTitle = input<string | null>(null);
  readonly labelMap = input<Record<string, string> | null>(null);
  readonly enumMaps = input<EnumMaps | null>(null);
  readonly yVar = input<string | null>(null);
  readonly xVar = input<string | null>(null);

  tableSpec = signal<TableSpec[] | null>(null);
  error = signal<string | null>(null);

  private lastKey: string | null = null;

  constructor() {
    effect(() => this.updateTableSpec());
  }

  private updateTableSpec(): void {
    const algorithm = this.algorithm();
    const value = this.value();
    const labelMap = this.labelMap();
    const enumMaps = this.enumMaps();
    const yVar = this.yVar();
    const xVar = this.xVar();
    const fallbackTitle = this.fallbackTitle();

    if (!algorithm) {
      this.tableSpec.set(null);
      this.error.set(null);
      return;
    }

    const builder = getAlgorithmTableBuilder(algorithm);
    if (!builder) {
      this.tableSpec.set(null);
      this.error.set(`No renderer for algorithm ${algorithm}`);
      return;
    }

    const key = JSON.stringify({
      algorithm,
      value,
      labelMap,
      enumMaps,
      yVar,
      xVar,
      fallbackTitle,
    });
    if (key === this.lastKey && this.tableSpec()) return;

    try {
      const enrichedValue = value && (labelMap || enumMaps || yVar || xVar)
        ? { ...value, __labelMap__: labelMap, __enumMaps__: enumMaps, __yVar__: yVar, __xVar__: xVar }
        : value;
      const spec = builder(enrichedValue);
      const explicitTitle = this.getResultTitle(enrichedValue);
      const resultTitle = explicitTitle ?? this.getFallbackTitle();
      this.tableSpec.set(this.applyResultTitle(spec, resultTitle, !!explicitTitle));
      this.error.set(null);
      this.lastKey = key;
    } catch (err) {
      console.warn('[AutoRenderer] Builder failed', err);
      this.tableSpec.set(null);
      this.error.set('Unable to render this result.');
    }
  }

  // Heuristic: smaller tables are rendered side by side
  isCompactTable(table: TableSpec | null | undefined): boolean {
    if (!table) return false;

    // Explicit override from config
    if (table.layout === 'full') return false;
    if (table.layout === 'compact') return true;

    const colCount = table.columns?.length ?? 0;
    const rowCount = table.rows?.length ?? 0;

    // few columns + not a lot of rows -> compact
    if (colCount === 0) return false;

    const maxLabelLength = (table.rows ?? []).reduce((max, row) => {
      const label = String(row?.[0] ?? '');
      return Math.max(max, label.length);
    }, 0);
    // Long row labels need the full grid row; compact cards cap near 360px.
    if (maxLabelLength > 48) return false;

    return colCount <= 3 && rowCount <= 12;
  }

  // helper
  formatValue(value: any): string {
    if (value === null || value === undefined) return '';

    // If number type is string, turn to number
    const maybeNum =
      typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value))
        ? Number(value)
        : value;

    if (typeof maybeNum !== 'number' || isNaN(maybeNum)) {
      return String(value);
    }

    const num = maybeNum;
    const abs = Math.abs(num);
    if (abs === 0) return '0';

    // scientific numbers
    if (abs < 1e-4 || abs >= 1_000_000) {
      return num.toExponential(3);
    }

    // Less decimals
    const decimals = abs < 1 ? 4 : 3;
    let fixed = num.toFixed(decimals);

    // Less zeros
    fixed = fixed
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.0+$/, '');

    if (fixed === '-0') fixed = '0';

    return fixed;
  }

  exportToCSV(table: TableSpec) {
    this.csvExport.exportTableCsv(
      { ...table, rows: (table.rows ?? []).map((row) => row.map((cell) => this.formatValue(cell))) },
      this.algorithm() || 'export',
    );
  }

  private getResultTitle(result: any): string | null {
    const title = result?.title;
    if (typeof title !== 'string') return null;
    const trimmed = title.trim();
    return trimmed.length ? trimmed : null;
  }

  private getFallbackTitle(): string | null {
    const fallbackTitle = this.fallbackTitle();
    if (typeof fallbackTitle !== 'string') return null;
    const trimmed = fallbackTitle.trim();
    return trimmed.length ? trimmed : null;
  }

  private applyResultTitle(tables: TableSpec[], resultTitle: string | null, forceOverride: boolean): TableSpec[] {
    if (!resultTitle || !Array.isArray(tables) || !tables.length) return tables;

    const isSingleTable = tables.length === 1;

    return tables.map((table, index) => {
      if (index !== 0) return table;

      const existingTitle = (table.title ?? '').trim();

      if (!existingTitle) {
        return { ...table, title: resultTitle };
      }

      if (!forceOverride) {
        return table;
      }

      if (existingTitle === resultTitle) {
        return table;
      }

      if (isSingleTable) {
        return { ...table, title: resultTitle };
      }

      const prefixed = `${resultTitle} - `;
      if (existingTitle.startsWith(prefixed)) {
        return table;
      }

      return { ...table, title: `${resultTitle} - ${existingTitle}` };
    });
  }
}
