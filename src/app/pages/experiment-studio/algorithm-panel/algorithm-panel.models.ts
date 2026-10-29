import { AlgorithmConfig } from '../../../models/algorithm-definition.model';

/** Studio sub-steps of the Algorithm view: setup (roles + methods), then parameters (configure + run). */
export type AlgorithmStudioSubstep = 'setup' | 'parameters';

type AlgorithmRunRequirementKind = 'availability' | 'preprocessing';

/** Something that blocks the run, with the action that fixes it. */
export interface AlgorithmRunRequirement {
  id: AlgorithmRunRequirementKind;
  message: string;
  actionLabel: string;
}

/** One line of the "Requirements before running" list. */
export interface AlgorithmNeedItem {
  key: string;
  met: boolean;
  title: string;
  messages: string[];
  action?: AlgorithmRunRequirement;
}

/** A catalog group as the panel lists it. */
export interface AlgorithmCategory {
  name: string;
  algorithms: AlgorithmConfig[];
}

/** An enumeration entry or a select option, as the backend and the data model send them. */
export type ParameterOption =
  | string
  | number
  | boolean
  | { code?: unknown; value?: unknown; name?: unknown; label?: unknown };

/**
 * A studio variable as the panel reads it: entries of `algorithmY`, `algorithmX`,
 * `algorithmAssignableVariables` and `selectedFilters`.
 */
export interface StudioVariable {
  code?: string;
  label?: string;
  name?: string;
  type?: string;
  enumerations?: ParameterOption[];
}

/** One algorithm parameter of `AlgorithmConfig.configSchema` (see `buildConfigSchema` in core/algorithm-mappers). */
export interface AlgorithmParameterField {
  key: string;
  label?: string;
  desc?: string;
  description?: string;
  type?: string;
  types?: string[];
  required?: boolean | string;
  default?: unknown;
  options?: ParameterOption[];
  enumType?: string;
  enumSource?: string[];
  min?: number;
  max?: number;
  advanced?: boolean;
}

/** A parameter after enrichment: options resolved from the selected variables, label and desc filled in. */
export interface EnrichedParameterField extends AlgorithmParameterField {
  label: string;
  desc: string;
  required?: boolean;
}

/** A `{ code, label }` choice offered by a select built from variables or enumerations. */
export interface CodeLabelOption {
  code: string;
  label: string;
}
