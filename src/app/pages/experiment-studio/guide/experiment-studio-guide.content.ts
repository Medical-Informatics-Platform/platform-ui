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
    title: 'Account menu',
    body: 'Open the account control to reach <strong>Account settings</strong> or <strong>Sign Out</strong>. Primary navigation for <strong>My experiments</strong> and <strong>Studio</strong> lives in the header to the left.',
    selector: '[data-guide="header-account"]',
  },
  {
    id: 'navigation',
    section: 'Explore',
    title: 'Studio step bar',
    body: 'Use the step bar to move between <strong>Data Exploration</strong>, <strong>Data Handling</strong>, <strong>Algorithm Selection</strong>, and <strong>Experiment Execution</strong>. The CTA on the right starts as <strong>Continue</strong>, becomes <strong>Continue with N variables</strong> after you add variables, <strong>Continue to Algorithm Selection</strong> on Data Handling, and <strong>Run experiment</strong> on Algorithm Selection. Switch to the list anytime with <strong>My experiments</strong> in the header — not from this step bar.',
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
    body: 'Select an item in the Map or List view, then click <strong>Add</strong> (or double-click the item). The numeric chip next to Add opens your current selection so you can review, remove, or clear variables.',
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
    body: 'Data Handling is one pipeline of three stations: <strong>Add Filtering</strong>, <strong>Preprocessing</strong>, and <strong>Add Transformation</strong>. A card already in the run is solid and tagged <strong>Default</strong> or <strong>Applied</strong>; a dashed card contributes nothing yet, and the dashed <strong>+</strong> rows on a collapsed card add a step — outlier clipping, another derived column — without opening the station. <strong>Raw data</strong> sits above them as a read-only snapshot: <strong>Preview source data</strong> shows the same variables exactly as stored, with no filter and no preprocessing, so you can see what each stage changed. Use <strong>Preview data</strong> inside a station to inspect tables and charts. <strong>Apply</strong> saves your edits and closes the editor — it never moves you on to the next one; with nothing pending the button reads <strong>Close</strong> and leaves the station as it was. Reopen a station with <strong>Edit filters</strong>, <strong>Edit preprocessing</strong>, or <strong>Edit transformation</strong>. When you are ready, use <strong>Continue to Algorithm Selection</strong> — you can skip stations and keep the raw cohort.',
    selector: '[data-guide="analysis-section"]',
    allowTargetInteraction: false,
  },
  {
    id: 'analysis-filtering',
    section: 'Analysis',
    title: '1. Filtering',
    body: 'Optional: open <strong>Add Filtering</strong> to add filter rules. With no rules, <strong>Preview data</strong> still shows the raw cohort. Use <strong>Apply</strong> when you have conditions to commit — it saves and leaves you on the Raw Summary, where <strong>Edit filters</strong> opens the station again. With none, the button reads <strong>Close</strong> and drops the empty step.',
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
    body: 'Rows with missing values are dropped by default, so this card is already in the run and tagged <strong>Default</strong>, not <strong>Applied</strong>. Click the <strong>Missing Values Handler</strong> row — or <strong>Customize Preprocessing</strong> — to change imputation, or the dashed <strong>Add outlier clipping</strong> row to cap extreme values. Use <strong>Preview data</strong> to inspect processed tables without applying changes; <strong>Apply</strong> only when you edit the rules — it saves and closes the station on its applied steps instead of moving you on, and <strong>Preview data</strong> shows the processed summary. With nothing pending the button reads <strong>Close</strong>.',
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
    id: 'analysis-transformation',
    section: 'Analysis',
    title: '5. Transformation',
    body: 'Optional: open <strong>Add Transformation</strong> to create derived columns. Once one exists, the dashed <strong>Add derived column</strong> row on the collapsed card starts another. Use <strong>Preview data</strong> for counts where available, then <strong>Edit transformation</strong> to reopen. When Data Handling is done, choose <strong>Continue to Algorithm Selection</strong>.',
    selector: '[data-guide="analysis-transformation"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-intro',
    section: 'Experiment',
    title: 'Experiment workspace',
    body: 'This step is for assigning outcome and predictors, choosing an algorithm, configuring parameters, then running from the step-bar CTA on the right (<strong>Run experiment</strong>).',
    selector: '[data-guide="experiment-workspace"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-role-assignment',
    section: 'Experiment',
    title: 'Assign outcome &amp; predictors',
    body: 'In the <strong>Experiment pool</strong>, set each variable as <strong>Outcome y</strong> or <strong>Predictor x</strong> (usually one outcome). Assigned variables move into the rails above — drag a chip between rails to move it, or use × to return it to the list. Matching algorithms update as you assign. A created transformation column can also be assigned here.',
    selector: '[data-guide="guide-role-assignment"]',
    allowTargetInteraction: true,
    requirement: 'roles-assigned',
  },
  {
    id: 'experiment-select-algorithm',
    section: 'Experiment',
    title: 'Algorithm Selection',
    body: 'The catalog on the left lists runnable methods per group by default — switch the chip to All to see unavailable ones and their reasons. Click a method to open its documentation and parameters in <strong>Algorithm configuration</strong> beside the catalog.',
    selector: '[data-guide="algorithm-selection"]',
    allowTargetInteraction: true,
    requirement: 'algorithm-selected',
  },
  {
    id: 'experiment-run',
    section: 'Experiment',
    title: 'Run experiment',
    body: 'Review documentation and optional parameters in Algorithm configuration, then press <strong>Run experiment</strong> on the right of the step bar. The guide waits until Experiment Execution shows a result.',
    selector: '[data-guide="run-experiment"]',
    allowTargetInteraction: true,
    requirement: 'experiment-result-ready',
  },
  {
    id: 'experiment-explore-result',
    section: 'Results',
    title: 'Explore the result',
    body: 'Experiment Execution shows the result title, charts/tables, and a toolbar with <strong>Edit parameters</strong>, <strong>Save as</strong>, and <strong>Export PDF</strong>. Inspect the output here, then press Next when you are ready to continue.',
    selector: '[data-guide="experiment-result"]',
    allowTargetInteraction: true,
  },
  {
    id: 'experiment-edit-parameters',
    section: 'Results',
    title: 'Edit parameters',
    body: 'Use <strong>Edit parameters</strong> to go back to Algorithm Selection and adjust the setup before saving or running again.',
    selector: '[data-guide="edit-parameters-action"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-result-actions',
    section: 'Results',
    title: 'Result actions',
    body: 'The result toolbar keeps the main follow-ups together: <strong>Edit parameters</strong>, <strong>Save as</strong>, and <strong>Export PDF</strong>.',
    selector: '[data-guide="save-as-flow"]',
    allowTargetInteraction: true,
  },
  {
    id: 'experiment-save-as-action',
    section: 'Results',
    title: 'Save as',
    body: 'Use <strong>Save as</strong> to keep this result as a named experiment. That opens the inline save form in the result toolbar.',
    selector: '[data-guide="save-as-action"]',
    allowTargetInteraction: true,
    advanceOnTargetClick: true,
    requirement: 'save-as-opened',
  },
  {
    id: 'experiment-wait-for-save',
    section: 'Results',
    title: 'Save experiment',
    body: 'Enter an <strong>Experiment name</strong>, then click <strong>Save experiment</strong>. The guide continues automatically after a successful save (you can Cancel to stay on the result).',
    selector: '[data-guide="save-as-form"]',
    allowTargetInteraction: true,
    requirement: 'experiment-saved-as',
  },
  {
    id: 'experiment-finish',
    section: 'Results',
    title: 'Studio guide done',
    body: 'You finished the Studio path through Experiment Execution. Next, the tour moves to <strong>My experiments</strong> on the dashboard.',
    allowTargetInteraction: true,
  }
];
