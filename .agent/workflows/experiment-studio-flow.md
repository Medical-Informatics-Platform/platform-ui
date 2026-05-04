---
description: How the Experiment Studio frontend flow works
---

# Experiment Studio Frontend Flow

This guide describes the current Experiment Studio user journey and the frontend pieces that coordinate dataset selection, descriptive review, preprocessing, and algorithm execution.

## 1. Core User Journey

1. **Select Pathology (Data Model)**: Choose the domain of study, for example Stroke.
2. **Select Datasets**: Enable the datasets that should participate in exploration and analysis.
3. **Explore Variables**: Use the zoomable bubble chart to browse the data hierarchy and inspect variable metadata.
4. **Select Parameters**:
   - **Variables (Y)**: Target variables for analysis.
   - **Covariates (X)**: Predictor or grouping variables.
   - **Filters**: Optional dataset subset rules based on variable values.
5. **Review Data & Configure Preprocessing**: Use the existing **Descriptive statistics** sidebar item. The internal panel is now **DATA REVIEW & PREPROCESSING** and contains:
   - **Raw Data Summary**: Before view, based on the selected raw dataset and variables.
   - **Preprocessing Setup**: Configure supported preprocessing rules. Currently only **Missing Values** is executable.
   - **Processed Data Summary**: After view, recalculated only after preprocessing is applied.
6. **Run Algorithms**: Select and configure a compatible algorithm. If preprocessing was applied, the Algorithm step receives the applied preprocessing configuration. Pending preprocessing changes do not affect algorithm requests.

## 2. Simple End-to-End Flow

This is the recommended smoke-test flow for the current setup:

1. Open **Experiment Studio**.
2. Keep or select the Stroke data model and the desired datasets.
3. Add **Age** as a **Variable**.
4. Add **Sex** as a **Covariate**.
5. Open **Descriptive statistics** in the left sidebar.
6. In **DATA REVIEW & PREPROCESSING**, review **Raw Data Summary**.
7. Open **Preprocessing Setup**.
8. In **Missing Values**, set **Age** to **Remove rows**.
9. Click **Apply Preprocessing**.
10. Confirm **Processed Data Summary** expands and shows recalculated statistics.
11. Open **Algorithm**.
12. Select **One-way ANOVA**.
13. Run the experiment.

Expected behavior:
- The raw summary uses the original selected data.
- The preprocessing table shows only supported preprocessing capabilities. At the moment, that is **Missing Values**.
- **Remove rows** maps to the Exaflow missing-values strategy `drop`.
- The processed summary is recalculated only after clicking **Apply Preprocessing**.
- The algorithm request uses the applied preprocessing configuration.

## 3. Technical Architecture

### Component Hierarchy
- `ExperimentStudioComponent`: Main orchestrator and route handler.
  - `VariablesPanelComponent`: Manages data/dataset selection and variable exploration.
    - `BubbleChartComponent`: D3-based visualization of the data model.
    - `VariableFilterSelectionComponent`: Manages selected variables, covariates, and filters.
    - `DistributionGraphComponent`: Renders histograms for selected nodes.
  - `StatisticAnalysisPanelComponent`: Owns the **DATA REVIEW & PREPROCESSING** UI inside the existing **Descriptive statistics** section.
  - `AlgorithmPanelComponent`: Manages algorithm selection, configuration, and execution.

### State Management
- **Service**: [`ExperimentStudioService`](../../src/app/services/experiment-studio.service.ts)
- **Signals**: Used extensively for reactive state (e.g., `selectedDataModel()`, `selectedVariables()`).
- **Communication**: Components inject the service to read/write state and to build descriptive-statistics and algorithm requests.
- **Applied preprocessing**: Stored in the experiment studio service only after the user clicks **Apply Preprocessing**.
- **Pending preprocessing**: Local to the statistic panel and never used by the Algorithm step.

### Important Logic
- **D3 Interaction**: Leaf node clicks in the bubble chart update the `selectedNode` in the parent panel, which then triggers a histogram fetch via the service.
- **Double-Click Shortcut**: Double-clicking a leaf node in the bubble chart automatically adds it to the **Variables** list.
- **Onboarding Hints**: Selection buttons (+Variables, etc.) pulse when a variable is selected but not yet added.
- **Algorithm Rules**: [`AlgorithmRulesService`](../../src/app/services/algorithm-rules.service.ts) contains the logic for enabling/disabling algorithms based on selected variable types and counts.
- **Auto-Expansion**: Algorithm categories automatically expand in the sidebar when compatible variables are selected and algorithms become available.
- **Requirement Key**: A legend at the bottom of the algorithm panel clarifies the meaning of requirement icons (Database = Variable, Sliders = Covariate).
- **Descriptive Statistics Request**: Raw summary calls the descriptive overview with `preprocessing: null`.
- **Processed Summary Request**: Processed summary calls the descriptive overview with explicit applied preprocessing.
- **Missing Values Preprocessing**:
  - `No action`: omitted from Exaflow `strategies`.
  - `Remove rows`: `drop`.
  - `Mean imputation`: `mean`, numeric only.
  - `Median imputation`: `median`, numeric only.
  - `Constant value`: `constant` plus `fill_values[var]`.
- **Unsupported Preprocessing Categories**: Outliers, numeric transformations, category handling, scaling, and encoding are not shown as active choices in the current UI because the current Exaflow preprocessing API does not execute them.

## 4. Data Review & Preprocessing Details

The sidebar navigation remains unchanged:

1. **Datasets & Variables**
2. **Descriptive statistics**
3. **Algorithm**

The old descriptive-statistics panel has been expanded internally, but it is still reached through **Descriptive statistics**. Do not add a new sidebar item for preprocessing.

### Raw Data Summary
- Open by default.
- Shows statistics for the original selected dataset.
- Has only **Variables** and **Distributions** tabs.
- Does not show a **Model** tab.

### Preprocessing Setup
- Contains the supported preprocessing controls for the selected variables and covariates.
- Current executable scope is **Missing Values** only.
- Search filters visible variable rows by variable label or code.
- Changing a rule creates a pending state.
- **Reset Changes**, **Preview Impact**, and **Apply Preprocessing** are disabled until there are pending changes.
- Applying validates the rules, sends a processed descriptive overview request, stores the applied preprocessing configuration, clears pending changes, and expands the processed summary.

### Processed Data Summary
- Collapsed/empty until preprocessing has been applied.
- After apply, it mirrors Raw Data Summary layout and shows only **Variables** and **Distributions**.
- Displays statistics recalculated from the processed descriptive overview response.
- Shows the note: **Based on applied preprocessing rules**.

## 5. Common Pitfalls & Tips

- **Change Detection**: The project uses `ChangeDetectionStrategy.OnPush`. When integrating with D3 or other non-Angular events, you MUST manually trigger `ChangeDetectorRef.detectChanges()` to ensure updates propagate to child components.
- **Signal Writes**: Reactive effects that update state (like the auto-expansion logic) must use `{ allowSignalWrites: true }`.
- **D3 Hierarchy**: The bubble chart uses [`zoomable-circle-packing.ts`](../../src/app/pages/experiment-studio/visualisations/bubble-chart/zoomable-circle-packing.ts). Ensure any changes to interaction logic are applied here and emitted via `@Output` in the wrapper component.
- **Dataset Enrichment**: Adding a variable usually requires "enriching" it (fetching enumerations or metadata) before it can be used in algorithms. This is handled by `addVariableAndEnrich()`.
- **Pending vs Applied Preprocessing**: Pending preprocessing rules must not update processed summaries or algorithm requests. Only applied preprocessing should be used downstream.
- **Describe Calls**: Do not rely on saved descriptive results. Raw and processed summaries are recalculated through descriptive overview calls.
- **Unsupported Preprocessing**: Do not add UI controls for transformations that Exaflow cannot execute unless the backend/API support is added first.

## 6. Key Files

- [`experiment-studio.component.ts`](../../src/app/pages/experiment-studio/experiment-studio.component.ts)
- [`experiment-studio.service.ts`](../../src/app/services/experiment-studio.service.ts)
- [`statistic-analysis-panel.component.ts`](../../src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.component.ts)
- [`statistic-analysis-panel.component.html`](../../src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.component.html)
- [`statistic-analysis-panel.component.css`](../../src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.component.css)
- [`algorithm-panel.component.ts`](../../src/app/pages/experiment-studio/algorithm-panel/algorithm-panel.component.ts)
- [`algorithm-rules.service.ts`](../../src/app/services/algorithm-rules.service.ts)
- [`zoomable-circle-packing.ts`](../../src/app/pages/experiment-studio/visualisations/bubble-chart/zoomable-circle-packing.ts)
