import { D3HierarchyNode } from '../../../../models/data-model.interface';

export type MetadataBrowserMode = 'ontology' | 'collapsible' | 'bubble';

export interface NormalizedEnumeration {
  code: string;
  label: string;
}

export interface NormalizedGroupNode {
  kind: 'group';
  id: string;
  label: string;
  code: string;
  parentId: string | null;
  childGroupIds: string[];
  variableIds: string[];
  pathGroupIds: string[];
  pathLabels: string[];
  depth: number;
  directGroupCount: number;
  directVariableCount: number;
  totalVariableCount: number;
  original: D3HierarchyNode;
}

export interface NormalizedVariableNode {
  kind: 'variable';
  id: string;
  label: string;
  code: string;
  description: string;
  sqlType: string;
  type: string;
  isCategorical: boolean;
  units: string;
  minValue: string;
  maxValue: string;
  enumerations: NormalizedEnumeration[];
  parentGroupId: string;
  pathGroupIds: string[];
  pathLabels: string[];
  original: D3HierarchyNode;
}

export interface NormalizedMetadataIndex {
  rootId: string;
  groupsById: Record<string, NormalizedGroupNode>;
  variablesById: Record<string, NormalizedVariableNode>;
  groupIds: string[];
  variableIds: string[];
}

export interface MetadataSearchResult {
  kind: 'group' | 'variable';
  id: string;
  label: string;
  path: string;
  pathLabels: string[];
  matchText: string;
  parentGroupId: string | null;
}

export interface MetadataSelection {
  groupId: string;
  variableId: string | null;
  originalNode: D3HierarchyNode;
}
