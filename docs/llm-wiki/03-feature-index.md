# Feature Index

Use this page to choose the smallest feature context.

## Experiment Studio

Path: `src/app/pages/experiment-studio/`

Owns data model/dataset selection, variables, filters, algorithm config, runs,
transient previews, charts, tables, histograms, and metadata views.

Start with:

- `ExperimentStudioComponent`
- `ExperimentStudioService`
- relevant model under `src/app/models/`
- `06-algorithm-mapping-index.md` for algorithm output/config tasks

Search keys: `selectedDataModel`, `dataset`, `variable`, `filter`, `transient`,
`histogram`, `describe`, algorithm name.

## Experiments Dashboard

Path: `src/app/pages/experiments-dashboard/`

Owns experiment list/search/pagination, detail view, compare, metadata updates,
sharing, delete, and exports.

Start with:

- `ExperimentsDashboardComponent`
- `ExperimentsDashboardService`
- dashboard model/mapper

Search keys: `compare`, `export`, `shared`, `description`, `delete`, `PATCH`,
experiment id, result key.

## Smaller Pages

| Area | Path | Start with |
|---|---|---|
| account | `src/app/pages/account-page/` | component + `AuthService` |
| terms | `src/app/pages/terms-page/` | component + `TermsGuard` |
| notebook | `src/app/pages/notebook/` | route + component + runtime env |
| shared layout | `src/app/pages/shared/` | specific component |

Use `indexes/files-by-feature.md` for exact paths and avoid opening sibling
folders until a search points there.
