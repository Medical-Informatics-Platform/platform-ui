import html2canvas from 'html2canvas';
import { prettifyLabel } from './algorithm-mappers';

export interface ChartImage {
  /** JPEG data-URL on a white background. */
  dataUrl: string;
  width: number;
  height: number;
  /** The chart's own title, when it has one. */
  title: string;
}

/**
 * JPEG keeps exported charts small: a lossless PNG screenshot at 2-3x was the
 * main reason a report weighed several MB. 2x pixel ratio stays sharp in print.
 */
const PIXEL_RATIO = 2;
const JPEG_QUALITY = 0.85;

/**
 * Every ECharts chart inside `container`, in document order. Nothing else is
 * captured, so a results section without charts never becomes a screenshot.
 */
export async function captureCharts(container: HTMLElement): Promise<ChartImage[]> {
  const hosts = Array.from(container.querySelectorAll<HTMLElement>('[_echarts_instance_]'));
  const images: ChartImage[] = [];
  for (const host of hosts) {
    const image = await captureEChart(host);
    if (image) images.push(image);
  }
  return images;
}

/**
 * Render the chart inside `element` to a compressed image. Uses, in order:
 * the ECharts instance's own export, the first SVG (D3 charts), then a
 * screenshot of the element as a last resort.
 */
export async function captureChart(element: HTMLElement): Promise<ChartImage | null> {
  return (
    (await captureEChart(element)) ??
    (await captureSvg(element)) ??
    (await captureScreenshot(element))
  );
}

async function captureEChart(element: HTMLElement): Promise<ChartImage | null> {
  const host = element.hasAttribute('_echarts_instance_')
    ? element
    : element.querySelector<HTMLElement>('[_echarts_instance_]');
  if (!host) return null;

  // Same lazy module ngx-echarts loads, so the instance registry is shared.
  const echarts = await import('echarts');
  const chart = echarts.getInstanceByDom(host);
  if (!chart || !chart.getWidth() || !chart.getHeight()) return null;

  const option = chart.getOption() as { title?: Array<{ text?: string }> };
  return {
    dataUrl: chart.getDataURL({ type: 'jpeg', pixelRatio: PIXEL_RATIO, backgroundColor: '#ffffff' }),
    width: chart.getWidth() * PIXEL_RATIO,
    height: chart.getHeight() * PIXEL_RATIO,
    // Multi-line chart titles ("Group means\np-value: …") read as one line in a list.
    title: String(option.title?.[0]?.text ?? '').trim().replace(/\s*\n\s*/g, ' · '),
  };
}

async function captureSvg(element: HTMLElement): Promise<ChartImage | null> {
  const svg = element.querySelector('svg');
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  const width = parseFloat(svg.getAttribute('width') ?? '') || box.width;
  const height = parseFloat(svg.getAttribute('height') ?? '') || box.height;
  if (!width || !height) return null;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  );
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
    if (!img) return null;
    const canvas = whiteCanvas(width * PIXEL_RATIO, height * PIXEL_RATIO);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width: canvas.width, height: canvas.height, title: '' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function captureScreenshot(element: HTMLElement): Promise<ChartImage | null> {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: PIXEL_RATIO,
    useCORS: true,
    logging: false,
  });
  if (!canvas.width || !canvas.height) return null;
  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width: canvas.width, height: canvas.height, title: '' };
}

function whiteCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/** File-name-safe slug: letters, digits, dash and underscore only. */
export function fileSlug(value: string, fallback: string): string {
  const slug = String(value ?? '').trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '');
  return slug || fallback;
}

/** Label + value row of an export's "About this export" block; arrays render as bullets. */
export type ContextRow = [label: string, value: string | string[] | null | undefined];

/** What an experiment export describes: the setup the result came from. */
export interface ExperimentExportDetails {
  experimentName: string;
  createdBy?: string | null;
  createdAt?: Date | string | null;
  algorithm?: string | null;
  params?: Record<string, unknown> | null;
  preprocessing?: string | null;
  domain?: string | null;
  datasets?: string[] | null;
  variables?: string[] | null;
  covariates?: string[] | null;
  filters?: string[] | null;
  interactions?: string | string[] | null;
  transformations?: string | string[] | null;
  mipVersion?: string | null;
}

/** The experiment's setup as context rows, shared by the PDF report and the ZIP README. */
export function experimentContextRows(details: ExperimentExportDetails): ContextRow[] {
  const created = [details.createdBy, formatExportDate(details.createdAt)].filter(Boolean).join(', ');
  return [
    ['Algorithm', details.algorithm],
    ['Parameters', Object.entries(details.params ?? {}).map(([key, value]) => `${prettifyLabel(key)}: ${formatExportValue(value)}`)],
    ['Pathology', details.domain],
    ['Datasets', details.datasets],
    ['Outcome (y)', details.variables],
    ['Covariates (x)', details.covariates],
    ['Filters', details.filters],
    ['Preprocessing', details.preprocessing ? details.preprocessing.split('\n') : null],
    ['Interactions', details.interactions],
    ['Transformations', details.transformations],
    ['Created', created],
  ];
}

/** Drop rows with no value, so an export never lists "none" placeholders. */
export function filledContextRows(rows: ContextRow[]): Array<[string, string[]]> {
  return rows
    .map(([label, value]): [string, string[]] => [
      label,
      (Array.isArray(value) ? value : [value ?? '']).map((item) => String(item).trim()).filter((item) => item && item !== 'none'),
    ])
    .filter(([, values]) => values.length > 0);
}

export function formatExportDate(value?: Date | string | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export function formatExportValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatExportValue).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
