// Interface for a Variable in the data model
export interface Variable {
  label: string;
  code?: string;
  description?: string;
  enumerations?: EnumValue[];
  type?: string;
  methodology?: string;
  units?: string;
  minValue?: number;
  maxValue?: number;
}

/**
 * A level of a categorical CDE. Non-continuous CDEs carry integer codes (binary: 0 and 1),
 * held as the string of the integer (`"1"`); `label` is the readable level shown to users.
 * See core/enumeration-codes.utils.ts.
 */
interface EnumValue {
  label: string;
  code: string;
}

// Interface for a Group in the data model
export interface Group {
  label: string;
  code?: string;
  variables?: Variable[];
  groups?: Group[];
}

// Interface for the overall DataModel
export interface DataModel {
  uuid: string;
  label: string;
  code?: string;
  version?: string;  // Root level only
  longitudinal?: boolean;  // Root level only
  variables?: Variable[];
  groups?: Group[];
  released:boolean;
  datasets?: string[];
  /** Dataset code → codes of the variables present in that dataset (GET /services/data-models). */
  datasetsVariables?: Record<string, string[]>;
}

// D3 hierarchy format interface
export interface D3HierarchyNode {
  // name: string;
  label: string;
  value?: number;  // Optional, as this may only be used for leaf nodes
  code?: string;
  description?: string;
  enumerations?: any[];
  type?: string;
  methodology?: string;
  units?: string;
  minValue?: number;
  maxValue?: number;
  children?: D3HierarchyNode[];  // Recursive children
}
