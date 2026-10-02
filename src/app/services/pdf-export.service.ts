import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  captureChart,
  captureCharts,
  ChartImage,
  ContextRow,
  experimentContextRows,
  ExperimentExportDetails,
  filledContextRows,
  fileSlug,
  formatExportDate,
} from '../core/export.utils';
import { getAlgorithmTableBuilder, TableSpec } from '../pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry';

interface ExperimentPdfPayload {
  filename: string;
  details: ExperimentExportDetails;
  algorithmKey?: string | null;
  result?: unknown;
  chartContainer?: HTMLElement | null;
}

interface HistogramPdfOptions {
  title: string;
  nodeLabel: string;
  modelLabel: string;
  datasetLabels: string[];
  description?: string;
  meta?: {
    pathNodes?: Array<{ code: string; label: string }>;
    groupCount: number;
    hasGroups: boolean;
  } | null;
  isGroupView: boolean;
  mipVersion?: string | null;
}

interface DescriptiveStatsBlock {
  name: string;
  columns: string[];
  rows: Array<{ metric: string; values: Record<string, unknown> }>;
}

interface DescriptiveStatsData {
  /** e.g. "Raw data" or "Processed data". */
  title: string;
  pathologyName?: string;
  /** Setup the statistics describe: datasets, filters, preprocessing. */
  context?: ContextRow[];
  variables: DescriptiveStatsBlock[];
  charts?: NodeListOf<HTMLElement>;
  nonNominalVariables?: Array<{ name?: string; label?: string }>;
  nominalCharts?: NodeListOf<HTMLElement>;
  nominalVariables?: Array<{ name?: string; label?: string }>;
  mipVersion?: string | null;
}

const BRAND: [number, number, number] = [43, 51, 233];
const PLATFORM_NAME = 'Medical Informatics Platform';
const LOGO_URL = '/assets/mip-logo.png';

/**
 * One A4 document with a moving cursor: blocks flow onto the current page and
 * break only when they do not fit, instead of one table or chart per page.
 */
class PdfReport {
  readonly doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  private readonly margin = { left: 18, right: 18, top: 26, bottom: 20 };
  private y = this.margin.top;
  /** Drawn with the next block, so a heading never ends a page alone. */
  private pendingHeading: string | null = null;

  private get pageWidth(): number { return this.doc.internal.pageSize.getWidth(); }
  private get pageHeight(): number { return this.doc.internal.pageSize.getHeight(); }
  private get contentWidth(): number { return this.pageWidth - this.margin.left - this.margin.right; }

  newPage(): void {
    this.doc.addPage();
    this.y = this.margin.top;
  }

  /** Make room for a block (plus any pending heading), then draw the heading. */
  private ensure(height: number): void {
    const headingHeight = this.pendingHeading ? 9 : 0;
    if (this.y + height + headingHeight > this.pageHeight - this.margin.bottom) this.newPage();
    this.flushHeading();
  }

  title(text: string, subtitle?: string): void {
    const { doc } = this;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    const lines: string[] = doc.splitTextToSize(text, this.contentWidth);
    doc.text(lines, this.margin.left, this.y + 4);
    this.y += 4 + lines.length * 7;
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.6);
    doc.line(this.margin.left, this.y - 3, this.margin.left + 40, this.y - 3);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100);
      const sub: string[] = doc.splitTextToSize(subtitle, this.contentWidth);
      doc.text(sub, this.margin.left, this.y + 2);
      this.y += sub.length * 5;
    }
    this.y += 6;
  }

  heading(text: string): void {
    this.flushHeading();
    this.pendingHeading = text;
  }

  private flushHeading(): void {
    if (!this.pendingHeading) return;
    const { doc } = this;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(this.pendingHeading, this.margin.left, this.y + 4);
    this.y += 9;
    this.pendingHeading = null;
  }

  /** Two-column label/value block; empty rows are left out. */
  context(rows: ContextRow[]): void {
    const body = filledContextRows(rows).map(([label, values]) => [
      label,
      values.length > 1 ? values.map((value) => `• ${value}`).join('\n') : values[0],
    ]);
    if (!body.length) return;
    this.ensure(12);
    autoTable(this.doc, {
      startY: this.y,
      body,
      theme: 'plain',
      margin: { left: this.margin.left, right: this.margin.right, top: this.margin.top, bottom: this.margin.bottom },
      styles: { fontSize: 9, cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 3 }, textColor: 40 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38, textColor: 15 } },
    });
    this.y = this.lastTableEnd() + 6;
  }

  /** What the document holds, so a reader knows before paging through it. */
  contents(items: string[]): void {
    this.heading('Contents');
    const { doc } = this;
    const body = () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40);
    };
    items.forEach((item, index) => {
      body();
      const lines: string[] = doc.splitTextToSize(`${index + 1}. ${item}`, this.contentWidth);
      this.ensure(lines.length * 4.5);
      body();
      doc.text(lines, this.margin.left, this.y + 3);
      this.y += lines.length * 4.5;
    });
    this.y += 6;
  }

  paragraph(text: string): void {
    const { doc } = this;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines: string[] = doc.splitTextToSize(text, this.contentWidth);
    this.ensure(lines.length * 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(lines, this.margin.left, this.y + 3);
    this.y += lines.length * 5 + 4;
  }

  table(spec: TableSpec, fallbackTitle = 'Results table'): void {
    this.ensure(30);
    this.subheading(spec.title || fallbackTitle);
    autoTable(this.doc, {
      startY: this.y,
      head: [spec.columns ?? []],
      body: (spec.rows ?? []).map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)))),
      margin: { left: this.margin.left, right: this.margin.right, top: this.margin.top, bottom: this.margin.bottom },
      styles: { fontSize: 8, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 247, 254] },
      rowPageBreak: 'avoid',
    });
    this.y = this.lastTableEnd() + 8;
  }

  /** Charts are capped at half the printable height, so two share a page. */
  chart(image: ChartImage, title: string): void {
    const maxHeight = (this.pageHeight - this.margin.top - this.margin.bottom) / 2 - 14;
    let width = this.contentWidth;
    let height = (image.height * width) / image.width;
    if (height > maxHeight) {
      height = maxHeight;
      width = (image.width * height) / image.height;
    }
    this.ensure(height + 10);
    this.subheading(title);
    this.doc.addImage(image.dataUrl, 'JPEG', (this.pageWidth - width) / 2, this.y, width, height, undefined, 'FAST');
    this.y += height + 8;
  }

  private subheading(text: string): void {
    const { doc } = this;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    const lines: string[] = doc.splitTextToSize(text, this.contentWidth);
    doc.text(lines, this.margin.left, this.y + 3);
    this.y += lines.length * 5 + 1;
  }

  private lastTableEnd(): number {
    return (this.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? this.y;
  }

  /** Header and footer on every page, then download. */
  async save(filename: string, mipVersion?: string | null): Promise<void> {
    this.flushHeading();
    const { doc } = this;
    const logo = await loadImageData(LOGO_URL);
    const exported = `Exported ${formatExportDate(new Date())}`;
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page);
      // A fixed alias embeds the logo once, not once per page.
      if (logo) doc.addImage(logo, 'PNG', this.margin.left, 8, 9, 9, 'mip-logo', 'FAST');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(120);
      doc.text(PLATFORM_NAME, this.pageWidth - this.margin.right, 14, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(this.margin.left, 19, this.pageWidth - this.margin.right, 19);

      const footerY = this.pageHeight - 10;
      if (mipVersion) doc.text(`MIP ${mipVersion}`, this.margin.left, footerY);
      doc.text(`${page} / ${total}`, this.pageWidth / 2, footerY, { align: 'center' });
      doc.text(exported, this.pageWidth - this.margin.right, footerY, { align: 'right' });
    }
    doc.save(`${fileSlug(filename, 'export')}.pdf`);
  }
}

async function loadImageData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read image.'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('[PdfExportService] Logo load failed', error);
    return null;
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  /** Experiment report: setup, contents, every result table, then every result chart. */
  async exportExperimentPdf(payload: ExperimentPdfPayload): Promise<void> {
    const { details } = payload;
    if (!details?.experimentName) {
      console.warn('PdfExportService: missing experiment details.');
      return;
    }

    const tables = experimentTables(payload.algorithmKey, payload.result);
    const charts = payload.chartContainer ? await captureCharts(payload.chartContainer) : [];
    const chartTitles = charts.map((chart, index) => chart.title || `Figure ${index + 1}`);

    const report = new PdfReport();
    report.title(details.experimentName, 'Experiment report');
    report.heading('About this experiment');
    report.context(experimentContextRows(details));
    report.contents(
      tables.length || charts.length
        ? [
          ...tables.map((table, index) => `Table: ${table.title || `Results table ${index + 1}`}`),
          ...chartTitles.map((title) => `Figure: ${title}`),
        ]
        : ['No result data available for this experiment.'],
    );

    if (tables.length || charts.length) {
      report.newPage();
      report.heading('Results');
      tables.forEach((table, index) => report.table(table, `Results table ${index + 1}`));
      charts.forEach((chart, index) => report.chart(chart, chartTitles[index]));
    }

    await report.save(payload.filename || details.experimentName || 'experiment-report', details.mipVersion);
  }

  /** Descriptive statistics: setup, one table per variable, then box plots and frequency charts. */
  async exportDescriptiveStatisticsPdf(data: DescriptiveStatsData): Promise<void> {
    const numeric = await this.labelledCharts(data.charts, data.nonNominalVariables, 'Variable');
    const nominal = await this.labelledCharts(data.nominalCharts, data.nominalVariables, 'Nominal variable');

    const report = new PdfReport();
    report.title(`Descriptive statistics · ${data.title}`, data.pathologyName);
    report.heading('About this export');
    report.context([
      ['Pathology', data.pathologyName],
      ...(data.context ?? []),
      ['Variables', data.variables.map((variable) => variable.name)],
    ]);
    report.contents([
      `Summary tables (${plural(data.variables.length, 'variable')})`,
      ...(numeric.length ? [`Box plots (${plural(numeric.length, 'chart')})`] : []),
      ...(nominal.length ? [`Frequency charts (${plural(nominal.length, 'chart')})`] : []),
    ]);

    report.newPage();
    report.heading('Summary tables');
    data.variables.forEach((variable) =>
      report.table({
        title: variable.name,
        columns: ['Metric', ...variable.columns],
        rows: variable.rows.map((row) => [row.metric, ...variable.columns.map((column) => row.values[column])]),
      })
    );
    if (numeric.length) {
      report.heading('Box plots (numeric variables)');
      numeric.forEach(({ image, title }) => report.chart(image, title));
    }
    if (nominal.length) {
      report.heading('Frequency charts (nominal variables)');
      nominal.forEach(({ image, title }) => report.chart(image, title));
    }

    await report.save(`descriptive_statistics_${data.title}`, data.mipVersion);
  }

  /** One variable's (or group's) chart with where it sits in the data model. */
  async exportHistogramPdf(element: HTMLElement, options: HistogramPdfOptions): Promise<void> {
    const { meta, isGroupView } = options;
    const image = await captureChart(element.querySelector<HTMLElement>('#histogram-chart') ?? element);

    const report = new PdfReport();
    report.title(options.nodeLabel || options.title, options.title);
    report.heading('About this export');
    report.context([
      ['Pathology', options.modelLabel],
      ['Datasets', isGroupView ? null : options.datasetLabels],
      ['Path', isGroupView ? null : meta?.pathNodes?.map((node) => node.label).join(' > ')],
      ['Description', isGroupView ? null : options.description],
      [meta?.hasGroups ? 'Groups' : 'Variables', !isGroupView && meta ? String(meta.groupCount) : null],
      ['Chart', isGroupView
        ? `Number of variables in each group of ${options.nodeLabel || 'this group'}.`
        : 'Number of records in each category or value range, across the selected datasets.'],
    ]);
    if (image) {
      report.chart(image, image.title || options.nodeLabel || options.title);
    } else {
      report.paragraph('The chart could not be captured.');
    }

    await report.save(`${options.nodeLabel || 'histogram'}_summary`, options.mipVersion);
  }

  private async labelledCharts(
    elements: NodeListOf<HTMLElement> | undefined,
    variables: Array<{ name?: string; label?: string }> | undefined,
    fallback: string,
  ): Promise<Array<{ image: ChartImage; title: string }>> {
    const out: Array<{ image: ChartImage; title: string }> = [];
    for (const [index, element] of Array.from(elements ?? []).entries()) {
      const label = variables?.[index]?.name || variables?.[index]?.label || `${fallback} ${index + 1}`;
      try {
        const images = await captureCharts(element);
        images.forEach((image) => out.push({ image, title: image.title && image.title !== label ? `${label} · ${image.title}` : label }));
      } catch (error) {
        console.warn('[PdfExportService] Chart capture failed', label, error);
      }
    }
    return out;
  }
}

/** Result tables through the same registry the result view uses. */
export function experimentTables(algorithmKey?: string | null, result?: unknown): TableSpec[] {
  if (!algorithmKey || !result) return [];
  const builder = getAlgorithmTableBuilder(algorithmKey);
  if (!builder) return [];
  try {
    return builder(result) || [];
  } catch (error) {
    console.warn('[PdfExportService] Table builder failed', error);
    return [];
  }
}
