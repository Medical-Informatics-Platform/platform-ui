import {
  ANALYSIS_STUDIO_GUIDE_LABELS,
  GuideSection,
} from '../../analysis-studio/guide/analysis-studio-guide.content';

export { ANALYSIS_STUDIO_GUIDE_LABELS };

type AnalysesDashboardGuidePlacement = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface AnalysesDashboardGuideStep {
  id: string;
  section: GuideSection;
  title: string;
  body: string;
  selector?: string;
  placement?: AnalysesDashboardGuidePlacement;
  allowTargetInteraction?: boolean;
  advanceOnTargetClick?: boolean;
  requirementHint?: string;
  maskBackground?: string;
  /** When true, skipped only if selector is missing/zero-size. Never put Complete behind optional steps. */
  optional?: boolean;
}

/**
 * Order matters: open → workbench → actions → results, then optional compare,
 * then Guide Complete LAST. compare-workspace must not outrank Complete.
 */
export const ANALYSES_DASHBOARD_GUIDE_STEPS: AnalysesDashboardGuideStep[] = [
  {
    id: 'dashboard-overview',
    section: 'Explore',
    title: 'My analyses',
    body: 'This is your analyses home (<strong>My analyses</strong> in the header). From here you can create a new analysis, reopen an existing one, see analyses shared with you, or compare multiple runs. Open Studio anytime from the header <strong>Studio</strong> link.',
    maskBackground: 'transparent',
  },
  {
    id: 'workspace',
    section: 'Explore',
    title: 'Analysis list',
    body: 'The left pane is your analysis history. Select a run to inspect it in the workbench on the right, or use <strong>New</strong> to start from scratch in Studio.',
    selector: '[data-guide="dashboard-workspace"]',
    placement: 'right',
  },
  {
    id: 'search',
    section: 'Explore',
    title: 'Search and Date Filter',
    body: 'Use the search input and date filter to narrow the analysis list.',
    selector: '[data-guide="dashboard-search"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'tabs',
    section: 'Explore',
    title: 'My Analyses and Shared',
    body: 'Switch between analyses you own and analyses shared with you. Shared stays empty until someone shares a run with you.',
    selector: '[data-guide="dashboard-tabs"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'new-analysis',
    section: 'Analysis',
    title: 'New analysis',
    body: 'Use <strong>New</strong> to open Analysis Studio and create an analysis from scratch. You can also jump there with the header <strong>Studio</strong> link.',
    selector: '[data-guide="dashboard-new"]',
    placement: 'bottom',
  },
  {
    id: 'tutorial-analysis',
    section: 'Results',
    title: 'Open an Analysis',
    body: 'Click an analysis in the list to load it into the workbench. If the highlighted tutorial example is available, use that one to continue the flow.',
    selector: '[data-guide="dashboard-analysis-card"]',
    placement: 'right',
    allowTargetInteraction: true,
    advanceOnTargetClick: true,
    requirementHint: 'Click the highlighted analysis row to open it in the workbench and continue.',
    optional: true,
  },
  {
    id: 'workbench',
    section: 'Explore',
    title: 'Analysis Workbench',
    body: 'After you select an analysis, this workbench shows its details, configuration, and stored results.',
    selector: '[data-guide="dashboard-detail-card"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
  {
    id: 'actions',
    section: 'Results',
    title: 'Analysis Actions',
    body: 'From here you can open the run in Studio or use the toolbar actions on this analysis (export, copy link, share, or delete when available).',
    selector: '[data-guide="dashboard-detail-actions"]',
    placement: 'left',
    optional: true,
  },
  {
    id: 'results',
    section: 'Results',
    title: 'Results Review',
    body: 'This section displays the stored result for the selected analysis.',
    selector: '[data-guide="dashboard-results"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
  {
    id: 'compare',
    section: 'Explore',
    title: 'Compare Mode',
    body: 'Optional: tick the checkbox on two or three runs. <strong>Compare</strong> appears under the list. You can skip this and finish the guide.',
    selector: '[data-guide="dashboard-compare"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'compare-workspace',
    section: 'Results',
    title: 'Comparison Workspace',
    body: 'Press <strong>Compare</strong> to put the ticked runs side by side. Or press <strong>Skip</strong> to finish without comparing.',
    selector: '[data-guide="dashboard-compare-workspace"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
  {
    id: 'dashboard-guide-complete',
    section: 'Results',
    title: 'Guide Complete',
    body: 'You successfully completed the dashboard guide.',
  },
];
