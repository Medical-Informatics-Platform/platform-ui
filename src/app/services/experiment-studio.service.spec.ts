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
    parameters: {}
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
    variables: [],
    groups: [],
    datasets: ['ds1'],
    released: true,
  };

  beforeEach(() => {
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
});
