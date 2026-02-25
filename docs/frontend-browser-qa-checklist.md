## Frontend QA Template (Pass/Fail)

Copy-paste this into your QA doc and fill the `Result` and `Notes` columns.

| ID | Area | Check | Result (Pass/Fail) | Notes |
|---|---|---|---|---|
| PRE-01 | App | App loads without initial console errors |  |  |
| PRE-02 | Navigation | `Experiment Studio` and `Experiments Dashboard` both open normally |  |  |
| ALG-01 | `anova_twoway` | Non-empty “Two-Way ANOVA Results” table renders |  |  |
| ALG-02 | `linear_svm` | Table output renders for `linear_svm` |  |  |
| ALG-03 | `linear_svm` | SVM chart renders for `linear_svm` |  |  |
| ALG-04 | `logistic_regression` | `Std.Err.` column is populated (not blank) |  |  |
| ALG-05 | `linear_regression_cv` | Error metric “Mean” values are populated |  |  |
| ALG-06 | `logistic_regression_cv` | Metadata table includes dependent/independent variables |  |  |
| ALG-07 | `logistic_regression_cv` | Confusion matrix chart renders |  |  |
| ALG-08 | `logistic_regression_cv` | ROC chart renders |  |  |
| ALG-09 | `pca` | Summary table + eigenvalues table render |  |  |
| ALG-10 | `pca` | PCA heatmap chart renders |  |  |
| ALG-11 | `pca_with_transformation` | Summary table + eigenvalues table render |  |  |
| ALG-12 | `pca_with_transformation` | PCA heatmap chart renders |  |  |
| ALG-13 | `naive_bayes_categorical` | “Category Log Probabilities” table(s) render |  |  |
| ALG-14 | `describe` | Result page shows describe tables (not chart-only) |  |  |
| ANO-01 | `anova_oneway` | “ANOVA Sum of Squares” bar chart renders |  |  |
| ANO-02 | `anova_oneway` | “Group Min/Max” table appears when data exists |  |  |
| ANO-03 | `anova_oneway` | Mean plot still renders |  |  |
| HIS-01 | Histogram | Grouped histogram response shows `View` dropdown |  |  |
| HIS-02 | Histogram | Switching `View` updates histogram data |  |  |
| HIS-03 | Histogram | “Overall” option is present when backend returns it |  |  |
| HIS-04 | Histogram | Non-grouped histogram behavior remains unchanged |  |  |
| HIS-05 | Histogram Export | CSV export works for selected histogram view |  |  |
| HIS-06 | Histogram Export | PDF export works for selected histogram view |  |  |
| LEG-01 | Legacy compatibility | Old `anova` experiments still render |  |  |
| LEG-02 | Legacy compatibility | Old `svm_scikit` experiments still render |  |  |
| LEG-03 | Legacy compatibility | Old `logistic_regression_cv_fedaverage` experiments still render |  |  |
| DSH-01 | Dashboard detail | Updated algorithms render correctly in experiment detail page |  |  |
| DSH-02 | Dashboard compare | Updated algorithms render correctly in compare view |  |  |
| UX-01 | UI integrity | No blank result cards for supported algorithms |  |  |
| UX-02 | Responsive | No major layout breakage on desktop/mobile |  |  |
| UX-03 | Console | No new console errors during algorithm result rendering |  |  |

### Optional run metadata
- QA date:
- Tester:
- Branch/commit:
- Backend version:
- Frontend version:
- Dataset(s) used:
