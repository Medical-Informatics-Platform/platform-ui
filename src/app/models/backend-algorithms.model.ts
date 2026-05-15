export interface RawAlgorithmDefinition {
  name: string;
  label: string;
  desc: string;
  documentation?: string;
  type?: string;
  flags?: string[];
  enabled: boolean;
  inputdata: RawInputData;
  parameters: Record<string, RawParameter> | null;
  preprocessing?: RawPreprocessingStep[];
}

export interface RawInputData {
  y?: RawIOField;
  x?: RawIOField;
  data_model: RawIOField;
  datasets: RawIOField;
  filter?: RawIOField;
  validation_datasets?: RawIOField;
}

export interface RawIOField {
  label: string;
  desc: string;
  types: string[];
  stattypes?: string[];
  required?: boolean | string;
  min_count?: number | string;
  max_count?: number | string;
}

export interface RawParameter {
  label: string;
  desc: string;
  types: string[];
  stattypes?: number;
  required?: boolean | string;
  multiple?: boolean | string;
  default_value?: string | number | boolean;
  min?: string | number;
  max?: string | number;
  default?: string | number | boolean;
  enums?: RawEnumsDefinition;
  dict_keys_enums?: RawEnumsDefinition;
  dict_values_enums?: RawEnumsDefinition;
  dict_values_type?: 'real' | 'int' | 'text' | 'boolean';
}

export interface RawEnumsDefinition {
  type: 'list' | 'input_var_names' | 'input_var_CDE_enums' | 'fixed_var_CDE_enums';
  source: string[] | string;
}

export interface RawPreprocessingStep {
  name: string;
  label: string;
  desc: string;
  documentation?: string;
  order?: number;
  parameters: Record<string, RawParameter | RawDictParameter>;
}

export interface RawDictParameter extends RawParameter {
  dict_keys_enums?: RawEnumsDefinition;
  dict_values_enums?: RawEnumsDefinition;
}
