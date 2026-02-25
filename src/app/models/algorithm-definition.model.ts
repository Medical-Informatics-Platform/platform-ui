import { RawInputData } from "./backend-algorithms.model";

export interface AlgorithmParameter {
  type: 'number' | 'string' | 'boolean' | 'select';
  label: string;
  default?: number | string | boolean;
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

export interface AlgorithmConfig {
  name: string;
  label: string;
  description: string;
  requiredVariable: string[];
  covariate: string[];
  category: string;
  configSchema: Array<any>;
  inputdata?: RawInputData;
  isDisabled: boolean;
}
