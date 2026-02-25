---
description: How the Experiment Studio frontend flow works
---

# Experiment Studio Frontend Flow

This guide describes the core user journey and technical implementation of the Experiment Studio.

## 1. Core User Journey

1.  **Select Pathology (Data Model)**: Choosing the domain of study (e.g., Stroke).
2.  **Select Datasets**: Enabling specific data sources to explore.
3.  **Explore Variables**: Using the zoomable bubble chart to browse the data hierarchy.
4.  **Select Parameters**:
    *   **Variables (Y)**: Target variables for analysis.
    *   **Covariates (X)**: Predictor variables.
    *   **Filters**: Subset the data based on variable values.
5.  **View Distributions**: Reviewing histograms of selected variables across datasets.
6.  **Run Algorithms**: Selecting and configuring a statistical algorithm based on selected parameters.

## 2. Technical Architecture

### Component Hierarchy
- `ExperimentStudioComponent`: Main orchestrator and route handler.
  - `VariablesPanelComponent`: Manages data/dataset selection and variable exploration.
    - `BubbleChartComponent`: D3-based visualization of the data model.
    - `VariableFilterSelectionComponent`: Manages selected variables, covariates, and filters.
    - `DistributionGraphComponent`: Renders histograms for selected nodes.
  - `AlgorithmPanelComponent`: Manages algorithm selection, configuration, and execution.

### State Management
- **Service**: [ExperimentStudioService](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/services/experiment-studio.service.ts)
- **Signals**: Used extensively for reactive state (e.g., `selectedDataModel()`, `selectedVariables()`).
- **Communication**: Components inject the service to read/write state.

### Important Logic
- **D3 Interaction**: Leaf node clicks in the bubble chart update the `selectedNode` in the parent panel, which then triggers a histogram fetch via the service.
- **Double-Click Shortcut**: Double-clicking a leaf node in the bubble chart automatically adds it to the **Variables** list.
- **Onboarding Hints**: Selection buttons (+Variables, etc.) pulse when a variable is selected but not yet added.
- **Algorithm Rules**: [AlgorithmRulesService](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/services/algorithm-rules.service.ts) contains the logic for enabling/disabling algorithms based on selected variable types and counts.
- **Auto-Expansion**: Algorithm categories automatically expand in the sidebar when compatible variables are selected and algorithms become available.
- **Requirement Key**: A legend at the bottom of the algorithm panel clarifies the meaning of requirement icons (Database = Variable, Sliders = Covariate).

## 3. Common Pitfalls & Tips

- **Change Detection**: The project uses `ChangeDetectionStrategy.OnPush`. When integrating with D3 or other non-Angular events, you MUST manually trigger `ChangeDetectorRef.detectChanges()` to ensure updates propagate to child components.
- **Signal Writes**: Reactive effects that update state (like the auto-expansion logic) must use `{ allowSignalWrites: true }`.
- **D3 Hierarchy**: The bubble chart uses [zoomable-circle-packing.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/experiment-studio/visualisations/bubble-chart/zoomable-circle-packing.ts). Ensure any changes to interaction logic are applied here and emitted via `@Output` in the wrapper component.
- **Dataset Enrichment**: Adding a variable usually requires "enriching" it (fetching enumerations or metadata) before it can be used in algorithms. This is handled by `addVariableAndEnrich()`.

## 4. Key Files
- [experiment-studio.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/experiment-studio/experiment-studio.component.ts)
- [experiment-studio.service.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/services/experiment-studio.service.ts)
- [algorithm-panel.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/experiment-studio/algorithm-panel/algorithm-panel.component.ts)
- [algorithm-rules.service.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/services/algorithm-rules.service.ts)
- [zoomable-circle-packing.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/experiment-studio/visualisations/bubble-chart/zoomable-circle-packing.ts)
