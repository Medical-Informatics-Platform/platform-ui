import { Injectable } from '@angular/core';
import {
  experimentContextRows,
  ExperimentExportDetails,
  filledContextRows,
  fileSlug,
  formatExportDate,
} from '../core/export.utils';
import { TableSpec } from '../pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry';

/** Excel only reads UTF-8 (accented labels, "≥") when the file starts with a BOM. */
const BOM = '\uFEFF';

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV text for a header row plus data rows. */
export function toCsv(columns: unknown[], rows: unknown[][]): string {
  return [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

interface ExperimentZipPayload {
  filename: string;
  details: ExperimentExportDetails;
  tables: TableSpec[];
  /** The raw engine result, kept at full precision next to the rounded tables. */
  result: unknown;
}

@Injectable({ providedIn: 'root' })
export class CsvExportService {
  /** Distribution (bins and counts) of one variable or group. */
  exportHistogramCsv(data: { bins: string[]; counts: number[] }, variableName: string): void {
    if (!data.bins || !data.counts || data.bins.length !== data.counts.length) {
      console.warn('Invalid data for CSV export');
      return;
    }
    const rows = data.bins.map((bin, index) => [bin, data.counts[index]]);
    this.downloadCsv(toCsv(['Category', 'Count'], rows), `${fileSlug(variableName, 'variable')}_distribution.csv`);
  }

  /** Array of objects, one column per header. */
  exportToCsv(data: Array<Record<string, unknown>>, headers: string[], filename: string): void {
    if (!data?.length) return;
    this.downloadCsv(toCsv(headers, data.map((row) => headers.map((header) => row[header]))), filename);
  }

  /** One result table as shown on screen. */
  exportTableCsv(table: TableSpec, fallbackName: string): void {
    if (!table?.columns || !table.rows) return;
    this.downloadCsv(toCsv(table.columns, table.rows), `${fileSlug(table.title || fallbackName, 'table').toLowerCase()}.csv`);
  }

  /**
   * Every result table as its own CSV, the raw result as JSON, and a README that
   * says which experiment, data and setup produced them, all in one ZIP.
   */
  async exportExperimentZip(payload: ExperimentZipPayload): Promise<void> {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const base = fileSlug(payload.filename || payload.details.experimentName, 'experiment');

    const tableFiles = payload.tables.map((table, index) => {
      const title = table.title || `Results table ${index + 1}`;
      const name = `tables/${String(index + 1).padStart(2, '0')}_${fileSlug(title, 'table').toLowerCase()}.csv`;
      zip.file(name, BOM + toCsv(table.columns, table.rows));
      return { name, title, table };
    });
    zip.file('result.json', JSON.stringify(payload.result ?? null, null, 2));
    zip.file('README.txt', this.experimentReadme(payload.details, tableFiles));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    this.download(blob, `${base}.zip`);
  }

  downloadCsv(content: string, filename: string): void {
    this.download(new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' }), filename);
  }

  private experimentReadme(
    details: ExperimentExportDetails,
    tableFiles: Array<{ name: string; title: string; table: TableSpec }>,
  ): string {
    const setup = filledContextRows(experimentContextRows(details)).flatMap(([label, values]) =>
      values.length > 1 ? [`${label}:`, ...values.map((value) => `  - ${value}`)] : [`${label}: ${values[0]}`]
    );
    const files = [
      ...tableFiles.map(({ name, title, table }) =>
        `${name}\n    ${title}: ${table.rows.length} row${table.rows.length === 1 ? '' : 's'}; columns: ${table.columns.join(', ')}`
      ),
      'result.json\n    The full result returned by the engine, unrounded. The tables round values for reading.',
    ];
    return [
      details.experimentName,
      '='.repeat(Math.min(details.experimentName.length, 80)),
      '',
      'Setup',
      '-----',
      ...setup,
      '',
      'Files',
      '-----',
      ...files,
      '',
      `Exported ${formatExportDate(new Date())}${details.mipVersion ? ` from MIP ${details.mipVersion}` : ''}.`,
      '',
    ].join('\r\n');
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
