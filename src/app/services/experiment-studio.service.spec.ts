import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ExperimentStudioService } from './experiment-studio.service';
import { SessionStorageService } from './session-storage.service';
import { ErrorService } from './error.service';
import { DataModel } from '../models/data-model.interface';

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
      y: { label: '', desc: '', types: ['real'], required: true, multiple: false },
      x: { label: '', desc: '', types: ['real'] },
      filter: { label: '', desc: '', types: [], required: false, multiple: false }
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
    label: 'Histograms',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['text'], required: true, multiple: true },
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
      y: { label: '', desc: '', types: ['real'], required: true, multiple: true },
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

    const req = httpMock.expectOne('/services/algorithms');
    req.flush([mockRawAlgo, mockHistogramAlgo, mockDescribeAlgo]);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('builds request body for histogram with active data model and datasets', () => {
    // Arrange
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    // Act
    const body = service.buildRequestBody('histogram', ['var1']);

    // Assert
    expect(body.algorithm.name).toBe('histogram');
    expect(body.algorithm.inputdata.data_model).toBe('dm:1');
    expect(body.algorithm.inputdata.datasets).toEqual(['ds1']);
    expect(body.algorithm.inputdata.y).toEqual(['var1']);
    expect(body.algorithm.inputdata.filters).toBeNull();
    expect(body.algorithm.preprocessing).toBeNull();
  });

  it('does not apply stored descriptive preprocessing to histogram preview requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setAppliedDescriptivePreprocessing({
      missing_values_handler: {
        strategies: { var1: 'mean' },
      },
    });

    const body = service.buildRequestBody('histogram', ['var1']);

    expect(body.algorithm.preprocessing).toBeNull();
  });

  it('adds default drop preprocessing for non-describe algorithm requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    const body = service.buildRequestBody('mock_algo', ['var1'], ['cov1']);

    expect(body.algorithm.preprocessing).toEqual({
      missing_values_handler: {
        strategies: {
          var1: 'drop',
          cov1: 'drop',
        },
      },
    });
  });

  it('does not add default preprocessing for describe requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    const body = service.buildRequestBody('describe', ['var1']);

    expect(body.algorithm.preprocessing).toBeNull();
  });

  it('sends raw descriptive overview requests without preprocessing', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    service.loadDescriptiveOverview(['age']).subscribe();

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.algorithm.name).toBe('describe');
    expect(req.request.body.algorithm.preprocessing).toBeNull();
    req.flush({ result: { featurewise: [] } });
  });

  it('sends processed descriptive overview requests with explicit preprocessing', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const preprocessing = {
      missing_values_handler: {
        strategies: { age: 'mean' },
      },
    };

    service.loadDescriptiveOverview(['age'], preprocessing).subscribe();

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.algorithm.preprocessing).toEqual(preprocessing);
    req.flush({ result: { featurewise: [] } });
  });

  it('does not use descriptive preview preprocessing in algorithm requests until it is stored as applied', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    service.loadDescriptiveOverview(['age'], {
      missing_values_handler: {
        strategies: { age: 'mean' },
      },
    }).subscribe();
    const previewReq = httpMock.expectOne('/services/experiments/transient');
    previewReq.flush({ result: { featurewise: [] } });

    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.algorithm.preprocessing).toEqual({
      missing_values_handler: {
        strategies: { age: 'drop' },
      },
    });
  });

  it('uses applied descriptive preprocessing for later algorithm requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'median' },
      },
    };

    service.setAppliedDescriptivePreprocessing(applied);
    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.algorithm.preprocessing).toEqual(applied);
  });

  it('uses applied descriptive preprocessing with multiple preprocessing steps for later algorithm requests', () => {
    service.setSelectedDataModel(mockDataModel);
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

    expect(body.algorithm.preprocessing).toEqual(applied);
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

  it('resetStudioState clears selections and errors', (done) => {
    const errorService = TestBed.inject(ErrorService);

    // Arrange
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'v1', label: 'V1' } as any]);
    errorService.setError('Oops');

    // Act
    service.resetStudioState();

    // Assert
    expect(service.selectedDataModel()).toBeNull();
    expect(service.selectedDatasets()).toEqual([]);
    expect(service.selectedVariables()).toEqual([]);
    errorService.error$.subscribe((msg) => {
      expect(msg).toBeNull();
      done();
    });
  });

  it('returns null from runSelectedAlgorithm when no algorithm is selected', () => {
    // Act
    const result = service.runSelectedAlgorithm();

    // Assert
    expect(result).toBeNull();
  });

  it('keeps an algorithm available when multiple filter variables are selected', () => {
    service.setVariables([{ code: 'age', label: 'Age', type: 'real' } as any]);
    service.setFilters([
      { code: 'age', label: 'Age', type: 'real' } as any,
      { code: 'event_type', label: 'Event Type', type: 'text' } as any,
    ]);

    expect(service.isAlgorithmAvailable('mock_algo')).toBeTrue();
  });

  it('coerces numeric parameter strings before building request payloads', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.algorithmConfigurations.set({
      mock_algo: { alpha: '0.05' },
    });

    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.algorithm.parameters.alpha).toBe(0.05);
  });

  it('keeps enum select parameter strings even when their schema type is int', () => {
    service.setSelectedDataModel(mockDataModel);
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

    expect(body.algorithm.parameters.positive_class).toBe('1');
  });

  it('keeps enum multi-select parameter values as strings even when their schema type is int', () => {
    service.setSelectedDataModel(mockDataModel);
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

    expect(body.algorithm.parameters.category_order).toEqual(['0', '1', '9']);
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
      algorithm: {
        name: 'mock_algo',
        inputdata: {
          data_model: 'dm:1',
          datasets: ['ds1'],
          y: ['age'],
          x: ['sex'],
          filters,
        },
        parameters: { alpha: 0.01 },
        preprocessing,
        status: 'success',
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
    expect(service.selectedVariables().map((variable) => variable.code)).toEqual(['age']);
    expect(service.selectedCovariates().map((variable) => variable.code)).toEqual(['sex']);
    expect(service.selectedFilters().map((variable) => variable.code)).toEqual(['site']);
    expect(service.filterLogic()).toEqual(filters);
    expect(service.algorithmConfigurations()['mock_algo']).toEqual({ alpha: 0.01 });
    expect(service.appliedPreprocessingConfig()).toEqual(preprocessing);
    expect(service.isShared()).toBeTrue();
  });
});
