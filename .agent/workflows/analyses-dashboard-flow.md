---
description: Patterns and implementation of the Analyses Dashboard
---

# Analyses Dashboard Frontend Flow

This guide describes the user journey, technical architecture, and interaction design of the Analyses Dashboard.

## 1. Core User Journey

1.  **Welcome & Greeting**: Users are greeted with a personalized header and an overview of their analysis count.
2.  **Analysis History**: Users browse their past analyses using a paginated, searchable list.
3.  **Detail Preview**: Clicking an analysis opens a high-level detail view showing configuration, status (Success/Error), and summary results.
4.  **Edit/Rerun**: Users can jump directly back into the **Analysis Studio** to edit or rerun an existing analysis.
5.  **Comparison Mode**: 
    - Toggle **Comparison Mode** via the columns icon in the dashboard header.
    - Select 2-4 analyses from the list.
    - View a multi-column workspace comparing metadata, parameters, and results side-by-side.

## 2. Technical Architecture

### Component Hierarchy
- `AnalysesDashboardComponent`: The main orchestrator of the dashboard's triple-pane layout.
  - `AnalysesListComponent`: Manages the searchable, filterable list of analyses.
    - `AnalysisSearchComponent`: Reusable search component with custom styling.
  - `AnalysisDetailsComponent`: Renders the detailed view of a single selected analysis.
  - `AnalysesCompareComponent`: Renders the comparison cards when mode is toggled ON.

### State Management
- **Service**: [AnalysesDashboardService](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/services/analyses-dashboard.service.ts)
- **Signals**: 
  - `compareMode()`: Boolean toggle for the comparison view.
  - `compareIds()`: Array of analysis IDs selected for side-by-side view.
  - `selectedAnalysis()`: The primary analysis being viewed in Detail Mode.
- **Communication**: The parent `AnalysesDashboardComponent` handles coordination between the list components and the detail/compare views via `@Input` and `@Output`.

## 3. Interaction Design & Polish

### Premium Aesthetics
- **Glassmorphism**: Panels, cards, and modal overlays use `backdrop-filter: blur(12px)` and subtle semi-transparent borders.
- **Micro-interactivity**: 
  - **Shadow Guidance**: The "Compare" button pulses with a subtle shadow animation when 1 or more analyses are selected but mode is inactive.
  - **Hover States**: Analysis cards and action buttons use translucent background shifts and border color triggers.
- **Stable Layout**: Buttons and list items maintain fixed sizes during selection and interaction (no reactive scaling) for a professional feel.

### Comparison Mode Features
- **Config Toggles**: Users can toggle between "Details" and "Configuration" within the comparison cards to see parameters.
- **Requirement Chips**: The dashboard uses the same iconography as the Studio (Database for Variables, Sliders for Covariates) for visual consistency.
- **Status Tags**: Standardized success (Teal) and error (Red) states with icons.

## 4. Key Files
- [analyses-dashboard.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/analyses-dashboard/analyses-dashboard.component.ts)
- [analyses-dashboard.service.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/services/analyses-dashboard.service.ts)
- [analysis-list.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/analyses-dashboard/analysis-list/analysis-list.component.ts)
- [analyses-compare.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/analyses-dashboard/analyses-compare/analyses-compare.component.ts)
- [analysis-detail.component.ts](file:///home/kfilippopolitis/Desktop/platform-ui/src/app/pages/analyses-dashboard/analysis-detail/analysis-detail.component.ts)
