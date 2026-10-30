import { D3HierarchyNode } from '../../../models/data-model.interface';
import { MetadataBrowserMode } from '../visualisations/metadata-browser/metadata-browser.model';

/** One step of the breadcrumb from the pathology root to a node. */
export interface PathNode {
  code: string;
  label: string;
}

/** A dataset the selected pathology offers, as the dataset selector lists it. */
export interface DatasetOption {
  code: string;
  label: string;
}

/** A node picked in a browser or the search; search picks carry their breadcrumb text. */
export type HighlightedNode = D3HierarchyNode & { path?: string };

/** The selected-node views of the details panel. */
export type DetailsPanelTab = 'histogram' | 'info';

/** What a selected group holds, shown in the details subtitle, the Details tab and the PDF export. */
export interface GroupHistogramMeta {
  pathNodes: PathNode[];
  groupCount: number;
  hasGroups: boolean;
}

/** The group census chart: one bar per child group, sized by its variable count. */
export interface GroupCensusData {
  bins: string[];
  counts: number[];
  variableName: string;
}

/** One button of the Map / List / Graph switcher. */
export interface MetadataBrowserModeOption {
  value: MetadataBrowserMode;
  label: string;
  /** Font Awesome classes. */
  icon: string;
  title: string;
}

/** An enumeration entry as data models and histogram responses carry it. */
export interface EnumerationLike {
  code?: unknown;
  label?: string;
  name?: string;
}
