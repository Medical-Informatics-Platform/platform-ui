# Visualization Proposal by Result Model

This document is a model-driven visualization proposal.

Reference model file:
- `src/app/models/algorithm-results.model.ts`

Goal:
- For each result interface, define how we propose to visualize the data in the frontend.
- Keep this as a design reference for future chart/table implementation and prioritization.

## Principles

1. Show the most decision-relevant metric first.
2. Pair every chart with at least one precise table.
3. Use confidence intervals and dispersion visuals where available.
4. Prefer fold-level variability views for CV outputs.
5. Keep labels human-readable (variable labels and enum labels where possible).

## Result-to-Visualization Proposal

## `AnovaResult`

Data includes:
- `anova_table`
- `tuckey_test`
- `min_max_per_group`
- `ci_info`

Proposed visualization:
- Primary: Sum-of-squares bar chart (explained vs residual).
- Secondary: Mean plot with CI error bars from `ci_info`.
- Supporting tables:
  - ANOVA summary table (`df`, `ss`, `ms`, `F`, `p`).
  - Tukey post-hoc comparison table.
  - Group min/max table from `min_max_per_group`.

## `AnovaTwoWayResult`

Data includes arrays by term:
- `terms`, `sum_sq`, `df`, `f_stat`, `f_pvalue`

Proposed visualization:
- Primary: Term-level bar chart (sum of squares).
- Optional additional charts:
  - F-statistic by term.
  - `-log10(p-value)` by term for significance emphasis.
- Supporting table:
  - Full two-way ANOVA table.

## `TTestResult`

Data includes:
- `t_stat`, `df`, `p`, `mean_diff`, `se_diff`, `ci_lower`, `ci_upper`, `cohens_d`

Proposed visualization:
- Primary: Single-point effect chart (mean difference with 95% CI).
- Supporting table:
  - Compact test summary with all statistics.

## `LinearRegressionResult`

Data includes:
- Coefficient vectors (`coefficients`, `lower_ci`, `upper_ci`, `pvalues`, etc.)
- Model diagnostics (`r_squared`, `aic`, `bic`, `f_stat`, ...)

Proposed visualization:
- Primary: Forest plot for coefficients with CI.
- Supporting tables:
  - Coefficients table.
  - Model summary table.
- Optional enhancement:
  - Coefficient significance coloring by p-value threshold.

## `LinearRegressionCVResult`

Data includes:
- `n_obs` (per fold)
- Metric summaries as `BasicStats`:
  - `mean_sq_error`, `r_squared`, `mean_abs_error`, `f_stat`

Proposed visualization:
- Primary: Grouped bar chart of mean vs std for each metric.
- Supporting tables:
  - Fold sample sizes.
  - Metric mean/std summary table.
- If future payload includes per-fold arrays:
  - Add fold trend line charts for each metric.

## `LogisticRegressionResult`

Data includes:
- `indep_vars`
- `summary` (coefficients, stderr, CI, z, p, diagnostics)

Proposed visualization:
- Primary: Forest plot for logistic coefficients with CI.
- Supporting tables:
  - Coefficients table.
  - Model summary diagnostics table.

## `CVLogisticRegressionResult`

Data includes:
- `summary` (fold metrics)
- `confusion_matrix` (`tp`, `fp`, `tn`, `fn`)
- `roc_curves`

Proposed visualization:
- Primary: ROC curve chart (one series per fold + AUC in legend).
- Secondary: Confusion matrix heatmap.
- Supporting table:
  - Fold-level metrics (accuracy, precision, recall, F-score, observations).

## `NaiveBayesGaussianResult`

Data includes:
- `classes`, `class_count`, `class_prior`
- `theta`, `var`
- `feature_names`

Proposed visualization:
- Primary: Class prior probability bar chart.
- Secondary:
  - Heatmap for class-feature means (`theta`).
  - Heatmap for class-feature variances (`var`).
- Supporting tables:
  - Class summary.
  - Means and variances tables.

## `NaiveBayesCategoricalResult`

Data includes:
- `classes`, `class_count`, `class_log_prior`
- `category_count`, `category_log_prob`
- `categories`, `feature_names`

Proposed visualization:
- Primary: Class prior probability bar chart.
- Secondary:
  - Feature/category probability heatmaps per class.
- Supporting tables:
  - Class summary.
  - Category counts and log-probability tables per feature.

## `NaiveBayesCVResult`

Data includes:
- `confusion_matrix` (`data`, `labels`)
- `classification_summary` (accuracy/precision/recall/fscore by fold/class)

Proposed visualization:
- Primary: Confusion matrix heatmap.
- Secondary: Metrics comparison chart (macro or per-class/fold).
- Supporting tables:
  - Classification metrics per fold.
  - Combined confusion matrix table.

Note:
- No ROC data is defined in this interface. ROC can be added only if backend/model is extended.

## `KMeansResult`

Data includes:
- `centers` (2D, 3D, or higher-dimensional)

Proposed visualization:
- For 2D centers: Scatter plot.
- For 3D centers: 3D scatter plot.
- For >3 dimensions: Parallel coordinates plot.
- Supporting table:
  - Cluster center coordinates.

## `PCAResult`

Data includes:
- `eigenvalues`
- `eigenvectors`

Proposed visualization:
- Primary: Scree plot from `eigenvalues`.
- Secondary: Heatmap of eigenvectors/loadings.
- Supporting table:
  - Eigenvalues table.

## `PearsonResult`

Data includes:
- `correlations`, `p_values`, `ci_hi`, `ci_lo`
- `n_obs`

Proposed visualization:
- Primary: Correlation matrix heatmap.
- Secondary:
  - P-values heatmap.
  - Lower CI heatmap.
  - Upper CI heatmap.
- Supporting table:
  - Observations count.

## `HistogramResult`

Data includes:
- `histogram[]` with `bins`, `counts`, grouping info

Proposed visualization:
- Primary: Histogram bar chart per item.
- Supporting table:
  - Bin/count rows for export and auditability.

## `DescriptiveStatsResult`

Data includes:
- `variable_based`, `model_based`
- each item has `NominalDescriptiveStats` or `NumericalDescriptiveStats`

Proposed visualization:
- Numerical:
  - Primary: Box plot (min, Q1, median, Q3, max).
- Nominal:
  - Primary: Grouped/stacked bar chart of category distributions.
- Supporting tables:
  - Numerical summary (mean/std/quartiles/counts).
  - Nominal summary (counts and totals).

## `SVMResult`

Data includes:
- `weights`
- `intercept`
- `n_obs`

Proposed visualization:
- Primary: Weight distribution chart with decision boundary markers.
- Optional enhancement:
  - Signed coefficient bar chart to compare feature contribution magnitude/direction.
- Supporting table:
  - SVM summary (observations, intercept, weights).

## Cross-Cutting Implementation Notes

1. Enum mapping
- For class/category outputs, map codes to labels using enum maps before visualization.

2. Label mapping
- Replace variable codes with user-facing labels in axes, legends, and tables.

3. Missing data handling
- If a field is optional or absent, skip that panel gracefully instead of failing the whole renderer.

4. Exportability
- Every primary chart should have a corresponding table representation for PDF/report export.

## Proposed Priority for Enhancements

1. Add Naive Bayes mean/variance/category heatmaps.
2. Add two-way ANOVA significance-oriented chart (`-log10(p)`).
3. Add optional per-fold trend charts when CV payloads include fold arrays.
4. Add standardized significance coloring in regression forest plots.
