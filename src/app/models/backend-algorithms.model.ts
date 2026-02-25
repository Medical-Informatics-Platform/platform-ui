export interface RawAlgorithmDefinition {
  name: string;
  label: string;
  desc: string;
  enabled: boolean;
  inputdata: RawInputData;
  parameters: Record<string, RawParameter>;
  preprocessing?: RawPreprocessingStep[];
}

export interface RawInputData {
  y?: RawIOField;
  x?: RawIOField;
  data_model: RawIOField;
  datasets: RawIOField;
  filter?: RawIOField;
}

export interface RawIOField {
  label: string;
  desc: string;
  types: string[];
  stattypes?: string[];
  notblank?: boolean | string;
  multiple?: boolean | string;
}

export interface RawParameter {
  label: string;
  desc: string;
  types: string[];
  stattypes?: number;
  required?: boolean | string;
  multiple?: boolean | string;
  default_value?: string | number;
  min?: string | number;
  max?: string | number;
  default?: string | number;
  enums?: RawEnumsDefinition;
}

export interface RawEnumsDefinition {
  type: 'list' | 'input_var_CDE_enums' | 'fixed_var_CDE_enums';
  source: string[] | string;
}

export interface RawPreprocessingStep {
  name: string;
  label: string;
  desc: string;
  parameters: Record<string, RawParameter | RawDictParameter>;
}

export interface RawDictParameter extends RawParameter {
  dict_keys_enums?: RawEnumsDefinition;
  dict_values_enums?: RawEnumsDefinition;
}
