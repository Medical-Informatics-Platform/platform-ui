import { VariableStats } from '../models/algorithm-results.model';

interface DescribePayload {
  featurewise?: unknown;
}

export function getFeaturewiseDescribeRows(value: unknown): VariableStats[] {
  const payload = unwrapDescribePayload(value);
  const rows = payload?.featurewise ?? [];
  return Array.isArray(rows) ? rows as VariableStats[] : [];
}

function unwrapDescribePayload(value: unknown): DescribePayload | null {
  if (!value || typeof value !== 'object') return null;
  const maybeResponse = value as { result?: unknown };
  if (maybeResponse.result && typeof maybeResponse.result === 'object') {
    return maybeResponse.result as DescribePayload;
  }
  return value as DescribePayload;
}
