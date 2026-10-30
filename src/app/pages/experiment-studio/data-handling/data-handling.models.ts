import { EChartsOption } from 'echarts';
import { VariableStats } from '../../../models/algorithm-results.model';
import { BackendFilter, BackendRule } from '../../../models/filters.model';
import { HistogramGroupSeries } from '../visualisations/histogram/histogram-data';

/** Shared types of the Data Handling pipeline and its subcomponents. */

export type TabKey = 'Statistics' | 'Charts' | 'Histogram';
export type SummaryKind = 'source' | 'raw' | 'processed';
export type SectionKey = 'source' | 'raw' | 'setup' | 'filters' | 'processed' | 'transformation';
export type PipelineStep = 'source' | 'filters' | 'setup' | 'transformation';
export type PrepStep = 'missing' | 'outlier' | 'longitudinal';
export type DistributionSubTab = 'Numeric' | 'Nominal';
export type StatisticVariableType = 'numeric' | 'nominal';
export type PreprocessingStatus = 'none' | 'pending' | 'applied';
export type PrepKind = 'missing' | 'outlier' | 'longitudinal';

export type SummaryAnchorKey = 'charts' | 'details' | 'export';

/**
 * Where each summary surface wears a `data-guide` anchor. They are not uniform: the Raw
 * surface owns the overlay-tab and export anchors, the Processed surface only its details
 * panel, and step 0 is a read-only duplicate of the Raw surface, so it wears none — the
 * same anchor on a hidden node would hand the tour or a QA selector the wrong surface.
 */
export const SUMMARY_GUIDE_ANCHORS: Record<SummaryKind, Record<SummaryAnchorKey, string | null>> = {
  source: { charts: null, details: null, export: null },
  raw: { charts: 'analysis-charts', details: 'analysis-raw-details', export: 'analysis-export' },
  processed: { charts: null, details: 'analysis-processed-details', export: null },
};

export type MissingAction = 'no_action' | 'drop' | 'mean' | 'median' | 'constant';
export type LongitudinalStrategy = 'first' | 'second' | 'diff';

/**
 * The record-level rule behind one category. exaflow takes either a group of rules or a
 * single condition, and saved experiments hold both shapes - so the draft keeps whichever
 * it was given instead of pretending a bare condition cannot exist.
 */
export type CategoryFilter = BackendFilter | BackendRule;

export interface TransformationRule {
  value: string;
  filter: CategoryFilter | null;
}

/** One "Create new categorical column" card. The stage holds an ordered list. */
export interface TransformationColumnDraft {
  /** Matches the store step id, so the drafts and the ordered cards stay aligned. */
  id: string;
  code: string;
  defaultEnumeration: string;
  rules: TransformationRule[];
  open: boolean;
  /** Rule index whose filter editor is expanded; at most one open per card. */
  openRuleIndex?: number | null;
  /** Picked from the type chooser (or restored from the store). */
  chosen?: boolean;
}

/** One sub-step of a pipeline stage, rendered on the pipeline-overview rail. */
export interface PipelineSubNode {
  // Preprocessing stations use fixed ids; transformation sub-nodes carry a
  // `transformation:<code>` id so the rail can list one card per derived column.
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: 'applied' | 'default' | 'pending';
  /** Optional consequence line (e.g. rows the default drop-NaN would remove). */
  impact?: string;
}

export type MetricKey =
  | 'num_dtps' | 'num_na' | 'num_total'
  | 'mean' | 'std' | 'min' | 'q1' | 'q2' | 'q3' | 'max';

export interface SummaryView {
  activeTab: TabKey;
  data: PivotBlock[];
  /** The describe payload's featurewise rows behind `data` (one per variable x dataset). */
  featurewiseRows: VariableStats[];
  isLoading: boolean;
  showDistributions: boolean;
  distributionSubTab: DistributionSubTab;
  nonNominalVariables: VariableRow[];
  nominalVariables: VariableRow[];
  chartsForBoxPlot: EChartsOption[][];
  chartsForNominal: EChartsOption[][];
  histogramDataByVariable: Record<string, HistogramPreviewData>;
  histogramLoadingByVariable: Record<string, boolean>;
  histogramErrorByVariable: Record<string, string>;
  /** Cache keys whose request has answered (data or error); not repeated until the surface is rebuilt. */
  histogramSettledByVariable: Record<string, boolean>;
  histogramRequestIdByVariable: Record<string, number>;
  histogramSplitByVariable: Record<string, string>;
  activeBoxPlotIndex: number;
  activeNominalIndex: number;
  selectedStatisticKey: string | null;
}

export interface PivotBlock {
  code?: string;
  name: string;
  columns: string[];
  rows: Array<{ metric: string; values: Record<string, string> }>;
}

export interface VariableRow {
  code: string;
  name?: string;
  label?: string;
  type?: string;
  enumerations?: Array<{ code?: string; label?: string; name?: string }>;
}

export interface EnumOption {
  code: string;
  label: string;
}

export interface HistogramPreviewData {
  bins: string[];
  counts: Array<number | null>;
  variableName: string;
  variableType?: string;
  groups?: HistogramGroupSeries[];
  splitLabel?: string;
}

export interface PreprocessingRule {
  variableCode: string;
  action: MissingAction;
  value: string;
  enabled: boolean;
}

export interface PreprocessingGroup {
  key: 'pending' | 'applied' | 'default' | 'not-applied';
  title: string;
  variables: VariableRow[];
}

export interface OutlierPreviewRow {
  variable: string;
  dataset: string;
  strategy: string;
  tail: string;
  fold: string;
  lowerBound: string;
  upperBound: string;
  lowerOutliers: string;
  upperOutliers: string;
  totalOutliers: string;
  outlierPercentage: string;
}

export interface DescriptiveProgressState {
  pendingChangeCount: number;
  preprocessingStatus: PreprocessingStatus;
  transformationStatusLabel: string;
}
/** Copy of one "How to use" strip: numbered steps plus a closing note. */
export interface HowToGuide {
  steps: string[];
  note: string;
}
