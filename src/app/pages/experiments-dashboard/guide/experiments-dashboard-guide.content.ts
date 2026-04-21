import {
  EXPERIMENT_STUDIO_GUIDE_LABELS,
  GuideSection,
} from '../../experiment-studio/guide/experiment-studio-guide.content';

export { EXPERIMENT_STUDIO_GUIDE_LABELS };

export type ExperimentsDashboardGuidePlacement = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface ExperimentsDashboardGuideStep {
  id: string;
  section: GuideSection;
  title: string;
  body: string;
  selector?: string;
  placement?: ExperimentsDashboardGuidePlacement;
  allowTargetInteraction?: boolean;
  advanceOnTargetClick?: boolean;
  requirementHint?: string;
  maskBackground?: string;
  optional?: boolean;
}

export const EXPERIMENTS_DASHBOARD_GUIDE_STEPS: ExperimentsDashboardGuideStep[] = [
  {
    id: 'dashboard-overview',
    section: 'Explore',
    title: 'Experiments Dashboard',
    body: 'The dashboard is your entry point for saved work. From here you can create a new experiment, reopen an existing one, or compare multiple runs.',
    maskBackground: 'transparent',
  },
  {
    id: 'workspace',
    section: 'Explore',
    title: 'Experiment List',
    body: 'The left pane contains your experiment history. Select a run to inspect it in the workbench, or use New when you want to start from scratch.',
    selector: '[data-guide="dashboard-workspace"]',
    placement: 'right',
  },
  {
    id: 'search',
    section: 'Explore',
    title: 'Search and Date Filter',
    body: 'Use the search input and date filter to narrow the experiment list.',
    selector: '[data-guide="dashboard-search"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'tabs',
    section: 'Explore',
    title: 'My Experiments and Shared',
    body: 'Switch between experiments you own and experiments shared with you.',
    selector: '[data-guide="dashboard-tabs"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'compare',
    section: 'Explore',
    title: 'Compare Mode',
    body: 'Turn on compare mode to select multiple experiments from the list and inspect them side by side.',
    selector: '[data-guide="dashboard-compare"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'new-experiment',
    section: 'Experiment',
    title: 'New Experiment',
    body: 'Open Experiment Studio to create a new experiment from scratch.',
    selector: '[data-guide="dashboard-new"]',
    placement: 'bottom',
  },
  {
    id: 'tutorial-experiment',
    section: 'Results',
    title: 'Open an Experiment',
    body: 'Click an experiment in the list to load it into the workbench. If the highlighted tutorial example is available, use that one to continue the flow.',
    selector: '[data-guide="dashboard-experiment-card"]',
    placement: 'right',
    allowTargetInteraction: true,
    advanceOnTargetClick: true,
    requirementHint: 'Click the highlighted experiment row to open it in the workbench and continue.',
    optional: true,
  },
  {
    id: 'workbench',
    section: 'Explore',
    title: 'Experiment Workbench',
    body: 'The right-hand dashboard area shows either an empty-state prompt, the selected experiment details and configuration, or the comparison workspace.',
    selector: '[data-guide="dashboard-detail-card"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
  {
    id: 'actions',
    section: 'Results',
    title: 'Experiment Actions',
    body: 'Use these actions to reopen the experiment in Studio, export a PDF, copy a link, share it, or delete it.',
    selector: '[data-guide="dashboard-detail-actions"]',
    placement: 'left',
    optional: true,
  },
  {
    id: 'edit-in-studio',
    section: 'Experiment',
    title: 'Continue in Studio',
    body: 'Use Edit to reopen the selected experiment in Experiment Studio with its current setup.',
    selector: '[data-guide="dashboard-edit-studio"]',
    placement: 'left',
    optional: true,
  },
  {
    id: 'results',
    section: 'Results',
    title: 'Results Review',
    body: 'This section displays the stored result for the selected experiment.',
    selector: '[data-guide="dashboard-results"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
  {
    id: 'dashboard-guide-complete',
    section: 'Results',
    title: 'Guide Complete',
    body: 'You successfully completed the dashboard guide.',
    optional: true,
  },
  {
    id: 'compare-workspace',
    section: 'Results',
    title: 'Comparison Workspace',
    body: 'When compare mode is active, this area shows multiple selected experiments side by side. Pick at least two runs from the list to use it.',
    selector: '[data-guide="dashboard-compare-workspace"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
];
