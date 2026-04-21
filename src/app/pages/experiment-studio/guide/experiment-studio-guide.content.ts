export type GuideSection = 'Explore' | 'Analysis' | 'Experiment' | 'Results';

export interface ExperimentStudioGuideStep {
  id: string;
  section: GuideSection;
  title: string;
  body: string;
  compactTitle?: boolean;
  selector?: string;
  allowTargetInteraction?: boolean;
  advanceOnTargetClick?: boolean;
  requirement?:
  | 'selected-sex'
  | 'covariate-sex'
  | 'selected-age'
  | 'variable-age'
  | 'algorithm-selected'
  | 'experiment-result-ready'
  | 'save-as-opened'
  | 'experiment-saved-as';
  optional?: boolean;
}

export const EXPERIMENT_STUDIO_GUIDE_LABELS = {
  launcher: 'User Guide',
  exit: 'Exit',
  collapse: 'Collapse',
  expand: 'Expand',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  moveToDashboard: 'Move to dashboard',
} as const;

export const EXPERIMENT_STUDIO_GUIDE_STEPS: ExperimentStudioGuideStep[] = [
  {
    id: 'welcome',
    section: 'Explore',
    title: 'Welcome to the Medical Informatics Platform',
    body: 'This guide will help you understand how to use the MIP.',
  },
  {
    id: 'launcher',
    section: 'Explore',
    title: 'Guide Launcher',
    body: 'Use this button to reopen the guide at any time on the current page.',
    selector: '[data-guide="launcher"]',
  },
  {
    id: 'header-account',
    section: 'Explore',
    title: 'Account and Information',
    body: 'Open your account page to review user information and session-related details.',
    selector: '[data-guide="header-account"]',
  },
  {
    id: 'navigation',
    section: 'Explore',
    title: 'Navigation',
    body: 'Use the left rail to move between datasets and variables, descriptive statistics, and the algorithm area. The link back to the dashboard is also here.',
    selector: '[data-guide="studio-navigation"]',
  },
  {
    id: 'pathology',
    section: 'Explore',
    title: 'Pathology',
    body: 'Choose the pathology you want to work with. The available variables and datasets update from this selection.',
    selector: '[data-guide="data-model-selector"]',
  },
  {
    id: 'datasets',
    section: 'Explore',
    title: 'Datasets',
    body: 'Pick the datasets or cohorts that should be included in the current analysis.',
    selector: '[data-guide="dataset-selector"]',
  },
  {
    id: 'search-variables',
    section: 'Explore',
    title: 'Search Variables',
    body: 'Search for variables or groups, then narrow the results by Variables or Groups and by variable type.',
    selector: '[data-guide="search-bar"]',
  },
  {
    id: 'variable-selection',
    section: 'Explore',
    title: 'Variables Selection',
    body: 'The bubble chart is your variable browser. Click a bubble to inspect it, and double-click groups to navigate deeper into the hierarchy.',
    selector: '[data-guide="variable-selection"]',
  },
  {
    id: 'variable-details',
    section: 'Explore',
    title: 'Variable Details',
    body: 'This panel shows the selected variable histogram or the selected group information. Export actions appear at the top right corner when histogram data is available.',
    selector: '[data-guide="variable-details"]',
  },
  {
    id: 'variable-containers',
    section: 'Explore',
    title: 'Compose Your Experiment',
    body: 'Use this panel to place the selected item into Variables, Covariates, or Filters. You can also review and remove the selections already included in the experiment.',
    selector: '[data-guide="variable-containers"]',
  },
  {
    id: 'select-sex-variable',
    section: 'Explore',
    title: 'Select the <span class="guide-copy-green">green</span>-highlighted {{GUIDE_COVARIATE}} variable.',
    body: '',
    compactTitle: true,
    selector: '[data-guide="variable-browser"]',
    allowTargetInteraction: true,
    requirement: 'selected-sex',
  },
  {
    id: 'add-sex-covariate',
    section: 'Explore',
    title: 'Add {{GUIDE_COVARIATE}} as Covariate',
    body: '',
    selector: '[data-guide="guide-add-covariate"]',
    allowTargetInteraction: true,
    requirement: 'covariate-sex',
  },
  {
    id: 'select-age-variable',
    section: 'Explore',
    title: 'Select the <span class="guide-copy-green">green</span>-highlighted {{GUIDE_VARIABLE}} variable.',
    body: '',
    compactTitle: true,
    selector: '[data-guide="variable-browser"]',
    allowTargetInteraction: true,
    requirement: 'selected-age',
  },
  {
    id: 'add-age-variable',
    section: 'Explore',
    title: 'Add {{GUIDE_VARIABLE}} as Variable',
    body: '',
    selector: '[data-guide="guide-add-variable"]',
    allowTargetInteraction: true,
    requirement: 'variable-age',
  },
  {
    id: 'analysis-intro',
    section: 'Analysis',
    title: 'Analysis Section',
    body: 'Review descriptive statistics for the selected variables. You can switch tabs, expand sections, inspect charts, and continue when you are ready.',
    selector: '[data-guide="analysis-section"]',
    allowTargetInteraction: true,
  },
  {
    id: 'analysis-export',
    section: 'Analysis',
    title: 'Export Results',
    body: 'Export the descriptive statistics currently shown in this panel as a PDF.',
    selector: '[data-guide="analysis-export"]',
    optional: true,
  },
  {
    id: 'experiment-intro',
    section: 'Experiment',
    title: 'Experiment Section',
    body: 'This is where you choose an algorithm, configure any parameters, and run the analysis.',
    selector: '[data-guide="experiment-workspace"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-select-algorithm',
    section: 'Experiment',
    title: 'Algorithm Selection',
    body: 'Pick any available algorithm from the experiment panel. Green ticks mark algorithms that can run with your current variable and covariate setup.',
    selector: '[data-guide="experiment-workspace"]',
    allowTargetInteraction: true,
    requirement: 'algorithm-selected',
  },
  {
    id: 'experiment-run',
    section: 'Experiment',
    title: 'Run Experiment',
    body: 'Review the selected algorithm configuration. If extra parameters are shown, set them first, then run the experiment.',
    selector: '[data-guide="algorithm-settings"]',
    allowTargetInteraction: true,
    requirement: 'experiment-result-ready',
  },
  {
    id: 'experiment-explore-result',
    section: 'Experiment',
    title: 'Explore the Algorithm Result',
    body: 'Take a moment to inspect the result you just generated. When you are ready to save this experiment, press Next.',
    selector: '[data-guide="experiment-result"]',
    allowTargetInteraction: true,
  },
  {
    id: 'experiment-edit-parameters',
    section: 'Experiment',
    title: 'Edit Parameters',
    body: 'Use this button to return to the parameter view if you want to adjust the setup before saving or rerunning the experiment.',
    selector: '[data-guide="edit-parameters-action"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-summary-action',
    section: 'Experiment',
    title: 'Experiment Summary',
    body: 'This info button opens a quick summary of the datasets, variables, covariates, filters, and algorithm configuration behind the current result.',
    selector: '[data-guide="experiment-summary"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-save-as-action',
    section: 'Experiment',
    title: 'Save As',
    body: 'Use Save As when you want to keep this result as a named experiment. This opens the save form.',
    selector: '[data-guide="save-as-action"]',
    allowTargetInteraction: true,
    advanceOnTargetClick: true,
    requirement: 'save-as-opened',
  },
  {
    id: 'experiment-wait-for-save',
    section: 'Experiment',
    title: 'Save Experiment',
    body: 'Enter a name and click Save. The guide continues automatically once the experiment has been saved.',
    selector: '[data-guide="save-as-flow"]',
    allowTargetInteraction: true,
    requirement: 'experiment-saved-as',
  },
  {
    id: 'experiment-finish',
    section: 'Experiment',
    title: 'Experiment Studio Guide Done',
    body: 'You have finished the experiment setup part of the guide. Next, the tour moves to the experiment dashboard.',
    allowTargetInteraction: true,
  }
];
