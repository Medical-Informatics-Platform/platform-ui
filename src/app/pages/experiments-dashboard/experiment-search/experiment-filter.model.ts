export type ExperimentDatePreset = 'any' | 'today' | '7d' | '30d';

export interface ExperimentFilters {
  query: string;
  datePreset: ExperimentDatePreset;

  algorithm: string | null;
  author: string | null;
  variable: string | null;

  status: 'any' | 'success' | 'error';
  shared: 'any' | 'shared' | 'private';
}

export interface ExperimentFilterOptions {
  algorithms: string[];
  authors: string[];
  variables: string[];
}
