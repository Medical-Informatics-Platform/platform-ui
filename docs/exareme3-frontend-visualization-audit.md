# Exareme3 Frontend Visualization Audit

Date: 2026-02-11

## Scope

This audit compares:
- Frontend visualization implementation under `src/app/pages/experiment-studio/visualisations/` and `algorithm-result` wiring.
- Exaflow Exareme3 algorithm outputs from `exaflow/algorithms/exareme3/*.py` and `*.json`.

Primary frontend sources:
- `src/app/pages/experiment-studio/visualisations/charts/chart-registry.ts`
- `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`
- `src/app/pages/experiment-studio/algorithm-panel/algorithm-result/algorithm-result.component.html`
- `src/app/pages/experiment-studio/variables-panel/variables-panel.component.ts`

## 1. What The Frontend Visualizes Today

### 1.1 Result page visualization registry

The result page renders only what exists in:
- `AlgorithmTableRegistry` (tables)
- `AlgorithmChartRegistry` (charts)

If an algorithm key is missing from both registries, result rendering is effectively empty.

| Algorithm key (frontend) | Tables rendered | Charts rendered |
|---|---|---|
| `kmeans` | Cluster centers table (`centers`) | 2D/3D center scatter (`centers`) |
| `linear_regression` | Coefficients + model summary | None |
| `linear_regression_cv` | Fold sample sizes + error metrics | None |
| `logistic_regression` | Coefficients + model summary | None |
| `logistic_regression_cv` | CV metrics summary | Confusion matrix + ROC curves |
| `naive_bayes_gaussian` | Class summary + theta + variance | None |
| `naive_bayes_gaussian_cv` | Classification summary table | Confusion matrix |
| `naive_bayes_categorical` | Class summary + category counts | None |
| `naive_bayes_categorical_cv` | Classification summary table | Confusion matrix |
| `pearson_correlation` | `n_obs` table | Correlation + p-values + CI heatmaps |
| `anova_oneway` | ANOVA summary + Tukey table | Mean plot (bar chart renderer is currently empty) |
| `anova` (legacy key) | Two-way ANOVA table | None |
| `ttest_onesample` | Key/value table (all returned keys) | None |
| `ttest_independent` | Key/value table (all returned keys) | None |
| `ttest_paired` | Key/value table (all returned keys) | None |
| `pca` | None | Eigenvector heatmap |
| `pca_with_transformation` | None | Eigenvector heatmap |
| `describe` | None | Box plot over `variable_based` |
| `svm_scikit` (legacy key) | Summary/coefficients/support vector sample | SVM support vector distribution |
| `logistic_regression_cv_fedaverage` (legacy key) | CV metrics summary | Confusion matrix + ROC curves |

### 1.2 Other visualization paths (outside result registry)

- `histogram` is rendered as a transient D3 histogram in variables panel (`HistogramComponent`), not in `AlgorithmTableRegistry`/`AlgorithmChartRegistry`.
- Descriptive statistics also have a dedicated panel (`StatisticAnalysisPanel`) that renders:
  - Variables/model tables from `describe.variable_based` and `describe.model_based`
  - Numeric distributions (box plots)
  - Nominal distributions (grouped bar charts)

## 2. Exareme3 Algorithm Coverage Against Backend Outputs

Backend Exareme3 algorithm names (from JSON `name` fields):
- `anova_oneway`, `anova_twoway`, `describe`, `histogram`, `kmeans`, `linear_regression`, `linear_regression_cv`, `linear_svm`, `logistic_regression`, `logistic_regression_cv`, `longitudinal_transformer`, `naive_bayes_categorical`, `naive_bayes_categorical_cv`, `naive_bayes_gaussian`, `naive_bayes_gaussian_cv`, `pca`, `pca_with_transformation`, `pearson_correlation`, `ttest_independent`, `ttest_onesample`, `ttest_paired`.

### Coverage status

| Exareme3 algorithm | Coverage status | Notes |
|---|---|---|
| `anova_oneway` | Partial | `anova_table` and `tuckey_test` shown; `ci_info` partly used (mean plot); `min_max_per_group` not shown. |
| `anova_twoway` | Missing in result registry | Frontend has `anova` key, not `anova_twoway`; name mismatch prevents rendering in result page. |
| `describe` | Partial | Dedicated descriptive panel is rich; result registry path only charts and no table builder. |
| `histogram` | Partial | Only transient variables-panel histogram is used; grouped histogram entries are not surfaced. |
| `kmeans` | Partial | `centers` shown; `n_obs`/`title` omitted. |
| `linear_regression` | Partial | Main regression stats shown; `dependent_var`, `ll`, `aic`, `bic` omitted. |
| `linear_regression_cv` | Partial (with mapping bug) | Missing `dependent_var`, `indep_vars`, `f_stat`; `mean` values not rendered due key mismatch (`avg` expected, backend uses `mean`). |
| `linear_svm` | Missing in result registry | Backend returns `weights`/`intercept`; frontend only has legacy `svm_scikit` renderers. |
| `logistic_regression` | Partial (with mapping bug) | Mostly shown, but `stderr` column is empty because frontend expects `std_err`. |
| `logistic_regression_cv` | Mostly complete | Summary + confusion matrix + ROC rendered; `dependent_var`/`indep_vars` not shown. |
| `longitudinal_transformer` | Not visualized (N/A in current UX) | Transformer/preprocessing utility, no dedicated visualization path. |
| `naive_bayes_categorical` | Partial | `category_log_prob` is not rendered. |
| `naive_bayes_categorical_cv` | Complete (for top-level output) | `classification_summary` table + confusion matrix chart. |
| `naive_bayes_gaussian` | Complete (for top-level output) | Class summary + theta + variance rendered. |
| `naive_bayes_gaussian_cv` | Complete (for top-level output) | `classification_summary` table + confusion matrix chart. |
| `pca` | Partial | Only `eigenvectors` charted; `eigenvalues`, `n_obs`, `title` omitted. |
| `pca_with_transformation` | Partial | Same as `pca`: only `eigenvectors` charted. |
| `pearson_correlation` | Complete (functional) | `n_obs` table + all matrix outputs (`correlations`, `p_values`, `ci_hi`, `ci_lo`) charted. |
| `ttest_independent` | Complete | All returned fields rendered as key/value rows. |
| `ttest_onesample` | Complete | All returned fields rendered as key/value rows. |
| `ttest_paired` | Complete | All returned fields rendered as key/value rows. |

## 3. Discrepancies To Address

### High-impact mismatches

1. Algorithm key mismatch: `anova_twoway` backend vs `anova` frontend registry key.
2. Algorithm key mismatch: `linear_svm` backend vs `svm_scikit` frontend registry key.
3. `linear_regression_cv` metric mapping bug: frontend expects `avg`, backend returns `mean`.
4. `logistic_regression` stderr mapping bug: frontend reads `std_err`, backend returns `stderr`.

### Missing output fields (partial rendering)

1. `anova_oneway`: `min_max_per_group` not visualized; bar chart renderer is a stub.
2. `kmeans`: `n_obs` and `title` not visualized.
3. `linear_regression`: `dependent_var`, `ll`, `aic`, `bic` not visualized.
4. `linear_regression_cv`: `dependent_var`, `indep_vars`, `f_stat` not visualized.
5. `naive_bayes_categorical`: `category_log_prob` not visualized.
6. `pca` and `pca_with_transformation`: `eigenvalues`, `n_obs`, `title` not visualized.
7. `logistic_regression_cv`: `dependent_var` and `indep_vars` not visualized (metrics/charts are present).

### Flow-specific gaps

1. `histogram`: frontend consumes only the first histogram item in variables panel; grouped histogram entries (`grouping_var`, `grouping_enum`) are effectively ignored.
2. `describe`: rich visualization exists in dedicated descriptive panel, but the generic result renderer path has no table builder for `describe`.

### Legacy/non-Exareme3 frontend keys found

- `anova`
- `svm_scikit`
- `logistic_regression_cv_fedaverage`

These keys are not present in current Exareme3 algorithm names and can cause confusion unless intentionally kept for backward compatibility with historical experiment payloads.

