import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ExperimentStudioService } from './experiment-studio.service';
import { SessionStorageService } from './session-storage.service';
import { ErrorService } from './error.service';
import { DataModel } from '../models/data-model.interface';
import { AnalysisPreprocessingStep } from '../models/backend-algorithms.model';

describe('ExperimentStudioService', () => {
  let service: ExperimentStudioService;
  let httpMock: HttpTestingController;

  const mockRawAlgo = {
    name: 'mock_algo',
    label: 'Mock Algo',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['real'], required: true, max_count: 1 },
      x: { label: '', desc: '', types: ['real'] },
      filter: { label: '', desc: '', types: [], required: false, max_count: 1 }
    },
    parameters: {
      alpha: {
        label: 'Alpha',
        desc: '',
        types: ['real'],
        required: false,
        default_value: '0.05',
      },
    }
  };

  const mockHistogramAlgo = {
    name: 'histogram',
    label: 'Histogram',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['text'], required: true },
      x: { label: '', desc: '', types: ['text'] },
      filter: { label: '', desc: '', types: [] }
    },
    parameters: {}
  };

  const mockDescribeAlgo = {
    name: 'describe',
    label: 'Describe',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['real'], required: true },
      x: { label: '', desc: '', types: ['real'] },
      filter: { label: '', desc: '', types: [] }
    },
    parameters: {},
    preprocessing: [
      {
        name: 'missing_values_handler',
        label: 'Missing Values Handler',
        desc: '',
        order: 1,
        parameters: {}
      }
    ]
  };

  const mockOutlierReportAlgo = {
    name: 'outlier_report',
    label: 'Outlier Report',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['real'], required: true },
      x: { label: '', desc: '', types: ['real'], required: false },
      filter: { label: '', desc: '', types: [], required: false, max_count: 1 },
    },
    parameters: {},
  };

  const mockLinearSvmAlgo = {
    name: 'linear_svm',
    label: 'Linear SVM',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['real'], required: true },
      x: { label: '', desc: '', types: ['real'], required: true },
      filter: { label: '', desc: '', types: [], required: false, max_count: 1 },
    },
    parameters: {},
  };

  const mockKmeansAlgo = {
    name: 'kmeans',
    label: 'K-means',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: 'Variables', desc: '', types: ['real', 'int'], required: true },
      filter: { label: '', desc: '', types: [] },
    },
    parameters: {
      k_selection: {
        label: 'K selection',
        types: ['text'],
        required: true,
        default: 'manual',
        enums: { type: 'list', source: ['manual', 'elbow'] },
      },
      k: { label: 'Number of clusters', types: ['int'], required: false, default: 4 },
      maxiter: { label: 'Maximum iterations', types: ['int'], required: true, default: 100 },
      tol: { label: 'Convergence tolerance', types: ['real'], required: true, default: 0.0001 },
    },
  };

  const mockInputdataSpec = {
    data_model: { label: '', desc: '', types: ['text'], required: true },
    datasets: { label: '', desc: '', types: ['text'], required: true },
    filters: { label: '', desc: '', types: ['jsonObject'], required: false },
    variables: { label: '', desc: '', types: ['real', 'int', 'text'], required: true, min_count: 1 },
  };

  function toAlgorithmSpec(mock: any) {
    return {
      name: mock.name,
      label: mock.label,
      desc: mock.desc,
      type: mock.type,
      flags: mock.flags,
      y: mock.inputdata.y,
      x: mock.inputdata.x,
      requires_validation_datasets: false,
      parameters: mock.parameters ?? {},
      required_preprocessing: [],
    };
  }

  function preprocessingSteps(config: Record<string, unknown> | null): AnalysisPreprocessingStep[] | null {
    if (!config) return null;
    return Object.entries(config).map(([name, parameters]) => ({
      name,
      parameters: parameters as Record<string, unknown>,
    }));
  }

  function flushSpecifications(algorithms: any[], preprocessing: any[] = []) {
    httpMock.expectOne('/services/specifications/inputdata').flush(mockInputdataSpec);
    httpMock.expectOne('/services/specifications/preprocessing').flush(preprocessing);
    httpMock.expectOne('/services/specifications/algorithms').flush(algorithms);
  }

  const mockDataModel: DataModel = {
    uuid: 'dm-uuid',
    code: 'dm',
    version: '1',
    label: 'Data Model',
    variables: [
      { code: 'age', label: 'Age', type: 'real' } as any,
      { code: 'sex', label: 'Sex', type: 'nominal' } as any,
      { code: 'site', label: 'Site', type: 'nominal' } as any,
    ],
    groups: [],
    datasets: ['ds1'],
    released: true,
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [provideZonelessChangeDetection(), SessionStorageService, ErrorService]
    });

    service = TestBed.inject(ExperimentStudioService);
    httpMock = TestBed.inject(HttpTestingController);

    flushSpecifications([
      toAlgorithmSpec(mockRawAlgo),
      toAlgorithmSpec(mockHistogramAlgo),
      toAlgorithmSpec(mockDescribeAlgo),
      toAlgorithmSpec(mockOutlierReportAlgo),
      toAlgorithmSpec(mockLinearSvmAlgo),
      toAlgorithmSpec(mockKmeansAlgo),
    ]);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });


  it('builds request body for histogram with active data model and datasets', () => {
    // Arrange
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    // Act
    const body = service.buildRequestBody('histogram', ['var1']);

    // Assert
    expect(body.analysis.algorithm.name).toBe('histogram');
    expect(body.analysis.inputdata.data_model).toBe('dm:1');
    expect(body.analysis.inputdata.datasets).toEqual(['ds1']);
    expect(body.analysis.algorithm.y).toEqual(['var1']);
    expect(body.analysis.inputdata.variables).toEqual(['var1']);
    expect(body.analysis.inputdata.filters).toBeNull();
    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { var1: 'drop' },
      },
    }));
    expect(body.analysis.algorithm.parameters).toEqual({ histogram_type: 'wilkinson' });
    expect(body.mipVersion).toBeUndefined();
  });

  it('includes a previewed histogram variable in inputdata.variables when the pool is empty', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    const body = service.buildRequestBody('histogram', ['inr']);

    expect(body.analysis.algorithm.y).toEqual(['inr']);
    expect(body.analysis.inputdata.variables).toEqual(['inr']);
  });

  it('unions the previewed histogram variable with existing pool CDEs', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'age', label: 'Age' }]);

    const body = service.buildRequestBody('histogram', ['inr']);

    expect(body.analysis.inputdata.variables).toEqual(['age', 'inr']);
    expect(body.analysis.algorithm.y).toEqual(['inr']);
  });

  it('does not apply stored descriptive preprocessing to histogram preview requests without an override', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setAppliedDescriptivePreprocessing({
      missing_values_handler: {
        strategies: { var1: 'mean' },
      },
    });

    const body = service.buildRequestBody('histogram', ['var1']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { var1: 'drop' },
      },
    }));
  });

  it('uses an explicit preprocessing override for histogram preview requests', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { var1: 'median' },
      },
    };

    const body = service.buildRequestBody('histogram', ['var1'], null, null, null, null, applied);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(applied));
  });

  it('filters applied descriptive preprocessing to histogram y variables only', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'drop', sex: 'drop' },
      },
      outlier_winsorizer: {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    };

    const body = service.buildRequestBody('histogram', ['age'], null, null, null, null, applied);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { age: 'drop' },
      },
      outlier_winsorizer: {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    }));
  });

  it('skips preprocessing for histogram preview when override is explicitly null', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setAppliedDescriptivePreprocessing({
      missing_values_handler: {
        strategies: { var1: 'mean' },
      },
    });

    const body = service.buildRequestBody('histogram', ['var1'], null, null, null, null, null);

    expect(body.analysis.preprocessing).toBeNull();
  });

  it('does not send validation_datasets for histogram when inputdata spec includes validation_datasets slot', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const histogram = service.backendAlgorithms()['histogram'];
    service.backendAlgorithms.set({
      ...service.backendAlgorithms(),
      histogram: {
        ...histogram,
        requires_validation_datasets: false,
        inputdata: {
          ...histogram.inputdata,
          validation_datasets: { label: '', desc: '', types: ['text'], required: false },
        },
      },
    });

    const body = service.buildRequestBody('histogram', ['var1']);

    expect(body.analysis.inputdata.validation_datasets).toBeNull();
  });

  it('builds spec-driven inputdata with array roles and validation datasets', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.backendAlgorithms.set({
      validation_algo: {
        name: 'validation_algo',
        label: 'Validation Algo',
        description: '',
        requiredVariable: [],
        covariate: [],
        category: 'Mock',
        configSchema: [],
        isDisabled: false,
        requires_validation_datasets: true,
        inputdata: {
          data_model: { label: '', desc: '', types: [] },
          datasets: { label: '', desc: '', types: [] },
          validation_datasets: { label: '', desc: '', types: [] },
          y: { label: '', desc: '', types: ['real'], max_count: 1 },
          x: { label: '', desc: '', types: ['real'] },
          filter: { label: '', desc: '', types: [] },
        },
      } as any,
    });

    service.setVariables([
      { code: 'y1', label: 'Y1', type: 'real' } as any,
      { code: 'x1', label: 'X1', type: 'real' } as any,
    ]);

    const body = service.buildRequestBody('validation_algo', ['y1'], ['x1']);

    expect(body.analysis.inputdata).toEqual(jasmine.objectContaining({
      data_model: 'dm:1',
      datasets: ['ds1'],
      validation_datasets: ['ds1'],
      variables: ['y1', 'x1'],
      filters: null,
    }));
    expect(body.analysis.algorithm).toEqual(jasmine.objectContaining({
      y: ['y1'],
      x: ['x1'],
    }));
  });

  it('adds default drop preprocessing for non-describe algorithm requests', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    const body = service.buildRequestBody('mock_algo', ['var1'], ['cov1']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: {
          var1: 'drop',
          cov1: 'drop',
        },
      },
    }));
  });

  it('does not add default preprocessing for describe requests', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    const body = service.buildRequestBody('describe', ['var1']);

    expect(body.analysis.preprocessing).toBeNull();
  });

  it('does not add default preprocessing for outlier_report requests', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'age', label: 'Age', type: 'real' } as any]);

    const body = service.buildRequestBody('outlier_report', ['age']);

    expect(body.analysis.algorithm.name).toBe('outlier_report');
    expect(body.analysis.preprocessing).toBeNull();
  });

  it('excludes histogram, describe, outlier_report, and linear_svm from the algorithm picker', () => {
    const grouped = service.availableGroupedAlgorithms();
    const names = Object.values(grouped).flat().map((algo) => algo.name);

    expect(names).toContain('mock_algo');
    expect(names).not.toContain('histogram');
    expect(names).not.toContain('histogram_sql');
    expect(names).not.toContain('describe');
    expect(names).not.toContain('outlier_report');
    expect(names).not.toContain('linear_svm');
    expect(names).not.toContain('cox_regression_stacked');
  });

  it('attaches structured availability details to grouped algorithms', () => {
    const grouped = service.availableGroupedAlgorithms();
    const mock = Object.values(grouped).flat().find((algo) => algo.name === 'mock_algo');

    expect(mock?.isDisabled).toBeTrue();
    expect(mock?.availability?.available).toBeFalse();
    expect(mock?.availability?.summary).toBe('Outcome needs at least 1 (none assigned).');
    expect(mock?.availability?.details.find((detail) => detail.role === 'y')).toEqual(jasmine.objectContaining({
      label: 'Outcome',
      minCount: 1,
      selectedCount: 0,
      satisfied: false,
    }));
  });


  it('keeps the selected algorithm when current selections make it unavailable', () => {
    service.setAlgorithmY([{ code: 'age', label: 'Age', type: 'real' } as any]);
    const selected = service.backendAlgorithms()['mock_algo'];
    service.selectedAlgorithm.set(selected);

    expect(service.isAlgorithmAvailable('mock_algo')).toBeTrue();

    service.setAlgorithmY([]);

    expect(service.isAlgorithmAvailable('mock_algo')).toBeFalse();
    expect(service.selectedAlgorithm()?.name).toBe('mock_algo');
  });

  it('sends raw descriptive overview requests without preprocessing', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    service.loadDescriptiveOverview(['age']).subscribe();

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.analysis.algorithm.name).toBe('describe');
    expect(req.request.body.analysis.preprocessing).toBeNull();
    req.flush({ result: { featurewise: [] } });
  });

  it('keeps the cohort filter out of the step 0 source snapshot only', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    // A filter on a CDE that is not in the variable pool.
    service.setFilterLogic({ condition: 'AND', rules: [{ field: 'site', operator: 'equal', value: 'A' }] } as any);

    service.loadDescriptiveOverview(['age']).subscribe();
    const rawReq = httpMock.expectOne('/services/experiments/transient');
    expect(rawReq.request.body.analysis.inputdata.filters).not.toBeNull();
    expect(rawReq.request.body.analysis.inputdata.variables).toContain('site');
    rawReq.flush({ result: { featurewise: [] } });

    // Step 0 describes the data as selected: no filter payload, and the filter
    // field is no longer dragged into the input pool.
    service.loadDescriptiveOverview(['age'], null, null, null).subscribe();
    const sourceReq = httpMock.expectOne('/services/experiments/transient');
    expect(sourceReq.request.body.analysis.inputdata.filters).toBeNull();
    expect(sourceReq.request.body.analysis.inputdata.variables).not.toContain('site');
    expect(sourceReq.request.body.analysis.preprocessing).toBeNull();
    sourceReq.flush({ result: { featurewise: [] } });
  });

  it('describes a filter override without touching the stored cohort', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const stored = { condition: 'AND', rules: [{ field: 'site', operator: 'equal', value: 'A' }] } as any;
    const pending = { condition: 'AND', rules: [{ field: 'score', operator: 'greater', value: 65 }] } as any;
    service.setFilterLogic(stored);

    // The Cohort Filtering preview sends what the editor holds, unapplied.
    service.loadDescriptiveOverview(['age'], null, null, pending).subscribe();
    const pendingReq = httpMock.expectOne('/services/experiments/transient');
    expect(pendingReq.request.body.analysis.inputdata.filters).toEqual(pending);
    expect(pendingReq.request.body.analysis.inputdata.variables).toContain('score');
    expect(pendingReq.request.body.analysis.inputdata.variables).not.toContain('site');
    pendingReq.flush({ result: { featurewise: [] } });

    // An explicit null is "no rules", not "fall back to the store".
    service.loadDescriptiveOverview(['age'], null, null, null).subscribe();
    const clearedReq = httpMock.expectOne('/services/experiments/transient');
    expect(clearedReq.request.body.analysis.inputdata.filters).toBeNull();
    expect(clearedReq.request.body.analysis.inputdata.variables).not.toContain('site');
    clearedReq.flush({ result: { featurewise: [] } });

    // Leaving the override alone keeps the stored cohort.
    service.loadDescriptiveOverview(['age']).subscribe();
    const storedReq = httpMock.expectOne('/services/experiments/transient');
    expect(storedReq.request.body.analysis.inputdata.filters).toEqual(stored);
    storedReq.flush({ result: { featurewise: [] } });

    // Previewing never writes the cohort.
    expect(service.filterLogic()).toEqual(stored);
  });

  it('plots a histogram preview on the overridden cohort', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setFilterLogic({ condition: 'AND', rules: [{ field: 'site', operator: 'equal', value: 'A' }] } as any);
    const pending = { condition: 'AND', rules: [{ field: 'score', operator: 'greater', value: 65 }] } as any;
    const defaultDrop = { missing_values_handler: { strategies: { var1: 'drop' } } };

    const body = service.buildRequestBody(
      'histogram',
      ['var1'],
      null,
      null,
      null,
      null,
      defaultDrop,
      pending
    );

    expect(body.analysis.inputdata.filters).toEqual(pending);
    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(defaultDrop));
  });

  it('forwards the cohort override from getAlgorithmResults to the transient request', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setFilterLogic({ condition: 'AND', rules: [{ field: 'site', operator: 'equal', value: 'A' }] } as any);
    const pending = { condition: 'AND', rules: [{ field: 'score', operator: 'greater', value: 65 }] } as any;

    service.getAlgorithmResults(
      'histogram',
      ['var1'],
      null,
      { missing_values_handler: { strategies: { var1: 'drop' } } },
      pending
    ).subscribe();

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.analysis.inputdata.filters).toEqual(pending);
    req.flush({ result: { histogram: [] } });
  });

  it('sends processed descriptive overview requests with explicit preprocessing', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const preprocessing = {
      missing_values_handler: {
        strategies: { age: 'mean' },
      },
    };

    service.loadDescriptiveOverview(['age'], preprocessing).subscribe();

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.analysis.preprocessing).toEqual(preprocessingSteps(preprocessing));
    req.flush({ result: { featurewise: [] } });
  });

  it('does not use descriptive preview preprocessing in algorithm requests until it is stored as applied', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    service.loadDescriptiveOverview(['age'], {
      missing_values_handler: {
        strategies: { age: 'mean' },
      },
    }).subscribe();
    const previewReq = httpMock.expectOne('/services/experiments/transient');
    previewReq.flush({ result: { featurewise: [] } });

    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { age: 'drop' },
      },
    }));
  });

  it('uses applied descriptive preprocessing for later algorithm requests', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'median' },
      },
    };

    service.setAppliedDescriptivePreprocessing(applied);
    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(applied));
  });

  it('uses applied descriptive preprocessing with multiple preprocessing steps for later algorithm requests', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'drop', sex: 'drop' },
      },
      longitudinal_transformer: {
        visit1: 'BL',
        visit2: 'FL1',
        strategies: {
          age: 'diff',
          sex: 'first',
        },
      },
    };

    service.setAppliedDescriptivePreprocessing(applied);
    const body = service.buildRequestBody('mock_algo', ['age'], ['sex']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(applied));
  });

  it('forwards applied outlier preprocessing together with missing values', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'drop' },
      },
      outlier_winsorizer: {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    };

    service.setAppliedDescriptivePreprocessing(applied);
    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(applied));
  });

  it('summarizes preprocessing with variable labels and human-readable actions', () => {
    const summary = service.formatPreprocessingConfig({
      missing_values_handler: {
        strategies: { gender: 'drop', subjectageyears: 'drop' },
      },
      longitudinal_transformer: {
        visit1: 'BL',
        visit2: 'FL1',
        strategies: {
          gender: 'first',
          subjectageyears: 'diff',
        },
      },
    }, {
      gender: 'Gender',
      subjectageyears: 'Subject Age Years',
    });

    expect(summary).toBe(
      'Missing values: Gender: remove rows, Subject Age Years: remove rows\nLongitudinal transformation: Gender: use first visit, Subject Age Years: difference between visits (BL to FL1)'
    );
    expect(service.formatPreprocessingEntries({
      missing_values_handler: {
        strategies: { gender: 'drop' },
      },
    }, { gender: 'Gender' })).toEqual([
      { label: 'Missing values', value: 'Gender: remove rows' },
    ]);
  });

  it('summarizes outlier winsorizer preprocessing explicitly', () => {
    const summary = service.formatPreprocessingConfig({
      outlier_winsorizer: {
        strategies: { age: 'iqr', bmi: 'quantile' },
        tails: { age: 'both', bmi: 'right' },
        folds: { age: 1.5, bmi: 0.05 },
      },
    }, {
      age: 'Age',
      bmi: 'BMI',
    });

    expect(summary).toBe(
      'Outlier winsorizer: Age: IQR, both tails, fold 1.5; BMI: Quantile, right tail, fold 0.05'
    );
  });

  it('loads outlier report previews with outlier parameters and upstream missing preprocessing', (done) => {
    service.selectedDataModel.set(mockDataModel);
    service.setVariables([
      { code: 'age', label: 'Age', type: 'real' } as any,
      { code: 'bmi', label: 'BMI', type: 'real' } as any,
    ]);
    service.setAlgorithmY([{ code: 'age', label: 'Age', type: 'real' } as any]);
    service.setAlgorithmX([{ code: 'bmi', label: 'BMI', type: 'real' } as any]);

    service.loadOutlierReportPreview(
      ['age', 'bmi'],
      {
        strategies: { age: 'iqr', bmi: 'quantile' },
        tails: { age: 'both', bmi: 'right' },
        folds: { age: 1.5, bmi: 0.05 },
      },
      {
        missing_values_handler: {
          strategies: { age: 'median' },
        },
      }
    ).subscribe((response) => {
      expect(response.result.featurewise).toEqual([]);
      done();
    });

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.analysis.algorithm).toEqual(jasmine.objectContaining({
      name: 'outlier_report',
      y: ['age'],
      x: ['bmi'],
      parameters: {
        strategies: { age: 'iqr', bmi: 'quantile' },
        tails: { age: 'both', bmi: 'right' },
        folds: { age: 1.5, bmi: 0.05 },
      },
    }));
    expect(req.request.body.analysis.inputdata).toEqual(jasmine.objectContaining({
      data_model: 'dm:1',
      datasets: [],
      filters: null,
      variables: jasmine.arrayContaining(['age', 'bmi']),
    }));
    expect(req.request.body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { age: 'median' },
      },
    }));
    req.flush({ featurewise: [] });
  });

  it('keeps nominal variables and numeric covariates in distinct outlier report input roles', (done) => {
    service.selectedDataModel.set(mockDataModel);
    service.setVariables([{ code: 'age', label: 'Age', type: 'real' } as any]);
    service.setAlgorithmY([{ code: 'sex', label: 'Sex', type: 'nominal' } as any]);
    service.setAlgorithmX([{ code: 'age', label: 'Age', type: 'real' } as any]);

    service.loadOutlierReportPreview(
      ['age'],
      {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    ).subscribe((response) => {
      expect(response.result.featurewise).toEqual([]);
      done();
    });

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.analysis.inputdata).toEqual(jasmine.objectContaining({
      data_model: 'dm:1',
      datasets: [],
      filters: null,
      variables: ['age'],
    }));
    expect(req.request.body.analysis.algorithm).toEqual(jasmine.objectContaining({
      y: ['age'],
      x: null,
    }));
    req.flush({ featurewise: [] });
  });

  it('sends covariate-only outlier report codes through y only', (done) => {
    service.selectedDataModel.set(mockDataModel);
    service.setVariables([{ code: 'age', label: 'Age', type: 'real' } as any]);
    service.setAlgorithmX([{ code: 'age', label: 'Age', type: 'real' } as any]);

    service.loadOutlierReportPreview(
      ['age'],
      {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    ).subscribe((response) => {
      expect(response.result.featurewise).toEqual([]);
      done();
    });

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.analysis.algorithm).toEqual(jasmine.objectContaining({
      y: ['age'],
      x: null,
    }));
    req.flush({ featurewise: [] });
  });

  it('resetStudioStateForGuide restores the default pathology after clearing guide progress', () => {
    const defaultModel: DataModel = {
      ...mockDataModel,
      code: 'stroke',
      label: 'Stroke',
    };
    const alternateModel: DataModel = {
      ...mockDataModel,
      code: 'alternate',
      label: 'Alternate',
    };

    service.crossSectionalModels.set([defaultModel]);
    service.longitudinalModels.set([alternateModel]);
    service.selectedDataModel.set(alternateModel);
    service.setVariables([{ code: 'v1', label: 'V1' } as any]);

    service.resetStudioStateForGuide();

    expect(service.selectedVariables()).toEqual([]);
    expect(service.selectedDataModel()).toEqual(defaultModel);
    expect(service.selectedDatasets()).toEqual(['ds1']);
  });

  it('preselectAllDatasetsForModel selects every dataset enumeration for the pathology', () => {
    const model: DataModel = {
      ...mockDataModel,
      variables: [
        {
          code: 'dataset',
          label: 'Dataset',
          type: 'nominal',
          enumerations: [
            { code: 'ds-a', label: 'Dataset A' },
            { code: 'ds-b', label: 'Dataset B' },
          ],
        } as any,
      ],
      datasets: ['ds-a', 'ds-b'],
    };

    service.preselectAllDatasetsForModel(model);

    expect(service.availableDatasets().map((dataset) => dataset.code)).toEqual(['ds-a', 'ds-b']);
    expect(service.selectedDatasets()).toEqual(['ds-a', 'ds-b']);
  });

  it('clears variables once when datasets become empty, without retriggering', () => {
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'age', label: 'Age' } as any]);
    service.setAlgorithmY([{ code: 'age', label: 'Age' } as any]);

    const warn = spyOn(console, 'warn');
    service.setSelectedDatasets([]);
    TestBed.flushEffects();

    expect(service.selectedVariables()).toEqual([]);
    expect(service.algorithmY()).toEqual([]);
    const resetWarnings = warn.calls.allArgs().filter((args) =>
      String(args[0]).includes('No datasets selected')
    );
    expect(resetWarnings.length).toBe(1);
  });

  it('resetStudioState clears selections and errors', () => {
    const errorService = TestBed.inject(ErrorService);

    // Arrange
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'v1', label: 'V1' } as any]);
    errorService.setError('Oops');

    // Act
    service.resetStudioState();

    // Assert
    expect(service.selectedDataModel()).toBeNull();
    expect(service.selectedDatasets()).toEqual([]);
    expect(service.selectedVariables()).toEqual([]);
    expect(errorService.error()).toBeNull();
  });

  it('returns null from runSelectedAlgorithm when no algorithm is selected', () => {
    // Act
    const result = service.runSelectedAlgorithm();

    // Assert
    expect(result).toBeNull();
  });

  it('keeps an algorithm available when multiple filter variables are selected', () => {
    service.setAlgorithmY([{ code: 'age', label: 'Age', type: 'real' } as any]);
    service.setFilters([
      { code: 'age', label: 'Age', type: 'real' } as any,
      { code: 'event_type', label: 'Event Type', type: 'text' } as any,
    ]);

    expect(service.isAlgorithmAvailable('mock_algo')).toBeTrue();
  });

  it('coerces numeric parameter strings before building request payloads', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.algorithmConfigurations.set({
      mock_algo: { alpha: '0.05' },
    });

    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.analysis.algorithm.parameters.alpha).toBe(0.05);
  });

  it('keeps enum select parameter strings even when their schema type is int', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const algo = service.backendAlgorithms()['mock_algo'];
    service.backendAlgorithms.set({
      ...service.backendAlgorithms(),
      mock_algo: {
        ...algo,
        configSchema: [
          ...algo.configSchema,
          {
            key: 'positive_class',
            label: 'Positive class (y=1)',
            type: 'select',
            types: ['int'],
            enumType: 'input_var_CDE_enums',
            enumSource: ['y'],
            options: [
              { code: '0', label: '0' },
              { code: '1', label: '1' },
              { code: '9', label: '9' },
            ],
          },
        ],
      },
    });
    service.algorithmConfigurations.set({
      mock_algo: { positive_class: '1' },
    });

    const body = service.buildRequestBody('mock_algo', ['acute_treat_evt']);

    expect(body.analysis.algorithm.parameters.positive_class).toBe('1');
  });

  it('omits unset positive_class from experiment request parameters', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.algorithmConfigurations.set({
      mock_algo: { alpha: 0.05 },
    });

    const body = service.buildRequestBody('mock_algo', ['acute_treat_evt']);

    expect(body.analysis.algorithm.parameters.positive_class).toBeUndefined();
    expect(body.analysis.algorithm.parameters.alpha).toBe(0.05);
  });

  it('builds binned Mann-Whitney requests with group enum codes and missing-value preprocessing', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.backendAlgorithms.set({
      ...service.backendAlgorithms(),
      binned_mann_whitney_u_test: {
        name: 'binned_mann_whitney_u_test',
        label: 'Binned Mann-Whitney U Test',
        description: '',
        inputdata: {
          y: { label: 'Outcome', desc: '', types: ['real', 'int'], required: true, max_count: 1 },
          x: { label: 'Grouping variable', desc: '', types: ['text'], stattypes: ['nominal'], required: true, max_count: 1 },
        },
        configSchema: [
          { key: 'alt_hypothesis', label: 'Alternative hypothesis', type: 'select', options: ['two-sided', 'less', 'greater'], required: true },
          { key: 'groupA', label: 'Group A', type: 'select', types: ['text', 'int'], enumType: 'input_var_CDE_enums', enumSource: ['x'], required: true, options: [
            { code: '0', label: 'Control' },
            { code: '1', label: 'Case' },
          ] },
          { key: 'groupB', label: 'Group B', type: 'select', types: ['text', 'int'], enumType: 'input_var_CDE_enums', enumSource: ['x'], required: true, options: [
            { code: '0', label: 'Control' },
            { code: '1', label: 'Case' },
          ] },
          { key: 'num_bins', label: 'Number of bins', type: 'number', types: ['int'], required: false, default: 40, min: 2, max: 200 },
        ],
        requiredVariable: ['real', 'int'],
        covariate: ['text'],
        category: 'Statistical Tests',
        preprocessing: [],
        required_preprocessing: ['missing_values_handler'],
        isDisabled: false,
      } as any,
    });
    service.algorithmConfigurations.set({
      binned_mann_whitney_u_test: {
        alt_hypothesis: 'two-sided',
        groupA: 'Control',
        groupB: { code: '1', label: 'Case' },
        num_bins: '40',
      },
    });

    const body = service.buildRequestBody('binned_mann_whitney_u_test', ['age'], ['sex']);

    expect(body.analysis.algorithm.name).toBe('binned_mann_whitney_u_test');
    expect(body.analysis.algorithm.y).toEqual(['age']);
    expect(body.analysis.algorithm.x).toEqual(['sex']);
    expect(body.analysis.algorithm.parameters).toEqual({
      alt_hypothesis: 'two-sided',
      groupA: '0',
      groupB: '1',
      num_bins: 40,
    });
    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: {
          age: 'drop',
          sex: 'drop',
        },
      },
    }));
  });

  it('keeps enum multi-select parameter values as strings even when their schema type is int', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const algo = service.backendAlgorithms()['mock_algo'];
    service.backendAlgorithms.set({
      ...service.backendAlgorithms(),
      mock_algo: {
        ...algo,
        configSchema: [
          ...algo.configSchema,
          {
            key: 'category_order',
            label: 'Category order',
            type: 'multi-select',
            types: ['int'],
            enumType: 'input_var_CDE_enums',
            enumSource: ['y'],
            options: [
              { code: '0', label: '0' },
              { code: '1', label: '1' },
              { code: '9', label: '9' },
            ],
          },
        ],
      },
    });
    service.algorithmConfigurations.set({
      mock_algo: { category_order: ['0', '1', '9'] },
    });

    const body = service.buildRequestBody('mock_algo', ['acute_treat_evt']);

    expect(body.analysis.algorithm.parameters.category_order).toEqual(['0', '1', '9']);
  });

  it('hydrates edit state with filters and applied preprocessing from backend experiment', () => {
    const filters = {
      condition: 'AND' as const,
      rules: [
        {
          id: 'site',
          field: 'site',
          type: 'string' as const,
          input: 'select' as const,
          operator: 'equal',
          value: 'athens',
        },
      ],
      valid: true,
    };
    const preprocessing = {
      missing_values_handler: {
        strategies: {
          age: 'median',
          sex: 'drop',
        },
      },
    };

    service.hydrateFromBackendExperiment({
      uuid: 'exp-1',
      name: 'Saved experiment',
      created: '',
      finished: '',
      shared: true,
      viewed: false,
      status: 'success',
      analysis: {
        inputdata: {
          data_model: 'dm:1',
          datasets: ['ds1'],
          variables: ['age', 'sex'],
          filters,
        },
        preprocessing: preprocessingSteps(preprocessing)!,
        algorithm: {
          name: 'mock_algo',
          y: ['age'],
          x: ['sex'],
          parameters: { alpha: 0.01 },
        },
      },
      createdBy: {
        username: 'user',
        fullname: 'User',
        email: 'user@example.org',
        subjectId: 'subject',
        agreeNDA: true,
      },
    });

    const req = httpMock.expectOne('/services/data-models');
    req.flush([mockDataModel]);

    expect(service.selectedDataModel()?.code).toBe('dm');
    expect(service.selectedDatasets()).toEqual(['ds1']);
    // Pool holds the unified y + x CDEs.
    expect(service.selectedVariables().map((variable) => variable.code)).toEqual(['age', 'sex']);
    expect(service.algorithmY().map((variable) => variable.code)).toEqual(['age']);
    expect(service.algorithmX().map((variable) => variable.code)).toEqual(['sex']);
    expect(service.selectedFilters().map((variable) => variable.code)).toEqual(['site']);
    expect(service.filterLogic()).toEqual(filters);
    expect(service.algorithmConfigurations()['mock_algo']).toEqual({ alpha: 0.01 });
    expect(service.appliedPreprocessingConfig()).toEqual(preprocessing);
    expect(service.isShared()).toBeTrue();
  });

  it('keeps y/x roles separated from the pool when a variable is added to the pool', () => {
    service.setAlgorithmY([{ code: 'age', label: 'Age' }]);
    service.setAlgorithmX([{ code: 'sex', label: 'Sex' }]);

    // Adding a new pool item does not assign it to either role.
    service.setVariables([
      { code: 'age', label: 'Age' },
      { code: 'sex', label: 'Sex' },
      { code: 'bmi', label: 'BMI' },
    ]);

    expect(service.selectedVariables().map((v) => v.code)).toEqual(['age', 'sex', 'bmi']);
    expect(service.algorithmY().map((v) => v.code)).toEqual(['age']);
    expect(service.algorithmX().map((v) => v.code)).toEqual(['sex']);
  });

  it('exposes the created transformation column in the assignable pool but not in inputdata.variables', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'age', label: 'Age' }]);
    service.setAlgorithmY([{ code: 'age', label: 'Age' }]);
    service.setTransformationPreprocessing([{
      code: 'derived_col',
      rules: { A: {}, B: {} },
      default_enumeration: 'A',
    }]);
    service.setAlgorithmX([{ code: 'derived_col', label: 'derived_col' }]);

    const assignable = service.algorithmAssignableVariables();
    const created = assignable.find((v) => v.code === 'derived_col');
    expect(created).toBeTruthy();
    expect(created?.isCreatedColumn).toBeTrue();
    expect(created?.enumerations).toEqual([
      { code: 'A', label: 'A' },
      { code: 'B', label: 'B' },
    ]);

    const body = service.buildRequestBody('mock_algo');
    expect(body.analysis.algorithm.y).toEqual(['age']);
    expect(body.analysis.algorithm.x).toEqual(['derived_col']);
    // Derived column codes are stripped from the source CDE list.
    expect(body.analysis.inputdata.variables).toEqual(['age']);
    expect(body.analysis.inputdata.variables).not.toContain('derived_col');
  });

  it('sends two applied creators as two steps of the same name', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([
      { code: 'mrs', label: 'mrs' },
      { code: 'age', label: 'Age' },
    ]);
    service.setAlgorithmY([{ code: 'age', label: 'Age' }]);
    const good = {
      code: 'mrs_good_outcome',
      strategy: 'filter_rules',
      rules: {
        good: {
          condition: 'AND',
          rules: [{ id: 'mrs-le-2', field: 'mrs', type: 'real', input: 'number', operator: '<=', value: 2 }],
        },
      },
    };
    const bad = {
      code: 'mrs_bad_outcome',
      strategy: 'filter_rules',
      rules: {
        bad: {
          condition: 'AND',
          rules: [{ id: 'mrs-gt-2', field: 'mrs', type: 'real', input: 'number', operator: '>', value: 2 }],
        },
      },
      default_enumeration: 'unknown',
    };

    service.setTransformationPreprocessing([good, bad]);

    // Two or more creators persist as an ordered array under the one config key.
    expect(service.appliedPreprocessingConfig()?.['categorical_column_creator']).toEqual([good, bad]);

    service.setAlgorithmX([
      { code: 'mrs_good_outcome', label: 'mrs_good_outcome', isCreatedColumn: true },
      { code: 'mrs_bad_outcome', label: 'mrs_bad_outcome', isCreatedColumn: true },
    ]);

    // Every derived column is assignable.
    expect(service.algorithmAssignableVariables().map((v) => v.code))
      .toEqual(['mrs', 'age', 'mrs_good_outcome', 'mrs_bad_outcome']);

    const body = service.buildRequestBody('mock_algo');
    const creators = (body.analysis.preprocessing as AnalysisPreprocessingStep[])
      .filter((step) => step.name === 'categorical_column_creator');
    // The engine takes the repeated step name in draft order.
    expect(creators.map((step) => step.parameters['code'])).toEqual(['mrs_good_outcome', 'mrs_bad_outcome']);
    expect(creators[1].parameters['default_enumeration']).toBe('unknown');

    expect(body.analysis.algorithm.y).toEqual(['age']);
    expect(body.analysis.algorithm.x).toEqual(['mrs_good_outcome', 'mrs_bad_outcome']);
    // Both derived codes are stripped from the source CDE list; their rule
    // sources are still sent.
    expect(body.analysis.inputdata.variables).toEqual(['mrs', 'age']);
  });

  it('keeps a stored cohort filter tree exactly as stored', () => {
    service.hydrateFromBackendExperiment({
      uuid: 'exp-filter-shape',
      name: 'Saved cohort',
      created: '',
      finished: '',
      shared: false,
      viewed: false,
      status: 'success',
      analysis: {
        inputdata: {
          data_model: 'dm:1',
          datasets: ['ds1'],
          filters: {
            condition: 'AND',
            rules: [
              { id: 'sex', field: 'sex', operator: 'in', value: ['1', '2'], type: 'string' },
              // Stored without its value key; the reference filter client sends null for these.
              { id: 'age', field: 'age', operator: 'is_not_null', type: 'integer' },
            ],
          },
          variables: ['sex', 'age'],
        },
        preprocessing: null,
        algorithm: { name: 'mock_algo', y: ['age'], x: ['sex'], parameters: {} },
      },
    } as any);
    httpMock.expectOne('/services/data-models').flush([mockDataModel]);

    // Loading never rewrites or fills in a stored rule…
    expect((service.filterLogic()?.rules as any[])[0])
      .toEqual(jasmine.objectContaining({ field: 'sex', operator: 'in', value: ['1', '2'] }));
    // …including a unary rule whose own client omitted the value key.
    expect((service.filterLogic()?.rules as any[])[1])
      .toEqual(jasmine.objectContaining({ field: 'age', operator: 'is_not_null', type: 'integer' }));
    expect('value' in ((service.filterLogic()?.rules as any[])[1])).toBeFalse();

    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([
      { code: 'sex', label: 'Sex' },
      { code: 'age', label: 'Age' },
    ]);
    service.setAlgorithmY([{ code: 'age', label: 'Age' }]);
    service.setAlgorithmX([{ code: 'sex', label: 'Sex' }]);

    const sentRules = service.buildRequestBody('mock_algo').analysis.inputdata.filters.rules as any[];
    expect(sentRules[0].value).toEqual(['1', '2']);
    expect('value' in sentRules[1]).toBeFalse();
  });

  it('hydrates every saved creator step, not just the last one with that name', () => {
    const good = { code: 'mrs_good_outcome', strategy: 'filter_rules', rules: { good: {} } };
    const bad = { code: 'mrs_bad_outcome', strategy: 'filter_rules', rules: { bad: {} } };

    service.hydrateFromBackendExperiment({
      uuid: 'exp-derived-pair',
      name: 'Saved experiment',
      created: '',
      finished: '',
      shared: false,
      viewed: false,
      status: 'success',
      analysis: {
        inputdata: {
          data_model: 'dm:1',
          datasets: ['ds1'],
          variables: ['age'],
        },
        preprocessing: [
          { name: 'categorical_column_creator', parameters: good },
          { name: 'categorical_column_creator', parameters: bad },
        ],
        algorithm: {
          name: 'mock_algo',
          y: ['age'],
          x: ['mrs_good_outcome', 'mrs_bad_outcome'],
          parameters: {},
        },
      },
      createdBy: {
        username: 'user',
        fullname: 'User',
        email: 'user@example.org',
        subjectId: 'subject',
        agreeNDA: true,
      },
    });

    const req = httpMock.expectOne('/services/data-models');
    req.flush([mockDataModel]);

    // Repeated steps of the same name collect into an array so the edit form
    // can rebuild both cards.
    expect(service.appliedPreprocessingConfig()?.['categorical_column_creator']).toEqual([good, bad]);
    expect(service.algorithmAssignableVariables().map((v) => v.code))
      .toEqual(['age', 'mrs_good_outcome', 'mrs_bad_outcome']);
  });

  it('includes unassigned pool CDEs used as transformation sources in inputdata.variables', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([
      { code: 'mrs', label: 'mrs' },
      { code: 'age', label: 'Age' },
    ]);
    service.setAlgorithmY([{ code: 'age', label: 'Age' }]);
    service.setTransformationPreprocessing([{
      code: 'mrs_good_outcome',
      strategy: 'filter_rules',
      rules: {
        good: {
          condition: 'AND',
          rules: [{ id: 'mrs', field: 'mrs', type: 'real', input: 'number', operator: '<=', value: 2 }],
        },
      },
    }]);
    service.setAlgorithmX([{ code: 'mrs_good_outcome', label: 'mrs_good_outcome' }]);

    const body = service.buildRequestBody('mock_algo');
    // 'mrs' is in the pool and referenced by the transformation rule filters, so
    // it must be sent as a source CDE even though it is not assigned to y/x.
    expect(body.analysis.inputdata.variables).toEqual(['mrs', 'age']);
    expect(body.analysis.inputdata.variables).not.toContain('mrs_good_outcome');
    expect(body.analysis.algorithm.y).toEqual(['age']);
    expect(body.analysis.algorithm.x).toEqual(['mrs_good_outcome']);
  });

  it('drops a renamed created column from roles when the transformation code changes', () => {
    service.selectedDataModel.set(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'age', label: 'Age' }]);
    service.setAlgorithmY([{ code: 'age', label: 'Age' }]);
    service.setTransformationPreprocessing([{
      code: 'old_col',
      rules: { A: {} },
      default_enumeration: 'A',
    }]);
    // The role UI assigns the live transformation node (isCreatedColumn: true).
    service.setAlgorithmX([{ code: 'old_col', label: 'old_col', isCreatedColumn: true }]);

    expect(service.algorithmX().map((v) => v.code)).toEqual(['old_col']);

    // Renaming the created column makes the old code unassignable, so it is
    // pruned from the x role automatically.
    service.setTransformationPreprocessing([{
      code: 'new_col',
      rules: { A: {} },
      default_enumeration: 'A',
    }]);

    expect(service.algorithmX()).toEqual([]);
    expect(service.algorithmY().map((v) => v.code)).toEqual(['age']);
  });

  it('hydrates saved y/x roles including a derived code as a synthetic node', () => {
    service.hydrateFromBackendExperiment({
      uuid: 'exp-derived',
      name: 'Saved experiment',
      created: '',
      finished: '',
      shared: false,
      viewed: false,
      status: 'success',
      analysis: {
        inputdata: {
          data_model: 'dm:1',
          datasets: ['ds1'],
          variables: ['age', 'sex', 'derived_col'],
        },
        preprocessing: null,
        algorithm: {
          name: 'mock_algo',
          y: ['age'],
          x: ['derived_col'],
          parameters: {},
        },
      },
      createdBy: {
        username: 'user',
        fullname: 'User',
        email: 'user@example.org',
        subjectId: 'subject',
        agreeNDA: true,
      },
    });

    const req = httpMock.expectOne('/services/data-models');
    req.flush([mockDataModel]);

    // Only real CDEs populate the variables-panel pool; the derived code is a
    // synthetic assignable role node, not a pool member. Real CDEs saved in
    // inputdata.variables (here 'sex') are restored to the pool too, even when
    // they are not assigned to y/x.
    expect(service.selectedVariables().map((v) => v.code)).toEqual(['age', 'sex']);
    expect(service.algorithmY().map((v) => v.code)).toEqual(['age']);
    expect(service.algorithmX().map((v) => v.code)).toEqual(['derived_col']);
    expect(service.algorithmX()[0]?.isCreatedColumn).toBeTrue();
    expect(service.algorithmAssignableVariables().map((v) => v.code)).toEqual(['age', 'sex', 'derived_col']);
  });

  it('removes an item from the pool and prunes it from assigned y/x roles', () => {
    service.setAlgorithmY([{ code: 'age', label: 'Age' }]);
    service.setAlgorithmX([{ code: 'sex', label: 'Sex' }]);
    service.setVariables([
      { code: 'age', label: 'Age' },
      { code: 'sex', label: 'Sex' },
    ]);

    // Removing 'sex' from the pool should prune it from algorithmX.
    service.setVariables([{ code: 'age', label: 'Age' }]);

    expect(service.algorithmY().map((v) => v.code)).toEqual(['age']);
    expect(service.algorithmX()).toEqual([]);
  });

  describe('kmeans_cluster_creator preprocessing', () => {
    const clusterFixture = (clusterVariables: string[]) => ({
      code: 'kmeans_cluster',
      reusable_preprocessing: {
        schema_version: '1',
        preprocessing_name: 'kmeans_cluster_creator',
        cluster_variables: clusterVariables,
        centers: { cluster_0: { a: 1, b: 2 }, cluster_1: { a: 3, b: 4 } },
        source_context: { data_model: 'dm:1', datasets: ['ds1'], input_fingerprint: 'fp' },
        available_outputs: [],
        cluster_choices: [
          { cluster_id: 'cluster_0', label: 'Cluster 0' },
          { cluster_id: 'cluster_1', label: 'Cluster 1' },
        ],
      },
    });

    function stepNames(body: any): string[] {
      return (body.analysis.preprocessing as AnalysisPreprocessingStep[]).map((step) => step.name);
    }

    it('exposes the cluster column in the assignable pool and reads back the applied creator', () => {
      service.setKMeansClusterPreprocessing(clusterFixture(['a', 'b']));

      expect(service.appliedKMeansClusterCreator()?.code).toBe('kmeans_cluster');
      expect(service.appliedPreprocessingConfig()?.['kmeans_cluster_creator'])
        .toEqual(clusterFixture(['a', 'b']));

      const clusterNode = service.algorithmAssignableVariables().find((v) => v.code === 'kmeans_cluster');
      expect(clusterNode).toBeTruthy();
      expect(clusterNode?.isCreatedColumn).toBeTrue();
      expect(clusterNode?.enumerations).toEqual([
        { code: 'cluster_0', label: 'Cluster 0' },
        { code: 'cluster_1', label: 'Cluster 1' },
      ]);
    });

    it('drops the cluster column from the pool when cleared', () => {
      service.setKMeansClusterPreprocessing(clusterFixture(['a', 'b']));

      expect(service.algorithmAssignableVariables().map((v) => v.code)).toContain('kmeans_cluster');

      service.setKMeansClusterPreprocessing(null);

      expect(service.appliedKMeansClusterCreator()).toBeNull();
      expect(service.appliedPreprocessingConfig()).toBeNull();
      // Nothing was assigned to a role, so the code is no longer assignable.
      expect(service.algorithmAssignableVariables().map((v) => v.code)).not.toContain('kmeans_cluster');
    });

    it('keeps a role node hydrated from a saved experiment when no creator is applied', () => {
      service.setAlgorithmY([{ code: 'kmeans_cluster', label: 'kmeans_cluster', isCreatedColumn: true }]);

      expect(service.algorithmY().map((v) => v.code)).toEqual(['kmeans_cluster']);

      service.setKMeansClusterPreprocessing(clusterFixture(['a', 'b']));
      service.setKMeansClusterPreprocessing(null);

      expect(service.appliedKMeansClusterCreator()).toBeNull();
      // Same contract as the transformation column: a synthetic role node stays
      // assignable while it is assigned.
      expect(service.algorithmY().map((v) => v.code)).toEqual(['kmeans_cluster']);
      expect(service.algorithmAssignableVariables().map((v) => v.code)).toContain('kmeans_cluster');
    });

    it('ignores an applied creator without a code or reusable preprocessing', () => {
      service.setAppliedDescriptivePreprocessing({
        kmeans_cluster_creator: { code: '  ', reusable_preprocessing: {} },
      });
      expect(service.appliedKMeansClusterCreator()).toBeNull();

      service.setAppliedDescriptivePreprocessing({
        kmeans_cluster_creator: { code: 'kmeans_cluster' },
      });
      expect(service.appliedKMeansClusterCreator()).toBeNull();
    });

    it('sends the cluster variables as source CDEs and the cluster step after missing value handling', () => {
      service.selectedDataModel.set(mockDataModel);
      service.setSelectedDatasets(['ds1']);
      service.setVariables([{ code: 'a', label: 'A' }, { code: 'b', label: 'B' }]);
      service.setAppliedDescriptivePreprocessing({
        missing_values_handler: { strategies: { a: 'mean' } },
      });
      service.setKMeansClusterPreprocessing(clusterFixture(['a', 'b']));
      service.setAlgorithmY([{ code: 'kmeans_cluster', label: 'kmeans_cluster', isCreatedColumn: true }]);

      const body = service.buildRequestBody('mock_algo');

      expect(body.analysis.algorithm.y).toEqual(['kmeans_cluster']);
      expect(body.analysis.inputdata.variables).toEqual(['a', 'b']);
      expect(body.analysis.inputdata.variables).not.toContain('kmeans_cluster');

      const names = stepNames(body);
      expect(names.indexOf('missing_values_handler'))
        .toBeLessThan(names.indexOf('kmeans_cluster_creator'));

      const missingStep = (body.analysis.preprocessing as AnalysisPreprocessingStep[])
        .find((step) => step.name === 'missing_values_handler');
      // The user's own strategy for 'a' survives; 'b' gets the required drop.
      expect(missingStep?.parameters['strategies']).toEqual({ a: 'mean', b: 'drop' });

      // The request-only adjustments never reach the store.
      expect(service.appliedPreprocessingConfig()?.['missing_values_handler'])
        .toEqual({ strategies: { a: 'mean' } });
    });

    it('adds a missing values handler for the cluster variables when none is set', () => {
      service.selectedDataModel.set(mockDataModel);
      service.setSelectedDatasets(['ds1']);
      service.setVariables([{ code: 'a', label: 'A' }, { code: 'b', label: 'B' }]);
      service.setKMeansClusterPreprocessing(clusterFixture(['a', 'b']));
      service.setAlgorithmY([{ code: 'kmeans_cluster', label: 'kmeans_cluster', isCreatedColumn: true }]);

      const body = service.buildRequestBody('mock_algo');

      const steps = body.analysis.preprocessing as AnalysisPreprocessingStep[];
      expect(steps.map((step) => step.name)).toEqual(['missing_values_handler', 'kmeans_cluster_creator']);
      expect(steps[0].parameters['strategies']).toEqual({ a: 'drop', b: 'drop' });
      expect(steps[1].parameters['code']).toBe('kmeans_cluster');
    });

    it('summarizes an applied cluster creator as the cluster column it writes', () => {
      expect(service.formatPreprocessingEntries({
        kmeans_cluster_creator: { code: 'kmeans_cluster', reusable_preprocessing: {} },
      })).toContain(jasmine.objectContaining({
        label: 'K-means cluster column',
        value: 'kmeans_cluster',
      }));
    });

    it('leaves a config without a cluster creator untouched', () => {
      const config = { missing_values_handler: { strategies: { age: 'mean' } } };

      expect((service as any).withKMeansClusterRequirements(config)).toBe(config);
      expect((service as any).withKMeansClusterRequirements(null)).toBeNull();
    });
  });

  describe('loadKMeansReport', () => {
    beforeEach(() => {
      service.selectedDataModel.set(mockDataModel);
      service.setSelectedDatasets(['ds1']);
      service.setVariables([{ code: 'age', label: 'Age' }]);
    });

    it('sends spec defaults when the Algorithm step has no kmeans parameters', () => {
      const request$ = service.loadKMeansReport(['age']);
      expect(request$).toBeTruthy();
      request$!.subscribe();

      const req = httpMock.expectOne('/services/experiments/transient');
      expect(req.request.body.analysis.algorithm.name).toBe('kmeans');
      expect(req.request.body.analysis.algorithm.y).toEqual(['age']);
      expect(req.request.body.analysis.algorithm.parameters).toEqual(jasmine.objectContaining({
        k_selection: 'manual',
        k: 4,
        maxiter: 100,
        tol: 0.0001,
      }));
      expect(req.request.body.analysis.preprocessing).toEqual([
        { name: 'missing_values_handler', parameters: { strategies: { age: 'drop' } } },
      ]);
      req.flush({ status: 'success', result: {} });
    });

    it('adds missing_values_handler when the applied config is a transformation only', () => {
      service.setAppliedDescriptivePreprocessing({
        categorical_column_creator: [{ code: 'grp' }],
      });
      service.loadKMeansReport(['age'])!.subscribe();

      const req = httpMock.expectOne('/services/experiments/transient');
      const steps = req.request.body.analysis.preprocessing as AnalysisPreprocessingStep[];
      expect(steps.map((step) => step.name)).toContain('missing_values_handler');
      expect(steps.find((step) => step.name === 'missing_values_handler')?.parameters['strategies'])
        .toEqual({ age: 'drop' });
      expect(steps.find((step) => step.name === 'categorical_column_creator')?.parameters['code'])
        .toBe('grp');
      req.flush({ status: 'success', result: {} });
    });

    it('keeps an applied missing-value strategy for a clustering variable', () => {
      service.setAppliedDescriptivePreprocessing({
        missing_values_handler: { strategies: { age: 'mean' } },
      });
      service.loadKMeansReport(['age'])!.subscribe();

      const req = httpMock.expectOne('/services/experiments/transient');
      const missing = (req.request.body.analysis.preprocessing as AnalysisPreprocessingStep[])
        .find((step) => step.name === 'missing_values_handler');
      expect(missing?.parameters['strategies']).toEqual({ age: 'mean' });
      req.flush({ status: 'success', result: {} });
    });

    it('lets an explicit parameter override the spec default', () => {
      service.loadKMeansReport(['age'], { k: 3 })!.subscribe();

      const req = httpMock.expectOne('/services/experiments/transient');
      expect(req.request.body.analysis.algorithm.parameters.k).toBe(3);
      expect(req.request.body.analysis.algorithm.parameters.k_selection).toBe('manual');
      req.flush({ status: 'success', result: {} });
    });

    it('prefers Algorithm-step kmeans parameters over spec defaults', () => {
      service.algorithmConfigurations.set({
        kmeans: { k_selection: 'elbow', k_min: 2, k_max: 5, maxiter: 50, tol: 0.01 },
      });
      service.loadKMeansReport(['age'])!.subscribe();

      const req = httpMock.expectOne('/services/experiments/transient');
      expect(req.request.body.analysis.algorithm.parameters).toEqual(jasmine.objectContaining({
        k_selection: 'elbow',
        k_min: 2,
        k_max: 5,
        maxiter: 50,
        tol: 0.01,
        k: 4,
      }));
      req.flush({ status: 'success', result: {} });
    });
  });
});
