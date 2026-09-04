export type GuideSection = 'Explore' | 'Analysis' | 'Experiment' | 'Results';

export interface ExperimentStudioGuideStep {
  id: string;
  section: GuideSection;
  title: string;
  body: string;
  compactTitle?: boolean;
  selector?: string;
  interactionSelectors?: string[];
  allowTargetInteraction?: boolean;
  advanceOnTargetClick?: boolean;
  requirement?:
  | 'selected-sex'
  | 'variable-sex'
  | 'selected-age'
  | 'variable-age'
  | 'roles-assigned'
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
    title: 'Experiment Studio User Guide',
    body: 'This guide walks you through Experiment Studio step by step. During interactive steps, you can only interact with the highlighted <strong>blue panel</strong> on the page—the rest of the interface stays dimmed until you press Next.',
  },
  {
    id: 'launcher',
    section: 'Explore',
    title: 'Guide Launcher',
    body: 'Use this button to reopen the guide at any time on the current page. While the guide is active, interaction is limited to the highlighted blue panel; use Back and Next here to move between steps.',
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
    body: 'Use the step bar across the top to move between Data Exploration, Data Handling, Algorithm Selection, and Experiment Execution. The link back to the dashboard is also here. Once you add at least one variable, continue from the footer at the bottom of the current view — data review is optional, so you can skip straight to the algorithm if you prefer.',
    selector: '[data-guide="studio-navigation"]',
  },
  {
    id: 'study-context',
    section: 'Explore',
    title: 'Pathology & Datasets',
    body: 'Choose the pathology you want to work with, then pick the datasets or cohorts to include in the current analysis. Click the chip to open both selectors — the available variables update from this selection.',
    selector: '[data-guide="study-context"]',
    allowTargetInteraction: true,
    interactionSelectors: [
      '[data-guide="data-model-selector"]',
      '[data-guide="dataset-selector"]',
    ],
  },
  {
    id: 'search-variables',
    section: 'Explore',
    title: 'Search Variables',
    body: 'Click the search icon to open the search bar, then search for variables or groups and narrow the results by Variables or Groups and by variable type.',
    selector: '[data-guide="search-bar"]',
    allowTargetInteraction: true,
  },
  {
    id: 'variable-selection',
    section: 'Explore',
    title: 'Explore Variable Views',
    body: 'Preview the metadata browser in three modes — <strong>Map</strong> (bubble overview), <strong>List</strong> (expandable hierarchy), and <strong>Graph</strong> (collapsible diagram). Charts and details for the current selection appear in the panel on the right.',
    selector: '[data-guide="variable-selection"]',
    allowTargetInteraction: false,
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
    body: 'Select an item in the Map or List view, then click Add (or double-click the item). Open the count button in the details header to review, remove, or clear selected variables.',
    selector: '[data-guide="variable-containers"]',
  },
  {
    id: 'select-sex-variable',
    section: 'Explore',
    title: 'Select the <span class="guide-copy-green">green</span>-highlighted {{GUIDE_COVARIATE}} variable.',
    body: '',
    compactTitle: true,
    selector: '[data-guide="variable-selection"]',
    allowTargetInteraction: true,
    requirement: 'selected-sex',
  },
  {
    id: 'preview-sex-variable-details',
    section: 'Explore',
    title: 'Preview {{GUIDE_COVARIATE}} Details',
    body: 'Review the histogram and metadata for the selected variable. Switch between <strong>Chart</strong> and <strong>Details</strong>, and use export actions when available.',
    selector: '[data-guide="variable-details"]',
    allowTargetInteraction: true,
  },
  {
    id: 'add-sex-covariate',
    section: 'Explore',
    title: 'Add {{GUIDE_COVARIATE}} as Variable',
    body: '',
    selector: '[data-guide="guide-add-variable"]',
    allowTargetInteraction: true,
    requirement: 'variable-sex',
  },
  {
    id: 'select-age-variable',
    section: 'Explore',
    title: 'Select the <span class="guide-copy-green">green</span>-highlighted {{GUIDE_VARIABLE}} variable.',
    body: '',
    compactTitle: true,
    selector: '[data-guide="variable-selection"]',
    allowTargetInteraction: true,
    interactionSelectors: ['[data-guide="variable-details"]'],
    requirement: 'selected-age',
  },
  {
    id: 'preview-age-variable-details',
    section: 'Explore',
    title: 'Preview {{GUIDE_VARIABLE}} Details',
    body: 'Review the histogram and metadata for the selected variable. Switch between <strong>Chart</strong> and <strong>Details</strong>, and use export actions when available.',
    selector: '[data-guide="variable-details"]',
    allowTargetInteraction: true,
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
    title: 'Data Handling',
    body: 'This workflow has three stations on the left rail: Filtering, Preprocessing, and Transformation. Use <strong>Preview data</strong> in a station footer to inspect the applied tables and charts. <strong>Apply &amp; Continue</strong> is optional and only needed when you have pending edits. Return with <strong>Edit filters</strong>, <strong>Edit preprocessing</strong> or <strong>Edit transformation</strong>.',
    selector: '[data-guide="analysis-section"]',
    allowTargetInteraction: false,
  },
  {
    id: 'analysis-filtering',
    section: 'Analysis',
    title: '1. Filtering',
    body: 'Optional: add filter rules to narrow the cohort. With no rules, <strong>Preview data</strong> still shows the raw cohort. <strong>Apply &amp; Continue</strong> only when you have conditions to commit.',
    selector: '[data-guide="analysis-filtering"]',
    allowTargetInteraction: false,
  },
  {
    id: 'analysis-raw-statistics',
    section: 'Analysis',
    title: '2. Raw Data Summary',
    body: '<strong>Preview data</strong> shows the tables. Use <strong>Charts</strong> or <strong>Histogram</strong> for other views, then <strong>Edit filters</strong>. Export PDF or CSV when you need a snapshot.',
    selector: '[data-guide="analysis-raw-summary"]',
    allowTargetInteraction: true,
  },
  {
    id: 'analysis-preprocessing',
    section: 'Analysis',
    title: '3. Preprocessing',
    body: 'Default NA removal is already in effect. Use <strong>Preview data</strong> to inspect processed tables without clicking Apply. <strong>Apply &amp; Continue</strong> only when you change the rules.',
    selector: '[data-guide="analysis-preprocessing"]',
    allowTargetInteraction: false,
  },
  {
    id: 'analysis-processed-summary',
    section: 'Analysis',
    title: '4. Processed Data Summary',
    body: 'This is the processed view opened from Preprocessing <strong>Preview data</strong>. Default NA removal is already applied; use Apply only after you edit rules.',
    selector: '[data-guide="analysis-processed-summary"]',
    allowTargetInteraction: true,
  },
  {
    id: 'experiment-intro',
    section: 'Experiment',
    title: 'Experiment Section',
    body: 'This is where you assign outcomes and predictors, choose an algorithm, then configure parameters and run from the header.',
    selector: '[data-guide="experiment-workspace"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-role-assignment',
    section: 'Experiment',
    title: 'Assign Variables &amp; Covariates',
    body: 'On the algorithm panel, assign each pool variable as outcome (y) or predictor (x). Assigned variables move into the role slots and leave the list below — drag a chip between the slots to move it, or use × to return it. Matching methods update as you assign. The created transformation column can also be assigned here.',
    selector: '[data-guide="guide-role-assignment"]',
    allowTargetInteraction: true,
    requirement: 'roles-assigned',
  },
  {
    id: 'experiment-select-algorithm',
    section: 'Experiment',
    title: 'Algorithm Selection',
    body: 'The catalog lists runnable methods per group by default — switch the chip to All to see the unavailable ones and their reasons. Clicking a method opens its documentation and parameter fields together in Algorithm configuration, right under the catalog.',
    selector: '[data-guide="experiment-workspace"]',
    allowTargetInteraction: true,
    requirement: 'algorithm-selected',
  },
  {
    id: 'experiment-run',
    section: 'Experiment',
    title: 'Run Experiment',
    body: 'Review the documentation and optional parameters, then use Run Experiment on the right of this bar.',
    selector: '[data-guide="run-experiment"]',
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
    body: 'The summary panel on the right lists datasets, variables, covariates, filters, preprocessing, and algorithm settings used for this result.',
    selector: '[data-guide="experiment-summary-panel"]',
    allowTargetInteraction: true,
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
