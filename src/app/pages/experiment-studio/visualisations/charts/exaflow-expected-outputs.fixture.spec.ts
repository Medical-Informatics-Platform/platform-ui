/**
 * First non-empty `output` of exaflow's tests/prod_env_tests/expected/<name>_expected.json, one per
 * algorithm (svm_scikit → linear_svm), with the Pearson/PCA/SVM matrices trimmed. These are the reference
 * implementations' shapes, so they pin the field spellings the builders must accept (p_value, eigen_vals, …).
 * Regenerate by re-extracting from exaflow when those files change.
 */
export const EXAFLOW_EXPECTED_OUTPUTS: Record<string, any> = {
  "anova_oneway": {
    "n_obs": 80,
    "df_residual": 77.0,
    "df_explained": 2.0,
    "ss_residual": 215.27401641816294,
    "ss_explained": 10.806698318712023,
    "ms_residual": 2.7957664469891292,
    "ms_explained": 5.4033491593560115,
    "p_value": 0.151716110762142,
    "f_stat": 1.9326897513828776,
    "tuckey_test": [
      {
        "groupA": "GENPD",
        "groupB": "HC",
        "meanA": 18.20196451612903,
        "meanB": 18.854574999999997,
        "diff": -0.6526104838709657,
        "se": 0.6630662261740115,
        "t_stat": -0.9842312247399827,
        "p_tuckey": 0.5828104416024291
      },
      {
        "groupA": "GENPD",
        "groupB": "PD",
        "meanA": 18.20196451612903,
        "meanB": 18.972365853658538,
        "diff": -0.7704013375295062,
        "se": 0.3979641189294889,
        "t_stat": -1.9358562766961551,
        "p_tuckey": 0.13558020085709954
      },
      {
        "groupA": "HC",
        "groupB": "PD",
        "meanA": 18.854574999999997,
        "meanB": 18.972365853658538,
        "diff": -0.11779085365854058,
        "se": 0.6462663780593583,
        "t_stat": -0.18226362635829668,
        "p_tuckey": 0.9
      }
    ]
  },
  "anova_twoway": {
    "sum_sq": {
      "dataset": 0.013005164893577614,
      "neurodegenerativescategories": 0.1250898940561127,
      "dataset:neurodegenerativescategories": 0.22911866180356544,
      "Residuals": 5.468515188422908
    },
    "df": {
      "dataset": 2,
      "neurodegenerativescategories": 1,
      "dataset:neurodegenerativescategories": 2,
      "Residuals": 146
    },
    "f_stat": {
      "dataset": 0.17360782671702907,
      "neurodegenerativescategories": 3.339686167619376,
      "dataset:neurodegenerativescategories": 3.0585381470767885,
      "Residuals": 0.0
    },
    "f_pvalue": {
      "dataset": 0.8407997831880671,
      "neurodegenerativescategories": 0.06966931446549357,
      "dataset:neurodegenerativescategories": 0.04997659792330294,
      "Residuals": 0.0
    }
  },
  "binned_mann_whitney_u_test": {
    "u_stat": 163.5,
    "p_value": 8.436804884099734e-06,
    "z_score": 4.4537889144455,
    "n1": 15,
    "n2": 80
  },
  "chi_squared": {
    "chi2": 0.1345461603613779,
    "p_value": 0.7137642211748703,
    "dof": 1,
    "expected": [
      [
        6.885245901639344,
        8.114754098360656
      ],
      [
        21.114754098360656,
        24.885245901639344
      ]
    ]
  },
  "fisher_exact": {
    "odds_ratio": 1.4857142857142858,
    "p_value": 0.5609700785123689
  },
  "histogram": {
    "histogram": [
      {
        "var": "leftptplanumtemporale",
        "grouping_var": null,
        "grouping_enum": null,
        "bins": [
          0.26866,
          0.42438200000000004,
          0.580104,
          0.735826,
          0.891548,
          1.0472700000000001,
          1.202992,
          1.358714,
          1.514436,
          1.6701579999999998,
          1.8258800000000002,
          1.981602,
          2.137324,
          2.293046,
          2.4487680000000003,
          2.60449,
          2.760212,
          2.915934,
          3.071656,
          3.2273780000000003,
          3.3831
        ],
        "counts": [
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          51,
          131,
          250,
          280,
          275,
          180,
          97,
          66,
          16,
          12,
          null,
          null,
          null
        ]
      }
    ]
  },
  "linear_regression": {
    "dependent_var": "rightocpoccipitalpole",
    "n_obs": 1407,
    "df_resid": 1402.0,
    "df_model": 4.0,
    "rse": 0.40038889969380076,
    "r_squared": 0.3044878618013195,
    "r_squared_adjusted": 0.30250351903898365,
    "f_stat": 153.4451948427044,
    "f_pvalue": 6.12240830657532e-109,
    "indep_vars": [
      "Intercept",
      "rightgregyrusrectus",
      "leftthalamusproper",
      "leftcerebralwhitematter",
      "rightangangulargyrus"
    ],
    "coefficients": [
      0.748106481855068,
      0.2953662008207109,
      0.05116051005157933,
      0.0015757605308245482,
      0.08663158192261686
    ],
    "std_err": [
      0.09045857129349832,
      0.05288058535669336,
      0.015977805797010424,
      0.0005449749118396,
      0.012113641349696821
    ],
    "t_stats": [
      8.270155842145584,
      5.585531983588849,
      3.201973456277199,
      2.8914368287256766,
      7.151572299503902
    ],
    "pvalues": [
      3.073122227580554e-16,
      2.7946254807018753e-08,
      0.0013955342465125733,
      0.0038939726962219875,
      1.376973361328016e-12
    ],
    "lower_ci": [
      0.570657748518602,
      0.1916326048169616,
      0.01981752773786987,
      0.0005067064166232121,
      0.06286876671496126
    ],
    "upper_ci": [
      0.925555215191534,
      0.39909979682446023,
      0.08250349236528878,
      0.0026448146450258844,
      0.11039439713027245
    ]
  },
  "logistic_regression": {
    "n_obs": 77,
    "coefficients": [
      -19.869661716924025,
      1.778978132402029,
      0.30572778361895925,
      -0.12995801708997404,
      2.65941923722343,
      2.7944302584679646
    ],
    "stderr": [
      5.486973244502092,
      3.641531265252168,
      1.871229681840415,
      1.6981930326625496,
      2.746208593152809,
      1.1118316091956972
    ],
    "lower_ci": [
      -30.623931660283013,
      -5.358291996068794,
      -3.361814999590598,
      -3.458355199905423,
      -2.7230506993904857,
      0.6152803475711854
    ],
    "upper_ci": [
      -9.115391773565037,
      8.916248260872852,
      3.9732705668285164,
      3.1984391657254747,
      8.041889173837346,
      4.973580169364744
    ],
    "z_scores": [
      -3.6212426836295006,
      0.4885247448998186,
      0.16338335511986218,
      -0.07652723488460937,
      0.9683966628952466,
      2.513357450315219
    ],
    "pvalues": [
      0.0002931913244805308,
      0.6251782028693817,
      0.8702166074779354,
      0.9389996471980624,
      0.3328463054584536,
      0.011958809680879612
    ],
    "df_model": 5,
    "df_resid": 71,
    "r_squared_cs": 0.0,
    "r_squared_mcf": 0.3375546896131183,
    "ll0": -46.95151200272644,
    "ll": -31.102808941779518,
    "aic": 74.20561788355903,
    "bic": 88.26845041468114
  },
  "logistic_regression_cv": {
    "accuracy": [
      0.8309859154929577,
      0.6857142857142857,
      0.7285714285714285
    ],
    "recall": [
      0.72,
      0.3333333333333333,
      0.4166666666666667
    ],
    "precision": [
      0.782608695652174,
      0.5714285714285714,
      0.6666666666666666
    ],
    "fscore": [
      0.7499999999999999,
      0.4210526315789474,
      0.5128205128205129
    ],
    "auc": [
      0.86,
      0.779891304347826,
      0.806159420289855
    ]
  },
  "outlier_report": {
    "status_code": 200,
    "variables": [
      "lefthippocampus"
    ],
    "datasets": [
      "desd-synthdata8"
    ],
    "records": [
      {
        "variable": "lefthippocampus",
        "dataset": "desd-synthdata8",
        "strategy": "iqr",
        "tail": "both",
        "fold": 1.5
      }
    ]
  },
  "pca": {
    "n_obs": 1409,
    "eigen_vals": [
      11.791955596812905,
      1.4014906291004505,
      1.1757759043863338,
      0.7662397217427525,
      0.6877465166180827
    ],
    "eigen_vecs": [
      [
        -0.19709091206467833,
        -0.23736782592410696,
        -0.21884548254629793,
        -0.2292233773080447,
        -0.18088747177599082,
        -0.22241064361544957
      ],
      [
        0.3476653525634176,
        0.22625289040849955,
        0.2811875003038455,
        -0.22174654476031586,
        0.08527168627543995,
        -0.2643331527048103
      ],
      [
        0.15875910055149528,
        -0.07918947533610042,
        -0.03230663404316607,
        0.1390551967483854,
        0.14930252731635665,
        -0.013344036854875636
      ],
      [
        0.0904926170859982,
        0.006470727115709006,
        0.20562653617710888,
        -0.009595589899893299,
        -0.6102759187820811,
        0.21821588537404255
      ],
      [
        0.37387318590136376,
        -0.27462989295118606,
        0.0047083163025245425,
        -0.08471931045054724,
        0.3815699140694139,
        0.09607337547067477
      ]
    ]
  },
  "pearson_correlation": {
    "n_obs": 1878,
    "correlations": {
      "variables": [
        "rightsplsuperiorparietallobule",
        "rightttgtransversetemporalgyrus",
        "leftcaudate",
        "leftocpoccipitalpole"
      ],
      "rightsplsuperiorparietallobule": [
        0.9999999999999999,
        0.5264951203862752,
        0.5885551801787721,
        0.5363942959939499
      ],
      "rightttgtransversetemporalgyrus": [
        0.5264951203862752,
        1.0,
        0.5054848127887012,
        0.5051943510769471
      ],
      "leftcaudate": [
        0.5885551801787721,
        0.5054848127887012,
        0.9999999999999999,
        0.46283490669678906
      ],
      "leftocpoccipitalpole": [
        0.5363942959939499,
        0.5051943510769471,
        0.46283490669678906,
        1.0
      ]
    },
    "p-values": {
      "variables": [
        "rightsplsuperiorparietallobule",
        "rightttgtransversetemporalgyrus",
        "leftcaudate",
        "leftocpoccipitalpole"
      ],
      "rightsplsuperiorparietallobule": [
        0.0,
        2.0133405639915575e-134,
        1.8175452445919755e-175,
        2.1002815002564414e-140
      ],
      "rightttgtransversetemporalgyrus": [
        2.0133405639915575e-134,
        0.0,
        2.3005215370599444e-122,
        3.331775315541941e-122
      ],
      "leftcaudate": [
        1.8175452445919755e-175,
        2.3005215370599444e-122,
        0.0,
        2.473440987846338e-100
      ],
      "leftocpoccipitalpole": [
        2.1002815002564414e-140,
        3.331775315541941e-122,
        2.473440987846338e-100,
        0.0
      ]
    },
    "low_confidence_intervals": {
      "variables": [
        "rightsplsuperiorparietallobule",
        "rightttgtransversetemporalgyrus",
        "leftcaudate",
        "leftocpoccipitalpole"
      ],
      "rightsplsuperiorparietallobule": [
        0.9999999999999999,
        0.5255103471099025,
        0.5876646123513316,
        0.5354238448201938
      ],
      "rightttgtransversetemporalgyrus": [
        0.5255103471099025,
        1.0,
        0.5044705278970306,
        0.5041796666363998
      ],
      "leftcaudate": [
        0.5876646123513316,
        0.5044705278970306,
        0.9999999999999999,
        0.46176441868625323
      ],
      "leftocpoccipitalpole": [
        0.5354238448201938,
        0.5041796666363998,
        0.46176441868625323,
        1.0
      ]
    },
    "high_confidence_intervals": {
      "variables": [
        "rightsplsuperiorparietallobule",
        "rightttgtransversetemporalgyrus",
        "leftcaudate",
        "leftocpoccipitalpole"
      ],
      "rightsplsuperiorparietallobule": [
        0.9999999999999999,
        0.5274784828986449,
        0.5894443219347599,
        0.5373633308008474
      ],
      "rightttgtransversetemporalgyrus": [
        0.5274784828986449,
        1.0,
        0.5064977025838787,
        0.5062076406728576
      ],
      "leftcaudate": [
        0.5894443219347599,
        0.5064977025838787,
        0.9999999999999999,
        0.46390404646085087
      ],
      "leftocpoccipitalpole": [
        0.5373633308008474,
        0.5062076406728576,
        0.46390404646085087,
        1.0
      ]
    }
  },
  "standardized_mean_difference": {
    "comparisons": [
      {
        "group1": "desd-synthdata1",
        "group2": "edsd0",
        "smd": 0.6710643125735621
      },
      {
        "group1": "desd-synthdata1",
        "group2": "edsd2",
        "smd": 0.3537767422354016
      },
      {
        "group1": "desd-synthdata1",
        "group2": "edsd3",
        "smd": 0.011792013636213171
      },
      {
        "group1": "desd-synthdata1",
        "group2": "ppmi3",
        "smd": -0.5913434169268196
      },
      {
        "group1": "edsd0",
        "group2": "edsd2",
        "smd": -0.3150792809397736
      },
      {
        "group1": "edsd0",
        "group2": "edsd3",
        "smd": -0.6509274242791167
      },
      {
        "group1": "edsd0",
        "group2": "ppmi3",
        "smd": -1.502242948685167
      },
      {
        "group1": "edsd2",
        "group2": "edsd3",
        "smd": -0.33272459683066496
      },
      {
        "group1": "edsd2",
        "group2": "ppmi3",
        "smd": -1.0126256427628888
      },
      {
        "group1": "edsd3",
        "group2": "ppmi3",
        "smd": -0.6208642436294063
      }
    ]
  },
  "linear_svm": {
    "n_obs": 1296,
    "coeff": [
      -8.737739953801338e-06,
      -8.582338750784402e-08,
      1.5781284140814478e-05,
      -2.2240308723553426e-06,
      1.0469008387303802e-05
    ]
  },
  "ttest_independent": {
    "statistic": -0.2367349582329612,
    "p_value": 0.4066399792157085,
    "df": 116.0,
    "mean_diff": -0.0097673026315781,
    "se_difference": 0.041258387457785164,
    "ci_upper": -0.017347045794432813,
    "ci_lower": -Infinity,
    "cohens_d": -0.0466408660497546
  },
  "ttest_onesample": {
    "n_obs": 269,
    "t_value": 174.1405149438201,
    "p_value": 0.0,
    "df": 268.0,
    "mean_diff": 4.649242750929368,
    "se_diff": 0.0367536474348665,
    "ci_upper": Infinity,
    "ci_lower": 4.633888419718254,
    "cohens_d": 10.61753458611538
  },
  "ttest_paired": {
    "t_stat": -66.57208151704455,
    "p_value": 0.0,
    "df": 711.0,
    "mean_diff": -0.5456903230337079,
    "se_diff": 0.008196984540644024,
    "ci_upper": -0.5303148784447442,
    "ci_lower": -Infinity,
    "cohens_d": -2.494894234972029
  }
};
