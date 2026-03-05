import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { AlgorithmTableRegistry, TableSpec } from './algorithm-table-registry';
import { EnumMaps } from '../../../../core/algorithm-result-enum-mapper';


@Component({
  selector: 'app-auto-renderer',
  imports: [],
  templateUrl: './auto-renderer.component.html',
  styleUrl: './auto-renderer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoRendererComponent implements OnChanges {
  @Input() value: any = null;
  @Input() algorithm: string | null = null;
  @Input() fallbackTitle: string | null = null;
  @Input() labelMap: Record<string, string> | null = null;
  @Input() enumMaps: EnumMaps | null = null;
  @Input() yVar: string | null = null;
  algorithmToRender: string = '';

  tableSpec = signal<TableSpec[] | null>(null);
  error = signal<string | null>(null);

  private lastKey: string | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (!this.algorithm) {
      this.tableSpec.set(null);
      this.error.set(null);
      return;
    }

    const builder = AlgorithmTableRegistry[this.algorithm];
    if (!builder) {
      this.tableSpec.set(null);
      this.error.set(`No renderer for algorithm ${this.algorithm}`);
      return;
    }

    const key = JSON.stringify({
      algorithm: this.algorithm,
      value: this.value,
      labelMap: this.labelMap,
      enumMaps: this.enumMaps,
      yVar: this.yVar,
      fallbackTitle: this.fallbackTitle,
    });
    if (key === this.lastKey && this.tableSpec()) return;

    try {
      const enrichedValue = this.value && (this.labelMap || this.enumMaps)
        ? { ...this.value, __labelMap__: this.labelMap, __enumMaps__: this.enumMaps, __yVar__: this.yVar }
        : this.value;
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

  getOverrideTables(): TableSpec[] | null {
    if (!this.algorithm) return null;
    const builder = AlgorithmTableRegistry[this.algorithm];

    if (!builder) return null;

    try {
      const enrichedValue = this.value && (this.labelMap || this.enumMaps)
        ? { ...this.value, __labelMap__: this.labelMap, __enumMaps__: this.enumMaps, __yVar__: this.yVar }
        : this.value;
      const table = builder(enrichedValue);
      const explicitTitle = this.getResultTitle(enrichedValue);
      const resultTitle = explicitTitle ?? this.getFallbackTitle();
      return this.applyResultTitle(table, resultTitle, !!explicitTitle);
    } catch (err) {
      console.warn('[AutoRenderer] Custom table builder failed', err);
      return null;
    }
  }

  isPrimitive(val: any): boolean {
    return val === null || ['string', 'number', 'boolean'].includes(typeof val);
  }

  isArray(val: any): boolean {
    return Array.isArray(val);
  }

  isObject(val: any): boolean {
    return val && typeof val === 'object' && !Array.isArray(val);
  }

  isFlatObject(val: any): boolean {
    if (!this.isObject(val)) return false;
    return Object.values(val).every(v => this.isPrimitive(v));
  }

  isMatrix(arr: any[]): boolean {
    return this.isArray(arr) && arr.length > 0 && this.isArray(arr[0]);
  }

  getKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  trackByIndex(index: number): number {
    return index;
  }

  flattenObject(obj: any, prefix = '', res: any = {}): any {
    for (const key in obj) {
      const val = obj[key];
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        this.flattenObject(val, fullKey, res);
      } else {
        res[fullKey] = val;
      }
    }
    return res;
  }

  shouldFlatten(val: any): boolean {
    return this.isObject(val) && !this.isFlatObject(val);
  }

  isTabularObject(val: any): boolean {
    if (!this.isObject(val)) return false;
    const keys = Object.keys(val);
    if (keys.length === 0) return false;
    const firstLength = Array.isArray(val[keys[0]]) ? val[keys[0]].length : -1;
    if (firstLength === -1) return false;
    return keys.every(k => Array.isArray(val[k]) && val[k].length === firstLength);
  }

  getTabularRows(obj: any): any[] {
    const keys = Object.keys(obj);
    const rowCount = obj[keys[0]].length;
    const rows = [];
    for (let i = 0; i < rowCount; i++) {
      const row: any = {};
      for (const key of keys) {
        row[key] = obj[key][i];
      }
      rows.push(row);
    }
    return rows;
  }

  exportToCSV(table: TableSpec) {
    if (!table || !table.columns || !table.rows) return;

    const headers = table.columns.map(c => this.escapeCSV(c)).join(',');
    const csvRows = table.rows.map(row =>
      row.map(cell => this.escapeCSV(this.formatValue(cell))).join(',')
    );

    const csvContent = [headers, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const fileName = (table.title || this.algorithm || 'export')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '');

    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private escapeCSV(val: any): string {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private getResultTitle(result: any): string | null {
    const title = result?.title;
    if (typeof title !== 'string') return null;
    const trimmed = title.trim();
    return trimmed.length ? trimmed : null;
  }

  private getFallbackTitle(): string | null {
    if (typeof this.fallbackTitle !== 'string') return null;
    const trimmed = this.fallbackTitle.trim();
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
