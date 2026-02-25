---
description: Patterns and implementation of the Experiments Dashboard
---

# Experiments Dashboard Frontend Flow

This guide describes the user journey, technical architecture, and interaction design of the Experiments Dashboard.

## 1. Core User Journey

1.  **Welcome & Greeting**: Users are greeted with a personalized header and an overview of their experiment count.
2.  **Experiment History**: Users browse their past experiments using a paginated, searchable list.
3.  **Detail Preview**: Clicking an experiment opens a high-level detail view showing configuration, status (Success/Error), and summary results.
4.  **Edit/Rerun**: Users can jump directly back into the **Experiment Studio** to edit or rerun an existing experiment.
5.  **Comparison Mode**: 
    - Toggle **Comparison Mode** via the columns icon in the dashboard header.
    - Select 2-4 experiments from the list.
    - View a multi-column workspace comparing metadata, parameters, and results side-by-side.

## 2. Technical Architecture

### Component Hierarchy
- `ExperimentsDashboardComponent`: The main orchestrator of the dashboard's triple-pane layout.
  - `ExperimentsListComponent`: Manages the searchable, filterable list of experiments.
    - `ExperimentSearchComponent`: Reusable search component with custom styling.
  - `ExperimentDetailsComponent`: Renders the detailed view of a single selected experiment.
  - `ExperimentsCompareComponent`: Renders the comparison cards when mode is toggled ON.

### State Management
- **Service**: [ExperimentsDashboardService](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/services/experiments-dashboard.service.ts)
- **Signals**: 
  - `compareMode()`: Boolean toggle for the comparison view.
  - `compareIds()`: Array of experiment IDs selected for side-by-side view.
  - `selectedExperiment()`: The primary experiment being viewed in Detail Mode.
- **Communication**: The parent `ExperimentsDashboardComponent` handles coordination between the list components and the detail/compare views via `@Input` and `@Output`.

## 3. Interaction Design & Polish

### Premium Aesthetics
- **Glassmorphism**: Panels, cards, and modal overlays use `backdrop-filter: blur(12px)` and subtle semi-transparent borders.
- **Micro-interactivity**: 
  - **Shadow Guidance**: The "Compare" button pulses with a subtle shadow animation when 1 or more experiments are selected but mode is inactive.
  - **Hover States**: Experiment cards and action buttons use translucent background shifts and border color triggers.
- **Stable Layout**: Buttons and list items maintain fixed sizes during selection and interaction (no reactive scaling) for a professional feel.

### Comparison Mode Features
- **Config Toggles**: Users can toggle between "Details" and "Configuration" within the comparison cards to see parameters.
- **Requirement Chips**: The dashboard uses the same iconography as the Studio (Database for Variables, Sliders for Covariates) for visual consistency.
- **Status Tags**: Standardized success (Teal) and error (Red) states with icons.

## 4. Key Files
- [experiments-dashboard.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/experiments-dashboard/experiments-dashboard.component.ts)
- [experiments-dashboard.service.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/services/experiments-dashboard.service.ts)
- [experiment-list.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/experiments-dashboard/experiment-list/experiment-list.component.ts)
- [experiments-compare.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/experiments-dashboard/experiments-compare/experiments-compare.component.ts)
- [experiment-detail.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/experiments-dashboard/experiment-detail/experiment-detail.component.ts)
