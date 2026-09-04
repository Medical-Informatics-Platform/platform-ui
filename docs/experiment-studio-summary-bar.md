# Experiment Studio — is the summary bar needed?

**Date:** 17 Aug 2026  
**Selected node:** `div.studio-summary-bar` (`role="region"`, `aria-label="Experiment summary"`)

**Status:** Implemented on `feat/transformation-step` (2026-08-17).

- Summary bar: **removed entirely** — `<app-studio-summary-bar>` and `studio-summary-bar/**` deleted; not shown on any step. Its chips were a duplicate legend under the stepper; pathology/datasets/variables live in their own panels, preprocessing status in data review, and algorithm on the algorithm step.
- "When do I move on?" now lives on the stepper + a Continue/Skip footer (stepper hint, next-step highlighting, unlock announcement).
- Variables-panel rename completed: `variable-filter-selection` → `selected-variables` (selector `app-selected-variables`); no `setFilters`/`setFilterLogic` calls remain in the variables panel; pathology change clears dependent state via `ExperimentStudioService.clearSelectionsForDataModelChange()`; CSS class `selected-variables-container`; specs renamed. No covariates/cohort-filter copy in the variables panel.

---

## Verdict

**Not as a second always-on full-width bar.** The stepper already owns “where am I / can I go next.” This strip is leftover from when navigation lived in the left rail and you needed a persistent experiment readout above a tall page.

It does **not** tell the user when to move on. Empty chips (`No covariates`, `No filters`, `No algorithm`) add noise. Most chips are report-only now, so the bar is a duplicate legend under the step switcher.

---

## What it still does versus the stepper

| Chip | Unique? |
|---|---|
| Pathology, dataset count, variable count | No, while on Datasets & Variables (selectors + selected-variables tray already show this). Yes, as a glance-back if you are on Algorithm. |
| No covariates / No algorithm | Weak. Empty “No …” chips do not prompt Continue. |
| Preprocessing applied | Yes. The stepper check means “this step’s work is done”; the chip names *what* was done. |
| Filters / Preprocessing as buttons | Only leftover navigation: jump to a sub-tab *inside* data review. The stepper cannot do that. |

---

## What to do

**Remove the always-on 7-chip row.** Pathology / datasets / variables stay in their own panels. Preprocessing status stays in data review. Algorithm name stays on the algorithm step.

If a cross-step snapshot is still wanted later, show a **slim readout only on steps 2 and 3** (pathology, dataset count, variable count, preprocessing). Hide it on Datasets & Variables.

Do **not** keep the current always-on row. The empty chips and `is-active` highlighting pretend it is still navigation.

Dropping the bar also drops the Filters / Preprocessing chip shortcuts. Users use the data-review sub-tabs instead. That is a fair trade.

“When do I move on?” belongs on the stepper + a Continue footer (see the continue-CTA spec), not on this strip.

---

## Variables panel: no covariates, no cohort filters

Covariates are assigned on **Algorithm**. Cohort filters live on **Data review**. The Datasets & Variables step only selects a data model, datasets, and variables.

Required in code (this change):

- Rename `variable-filter-selection` → `selected-variables` (selector `app-selected-variables`). That component is the selected-variables tray, not a filter UI.
- Variables panel must not call `setFilters` / `setFilterLogic` by name. Pathology change still clears dependent experiment state through a service helper (`clearSelectionsForDataModelChange()`), because filters/roles are invalid for a new data model.
- Specs and CSS class `variable-filter-container` follow the rename.
- Do not mention covariates or cohort filters in variables-panel copy, selectors, or identifiers.

Out of scope here: `Array.prototype.filter`, CSS `filter` / `backdrop-filter`, and `filteredVariables` / `filteredGroups` (search subsets of the hierarchy, not cohort filters).

---

## Files

| File | Role |
|---|---|
| `src/app/pages/experiment-studio/studio-summary-bar/**` | **Removed.** Not required for Continue. |
| `src/app/pages/experiment-studio/variables-panel/selected-variables/**` | Replaces `variable-filter-selection`. |
| `src/app/services/experiment-studio.service.ts` | `clearSelectionsForDataModelChange()` owns filter/variable/dataset reset on pathology change. |

## Risk

UI/naming only plus moving an existing clear onto the service. No `/services` contract change.
