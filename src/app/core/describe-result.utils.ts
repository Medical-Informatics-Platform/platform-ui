import { VariableStats } from '../models/algorithm-results.model';

interface DescribePayload {
  featurewise?: unknown;
}

export function getFeaturewiseDescribeRows(value: unknown): VariableStats[] {
  const payload = unwrapDescribePayload(value);
  const rows = payload?.featurewise ?? [];
  return Array.isArray(rows) ? rows as VariableStats[] : [];
}

function readDatasetLabels(source: unknown): Record<string, string> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const labels = (source as { dataset_labels?: unknown }).dataset_labels;
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return {};
  return labels as Record<string, string>;
}

export function getDescribeDatasetLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const topLevel = readDatasetLabels(value);
  if (Object.keys(topLevel).length) return topLevel;
  return readDatasetLabels(unwrapDescribePayload(value));
}

export function resolveDatasetDisplayLabel(
  code: string,
  labels: Record<string, string>
): string {
  if (!code) return code;
  if (String(code).toLowerCase() === 'all datasets') return 'All datasets';
  return labels[code] ?? code;
}

function unwrapDescribePayload(value: unknown): DescribePayload | null {
  if (!value || typeof value !== 'object') return null;
  const maybeResponse = value as { result?: unknown };
  if (maybeResponse.result && typeof maybeResponse.result === 'object') {
    return maybeResponse.result as DescribePayload;
  }
  return value as DescribePayload;
}
