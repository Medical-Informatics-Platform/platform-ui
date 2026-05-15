import { RawInputData, RawPreprocessingStep } from "./backend-algorithms.model";

export interface AlgorithmParameter {
  type: 'number' | 'string' | 'boolean' | 'select' | 'multi-select' | 'dict';
  label: string;
  default?: number | string | boolean | Array<string | number>;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
}

export interface AlgorithmDefinition {
  label: string;
  description?: string;
  category: string;
  requiresY: boolean;
  requiresX: boolean;
  supportsWeights: boolean;
  supportsFilters: boolean;
  configSchema: Record<string, AlgorithmParameter>;
}

export type AlgorithmAvailabilityRole = 'y' | 'x';

export interface AlgorithmAvailabilityDetail {
  role: AlgorithmAvailabilityRole;
  label: string;
  selectedCount: number;
  minCount: number;
  maxCount: number | null;
  required: boolean;
  types: string[];
  stattypes: string[];
  messages: string[];
  satisfied: boolean;
}

export interface AlgorithmAvailability {
  available: boolean;
  summary: string | null;
  details: AlgorithmAvailabilityDetail[];
}

export interface AlgorithmConfig {
  name: string;
  label: string;
  description: string;
  documentation?: string;
  type?: string;
  flags?: string[];
  requiredVariable: string[];
  covariate: string[];
  category: string;
  configSchema: Array<any>;
  inputdata?: RawInputData;
  preprocessing?: RawPreprocessingStep[];
  isDisabled: boolean;
  availability?: AlgorithmAvailability;
}
