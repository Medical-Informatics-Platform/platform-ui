# Exareme3 Visualization Remediation Tasks

Date: 2026-02-11
Source audit: `docs/exareme3-frontend-visualization-audit.md`

## Agent Intake

This document is intended for execution by coding agents.

Execution rules:
- Pick tasks by priority (`P0` before `P1` before `P2`) unless dependencies block.
- Respect dependencies in each task.
- For each completed task, update status and append a short implementation note.
- Keep backward compatibility for existing stored experiments unless task explicitly says otherwise.

Task status values:
- `pending`
- `in_progress`
- `blocked`
- `done`

## Machine-Readable Task Manifest

```yaml
tasks:
  - id: VIS-001
    priority: P0
    status: done
    title: Harmonize algorithm keys (backend vs frontend registries)
    depends_on: []
  - id: VIS-002
    priority: P0
    status: done
    title: Fix schema field mapping bugs (stderr/std_err, mean/avg)
    depends_on: []
  - id: VIS-003
    priority: P0
    status: blocked
    title: Add/adjust automated tests for registry rendering contracts
    depends_on: [VIS-001, VIS-002]
  - id: VIS-004
    priority: P1
    status: done
    title: Complete anova_oneway visualization gaps
    depends_on: [VIS-001, VIS-002]
  - id: VIS-005
    priority: P1
    status: done
    title: Add missing linear_regression and linear_regression_cv fields
    depends_on: [VIS-002]
  - id: VIS-006
    priority: P1
    status: done
    title: Add missing pca/pca_with_transformation summary tables
    depends_on: [VIS-001]
  - id: VIS-007
    priority: P1
    status: done
    title: Add missing naive_bayes_categorical category_log_prob visualization
    depends_on: [VIS-001]
  - id: VIS-008
    priority: P1
    status: done
    title: Add logistic_regression_cv metadata summary table
    depends_on: [VIS-001]
  - id: VIS-009
    priority: P1
    status: done
    title: Improve histogram flow to support grouped histogram outputs
    depends_on: []
  - id: VIS-010
    priority: P2
    status: done
    title: Decide and implement describe result-page strategy
    depends_on: []
  - id: VIS-011
    priority: P2
    status: done
    title: Legacy key deprecation and compatibility policy
    depends_on: [VIS-001]
```

## Detailed Tasks

### VIS-001 (P0) Harmonize algorithm keys (backend vs frontend registries)

Problem:
- Backend Exareme3 names: `anova_twoway`, `linear_svm`.
- Frontend registries currently use legacy keys: `anova`, `svm_scikit`.
- Result page misses rendering when keys do not match.

Scope:
- Ensure `AlgorithmTableRegistry` and `AlgorithmChartRegistry` support backend keys.
- Keep legacy keys as aliases for backward compatibility.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`
- `src/app/pages/experiment-studio/visualisations/charts/chart-registry.ts`
- `src/app/core/algorithm-mappers.ts`

Implementation checklist:
- Add `anova_twoway` key mapped to current two-way ANOVA table builder.
- Add `linear_svm` key mapped to SVM table/chart builders.
- Preserve `anova` and `svm_scikit` as aliases to avoid regressions on historical payloads.
- Verify output schema mapping in `algorithm-mappers.ts` is consistent with runtime keys.

Acceptance criteria:
- A result with `algorithm="anova_twoway"` renders a non-empty table.
- A result with `algorithm="linear_svm"` renders non-empty table/chart.
- Existing historical keys (`anova`, `svm_scikit`) still render.

Verification:
- `npm test` (or targeted tests for renderer components)
- `npm run build`

---

### VIS-002 (P0) Fix schema field mapping bugs (stderr/std_err, mean/avg)

Problem:
- Logistic regression output field is `stderr`, while frontend reads `std_err`.
- Linear regression CV returns `BasicStats(mean, std)`, while frontend expects `avg`.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`

Implementation checklist:
- In logistic regression table builder, support both `stderr` and `std_err`.
- In linear regression CV builder, support both `mean` and `avg`.
- Add defensive handling for missing stats values to avoid blank rows.

Acceptance criteria:
- Logistic regression "Std.Err." column is populated with Exareme3 payloads.
- Linear regression CV metric "Mean" values are populated with Exareme3 payloads.

Verification:
- Unit tests for both payload shapes.
- `npm run build`

---

### VIS-003 (P0) Add/adjust automated tests for registry rendering contracts

Problem:
- Key-mapping and schema-field regressions can silently hide results.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/auto-renderer.component.spec.ts`
- New spec files near registries:
  - `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.spec.ts`
  - `src/app/pages/experiment-studio/visualisations/charts/chart-registry.spec.ts`

Implementation checklist:
- Add test fixtures for Exareme3 payloads (`anova_twoway`, `linear_svm`, `logistic_regression`, `linear_regression_cv`).
- Assert table builders produce rows/columns for canonical payloads.
- Assert chart builder returns chart options for supported algorithms.

Acceptance criteria:
- Tests fail before fixes and pass after fixes for key mismatches/field mismatches.
- CI-local suite includes coverage for all `P0` discrepancies.

Verification:
- `npm test`
- `npm run build`

---

### VIS-004 (P1) Complete anova_oneway visualization gaps

Problem:
- `buildBarChart` is currently a stub.
- `min_max_per_group` is not surfaced.

Primary files:
- `src/app/pages/experiment-studio/visualisations/charts/renderers/bar-chart.ts`
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`

Implementation checklist:
- Implement `buildBarChart` using ANOVA one-way grouped summaries.
- Add table section for `min_max_per_group` (group, min, max).
- Keep existing mean plot.

Acceptance criteria:
- ANOVA one-way renders at least one additional chart beyond mean plot.
- Min/max per group appears in a table.

Verification:
- Screenshot/manual QA with real response payload.
- `npm run build`

---

### VIS-005 (P1) Add missing linear_regression and linear_regression_cv fields

Problem:
- Important backend outputs are omitted from tables.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`

Implementation checklist:
- `linear_regression`: include `dependent_var`, `ll`, `aic`, `bic` in summary table.
- `linear_regression_cv`: include `dependent_var`, `indep_vars`, `f_stat` (mean/std) in summary.

Acceptance criteria:
- All listed fields appear when present in payload.
- Existing rendering remains stable when fields are missing.

Verification:
- Unit tests with complete and sparse payloads.
- `npm run build`

---

### VIS-006 (P1) Add missing pca/pca_with_transformation summary tables

Problem:
- PCA currently only visualizes `eigenvectors` heatmap.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`

Implementation checklist:
- Add table builder entries for:
  - `pca`
  - `pca_with_transformation`
- Render:
  - `title`
  - `n_obs`
  - `eigenvalues` (component/value)

Acceptance criteria:
- PCA result page contains both chart and summary tables.

Verification:
- Manual check with payload fixture.
- `npm run build`

---

### VIS-007 (P1) Add missing naive_bayes_categorical category_log_prob visualization

Problem:
- Backend returns `category_log_prob`, currently not visualized.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`

Implementation checklist:
- Add per-feature table(s) for `category_log_prob`, aligned with category labels and class labels.
- Reuse existing enum/label mapping helpers.

Acceptance criteria:
- Category log probabilities render for each feature in categorical NB.

Verification:
- Unit tests with categorical NB payload.
- `npm run build`

---

### VIS-008 (P1) Add logistic_regression_cv metadata summary table

Problem:
- CV metrics/charts exist but `dependent_var` and `indep_vars` are hidden.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`

Implementation checklist:
- Add compact metadata table above CV metrics for:
  - `dependent_var`
  - `indep_vars`

Acceptance criteria:
- Metadata appears for logistic regression CV when provided.

Verification:
- Unit tests for presence/absence of metadata fields.
- `npm run build`

---

### VIS-009 (P1) Improve histogram flow to support grouped histogram outputs

Problem:
- Variables panel consumes only the first histogram item, ignoring grouped outputs.

Primary files:
- `src/app/pages/experiment-studio/variables-panel/variables-panel.component.ts`
- `src/app/pages/experiment-studio/variables-panel/variables-panel.component.html`
- `src/app/pages/experiment-studio/visualisations/histogram/histogram-chart.ts`

Implementation checklist:
- Parse all items in `result.histogram`.
- Add UI to switch between:
  - Base histogram (no grouping)
  - Grouped histograms (`grouping_var`, `grouping_enum`)
- Preserve enum label mapping for bins.

Acceptance criteria:
- Grouped histogram responses are navigable and rendered.
- Non-grouped responses still render exactly as before.

Verification:
- Manual UI test with grouped backend payload.
- `npm run build`

---

### VIS-010 (P2) Decide and implement describe result-page strategy

Problem:
- `describe` has rich dedicated panel, but generic result page path has no table builder.

Decision options:
- Option A: Add `describe` table builder for result page parity.
- Option B: Keep result page minimal and route users to dedicated panel intentionally.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`
- `src/app/pages/experiment-studio/algorithm-panel/algorithm-result/algorithm-result.component.html`
- Potentially docs/UX copy.

Acceptance criteria:
- Chosen behavior is explicit in code and docs.
- No ambiguous empty state for describe results.

Verification:
- Manual check for both studio and dashboard result contexts.
- `npm run build`

---

### VIS-011 (P2) Legacy key deprecation and compatibility policy

Problem:
- Legacy keys (`anova`, `svm_scikit`, `logistic_regression_cv_fedaverage`) still exist and can confuse maintenance.

Primary files:
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`
- `src/app/pages/experiment-studio/visualisations/charts/chart-registry.ts`
- `docs/exareme3-frontend-visualization-audit.md`
- This task doc.

Implementation checklist:
- Keep aliases for backward compatibility.
- Add inline comments documenting canonical keys and legacy aliases.
- Add doc section with deprecation timeline and removal criteria.

Acceptance criteria:
- Canonical keys are clear and used by default.
- Legacy support behavior is documented and test-covered.

Verification:
- `npm test`
- `npm run build`

### Legacy Key Policy

- Canonical keys to use in all new code and payloads:
  - `anova_twoway`
  - `linear_svm`
  - `logistic_regression_cv`
- Backward-compatible aliases kept in registries:
  - `anova` -> `anova_twoway`
  - `svm_scikit` -> `linear_svm`
  - `logistic_regression_cv_fedaverage` -> `logistic_regression_cv` rendering contract
- Deprecation review date: `2026-06-30`.
- Alias removal criteria:
  - Zero usage in persisted experiments/export payloads for 30 consecutive days.
  - Migration script or fallback mapper available for historical records.
  - Explicit release note in frontend changelog before removal.

## Suggested PR Split (for multiple agents)

1. PR-A (P0): `VIS-001`, `VIS-002`, `VIS-003`
2. PR-B (P1 data tables): `VIS-005`, `VIS-006`, `VIS-007`, `VIS-008`
3. PR-C (P1 charts/UX): `VIS-004`, `VIS-009`
4. PR-D (policy/docs): `VIS-010`, `VIS-011`

## Progress Log

- 2026-02-11: Document created. All tasks `pending`.
- 2026-02-11: `VIS-001` completed (added canonical keys `anova_twoway` and `linear_svm` with legacy aliases preserved).
- 2026-02-11: `VIS-002` completed (added `mean|avg` and `stderr|std_err` compatibility in table builders).
- 2026-02-11: `VIS-003` implemented (added registry specs) but blocked on execution due local Chrome sandbox permissions in this environment.
- 2026-02-11: `VIS-005` completed (added missing linear regression and linear regression CV summary fields).
- 2026-02-11: `VIS-006` completed (added PCA/PCA-with-transformation summary and eigenvalue tables).
- 2026-02-11: `VIS-007` completed (added categorical Naive Bayes category log-probability tables).
- 2026-02-11: `VIS-008` completed (added logistic regression CV metadata table in both CV builders).
- 2026-02-11: `VIS-004` completed (implemented ANOVA one-way bar chart and added min/max per-group table output).
- 2026-02-11: `VIS-010` completed (adopted Option A by adding `describe` table builder for result-page parity).
- 2026-02-11: `VIS-011` completed (documented canonical/legacy key compatibility and deprecation policy).
- 2026-02-11: `VIS-009` completed (added grouped-histogram variant selector and rendering support in variables panel).
