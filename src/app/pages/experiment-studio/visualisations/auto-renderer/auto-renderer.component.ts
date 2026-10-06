import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { CsvExportService } from '../../../../services/csv-export.service';
import { getAlgorithmTableBuilder, TableSpec, TableTrim, trimTable } from './algorithm-table-registry';
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
  /** What the page already shows above (as figures or a chart): whole tables, or some of their
   *  columns or rows. Left out here; exports keep every table. */
  readonly covered = input<TableTrim[]>([]);
  /** Section heading drawn above the tables, only when at least one table is shown. */
  readonly heading = input<string | null>(null);

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
    const covered = this.covered();

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
      covered,
    });
    if (key === this.lastKey && this.tableSpec()) return;

    try {
      const enrichedValue = value && (labelMap || enumMaps || yVar || xVar)
        ? { ...value, __labelMap__: labelMap, __enumMaps__: enumMaps, __yVar__: yVar, __xVar__: xVar }
        : value;
      const spec = builder(enrichedValue).flatMap((table) => {
        const trim = covered.find((entry) => entry.title === table.title);
        const kept = trim ? trimTable(table, trim) : table;
        return kept ? [kept] : [];
      });
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

  /** Name columns read left-aligned; every other column holds numbers and aligns right. */
  isTextColumn(column: string | undefined): boolean {
    return column === 'Role' || column === 'Categories' || column === 'Dataset' || column === 'Rule' || !!column?.startsWith('Variable');
  }

  /** On screen: thousands grouped (111,854; 1,065,587), trailing zeros trimmed, a typographic minus;
   *  scientific notation only below 1e-4. With `grouping` off (CSV) numbers stay plain for spreadsheets. */
  formatValue(value: any, grouping = true): string {
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
    if (abs < 1e-4) return num.toExponential(3);

    // Large values keep no decimals, mid-size three, small four; trailing zeros go.
    const decimals = abs >= 1_000_000 ? 0 : abs < 1 ? 4 : 3;
    const text = num.toLocaleString('en-US', {
      maximumFractionDigits: decimals,
      useGrouping: grouping,
    });
    if (text === '-0') return '0';
    // Typographic minus on screen, like the key figures; CSV keeps the ASCII hyphen.
    return grouping ? text.replace(/^-/, '−') : text;
  }

  exportToCSV(table: TableSpec) {
    this.csvExport.exportTableCsv(
      { ...table, rows: (table.rows ?? []).map((row) => row.map((cell) => this.formatValue(cell, false))) },
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
