import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BackendExperiment } from '../models/backend-experiment.model';
import { Experiment } from '../models/experiments-dashboard.model';
import { Observable, of, throwError } from 'rxjs';

import { ExperimentStudioService } from './experiment-studio.service';
import { ExperimentsDashboardService } from './experiments-dashboard.service';

const apiUrl = '/services/experiments';

const backendExperiment = (uuid: string, name: string) => ({
  uuid,
  name,
  created: '2026-01-01T00:00:00.000Z',
  finished: '2026-01-01T00:01:00.000Z',
  shared: false,
  viewed: false,
  status: 'success',
  description: '',
  analysis: { algorithm: { name: 'mock_anova', y: ['AGE'], x: [] } },
  createdBy: {
    username: 'mcurie',
    fullname: 'Marie Curie',
    email: 'marie.curie@chuv.ch',
    subjectId: 'orcid-0000-0002',
    agreeNDA: true,
  },
});

const frontendExperiment = (id: string, name = id): Experiment => ({
  id,
  name,
  dateCreated: new Date('2026-01-01T00:00:00.000Z'),
  status: 'success',
  algorithmName: 'mock_anova',
  author: 'Marie Curie',
  authorEmail: 'marie.curie@chuv.ch',
  isShared: false,
});

describe('ExperimentsDashboardService hydrateExperiments', () => {
  let service: ExperimentsDashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ExperimentsDashboardService],
    });
    service = TestBed.inject(ExperimentsDashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list requests with filters', () => {
    it('keeps the client-filter snapshot for repeat views within a visit', () => {
      service.getUserExperiments(0, 10, true, { status: 'success' });
      httpMock.expectOne((request) => request.url === apiUrl).flush({
        experiments: [backendExperiment('a', 'A'), backendExperiment('b', 'B')],
        totalExperiments: 2,
        totalPages: 1,
        currentPage: 0,
      });

      expect(service.experiments().map((experiment) => experiment.id)).toEqual(['a', 'b']);

      // A second client-only filter is answered from the same full-history snapshot.
      service.getUserExperiments(0, 10, true, { status: 'error' });
      httpMock.expectNone((request) => request.url === apiUrl);
      expect(service.experiments()).toEqual([]);
      expect(service.totalExperiments()).toBe(0);
    });

    it('names the runs a client-side filter searched once the history cap cut it short', () => {
      service.getUserExperiments(0, 10, true, { status: 'success' });

      // 51 pages of 50 exist; the snapshot reads 50 of them.
      const first = httpMock.expectOne((request) => request.url === apiUrl);
      expect(first.request.params.get('page')).toBe('0');
      first.flush({
        experiments: [backendExperiment('a', 'A')],
        totalExperiments: 2550,
        totalPages: 51,
        currentPage: 0,
      });

      const rest = httpMock.match((request) => request.url === apiUrl);
      expect(rest.length).toBe(49);
      rest.forEach((request, index) => request.flush({
        experiments: [],
        totalExperiments: 2550,
        totalPages: 51,
        currentPage: index + 1,
      }));

      expect(service.fullHistoryCap).toBe(2500);
      expect(service.historyTruncated()).toBe(true);
    });

    it('does not claim a truncated history the snapshot actually covered', () => {
      service.getUserExperiments(0, 10, true, { status: 'success' });
      httpMock.expectOne((request) => request.url === apiUrl).flush({
        experiments: [backendExperiment('a', 'A')],
        totalExperiments: 1,
        totalPages: 1,
        currentPage: 0,
      });

      expect(service.historyTruncated()).toBe(false);
    });

    it('invalidates the client-filter snapshot on demand', () => {
      service.getUserExperiments(0, 10, true, { status: 'success' });
      httpMock.expectOne((request) => request.url === apiUrl).flush({
        experiments: [backendExperiment('a', 'A')],
        totalExperiments: 1,
        totalPages: 1,
        currentPage: 0,
      });
      expect(service.experiments().map((experiment) => experiment.id)).toEqual(['a']);

      service.invalidateListCache();
      service.getUserExperiments(0, 10, true, { status: 'success' });
      httpMock.expectOne((request) => request.url === apiUrl).flush({
        experiments: [backendExperiment('b', 'B')],
        totalExperiments: 1,
        totalPages: 1,
        currentPage: 0,
      });

      expect(service.experiments().map((experiment) => experiment.id)).toEqual(['b']);
    });

    it('sends algorithm and shared filters to the server as request params', () => {
      service.getUserExperiments(0, 10, true, { algorithm: 'mock_anova', shared: 'shared' });

      const request = httpMock.expectOne((candidate) => candidate.url === apiUrl);
      expect(request.request.params.get('algorithm')).toBe('mock_anova');
      expect(request.request.params.get('shared')).toBe('true');
      expect(request.request.params.get('mine')).toBe('true');

      request.flush({
        experiments: [backendExperiment('a', 'A')],
        totalExperiments: 1,
        totalPages: 1,
        currentPage: 0,
      });

      expect(service.experiments().map((experiment) => experiment.id)).toEqual(['a']);
    });
  });

  it('lists K-means experiments newest first', () => {
    let emitted: BackendExperiment[] | undefined;

    service.listKMeansExperiments().subscribe((experiments) => (emitted = experiments));

    const req = httpMock.expectOne((candidate) => candidate.url === apiUrl);
    expect(req.request.params.get('algorithm')).toBe('kmeans');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('50');
    // Own scope only: the shared tab would hide the caller's own runs and expose others'.
    expect(req.request.params.get('mine')).toBe('true');
    expect(req.request.params.get('notMine')).toBe('false');

    req.flush({
      experiments: [{ uuid: 'u1' }],
      totalExperiments: 1,
      totalPages: 1,
      currentPage: 0,
    });

    expect(emitted![0].uuid).toBe('u1');
  });

  it('lists PCA experiments newest first', () => {
    let emitted: BackendExperiment[] | undefined;

    service.listPcaExperiments().subscribe((experiments) => (emitted = experiments));

    const req = httpMock.expectOne((candidate) => candidate.url === apiUrl);
    expect(req.request.params.get('algorithm')).toBe('pca');
    expect(req.request.params.get('mine')).toBe('true');
    expect(req.request.params.get('notMine')).toBe('false');

    req.flush({
      experiments: [{ uuid: 'pca-1' }],
      totalExperiments: 1,
      totalPages: 1,
      currentPage: 0,
    });

    expect(emitted![0].uuid).toBe('pca-1');
  });

  it('resolves members that are already loaded without asking the backend', () => {
    service.experiments.set([frontendExperiment('a'), frontendExperiment('b')]);
    let resolved: Experiment[] | undefined;

    service.hydrateExperiments(['b', 'a']).subscribe((experiments) => (resolved = experiments));

    expect(resolved!.map((exp) => exp.id)).toEqual(['b', 'a']);
  });

  it('fetches a member from another page, upserts it, and keeps folder order', () => {
    service.experiments.set([frontendExperiment('a')]);
    let resolved: Experiment[] | undefined;

    service.hydrateExperiments(['a', 'b', 'c']).subscribe((experiments) => (resolved = experiments));

    httpMock.expectNone(`${apiUrl}/a`);
    httpMock.expectOne(`${apiUrl}/b`).flush(backendExperiment('b', 'Off page b'));
    httpMock.expectOne(`${apiUrl}/c`).flush(backendExperiment('c', 'Off page c'));

    expect(resolved!.map((exp) => exp.id)).toEqual(['a', 'b', 'c']);
    // The compare workspace only sees the loaded list, so the members had to be added to it.
    expect(service.experiments().map((exp) => exp.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('drops a member the backend no longer returns instead of failing the comparison', () => {
    service.experiments.set([frontendExperiment('a')]);
    let resolved: Experiment[] | undefined;

    service.hydrateExperiments(['a', 'gone']).subscribe((experiments) => (resolved = experiments));

    httpMock.expectOne(`${apiUrl}/gone`).flush('not found', { status: 404, statusText: 'Not Found' });

    expect(resolved!.map((exp) => exp.id)).toEqual(['a']);
  });

  it('propagates a real fetch failure instead of treating it as a deleted member', () => {
    service.experiments.set([frontendExperiment('a')]);
    let error: unknown;

    service.hydrateExperiments(['a', 'unreachable']).subscribe({
      error: (err) => (error = err),
    });

    httpMock.expectOne(`${apiUrl}/unreachable`).flush('server down', {
      status: 500,
      statusText: 'Server Error',
    });

    expect((error as { status?: number } | undefined)?.status).toBe(500);
    expect(service.experiments().map((exp) => exp.id)).toEqual(['a']);
  });
});

describe('ExperimentsDashboardService search by dataset', () => {
  let service: ExperimentsDashboardService;
  let httpMock: HttpTestingController;
  let loadAllDataModels: ReturnType<typeof vi.fn>;

  const catalog = [
    {
      uuid: 'm1',
      code: 'dementia',
      version: '0.1',
      label: 'Dementia',
      released: true,
      datasets: [
        { code: '12', label: 'EDSD' },
        { code: '13', label: 'ADNI' },
      ],
    },
  ];

  const withDatasets = (uuid: string, datasets: string[], dataModel = 'dementia:0.1') => ({
    ...backendExperiment(uuid, uuid.toUpperCase()),
    analysis: {
      inputdata: { data_model: dataModel, datasets },
      algorithm: { name: 'mock_anova', y: ['AGE'], x: [] },
    },
  });

  const flushHistory = () =>
    httpMock.expectOne((request) => request.url === apiUrl).flush({
      experiments: [withDatasets('a', ['12']), withDatasets('b', ['13']), withDatasets('c', ['12'], 'stroke:1.0')],
      totalExperiments: 3,
      totalPages: 1,
      currentPage: 0,
    });

  let models: Observable<unknown[]>;
  const setup = (next: Observable<unknown[]>) => {
    models = next;
  };

  beforeEach(() => {
    models = of(catalog);
    loadAllDataModels = vi.fn(() => models);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ExperimentsDashboardService,
        { provide: ExperimentStudioService, useValue: { loadAllDataModels } },
      ],
    });
    service = TestBed.inject(ExperimentsDashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('finds experiments by the label of their numeric dataset code', () => {
    setup(of(catalog));
    service.getUserExperiments(0, 10, true, { query: 'edsd' });
    flushHistory();

    // "c" stores code 12 too, but in a data model where 12 is not EDSD.
    expect(service.experiments().map((experiment) => experiment.id)).toEqual(['a']);
  });

  it('still finds experiments by the dataset code itself', () => {
    setup(of(catalog));
    service.getUserExperiments(0, 10, true, { query: '13' });
    flushHistory();

    expect(service.experiments().map((experiment) => experiment.id)).toEqual(['b']);
  });

  it('falls back to codes when the catalog cannot be loaded', () => {
    setup(throwError(() => new Error('offline')));
    service.getUserExperiments(0, 10, true, { query: 'edsd' });
    flushHistory();
    expect(service.experiments()).toEqual([]);

    service.getUserExperiments(0, 10, true, { query: '12' });
    expect(service.experiments().map((experiment) => experiment.id)).toEqual(['a', 'c']);
  });

  it('reads the catalog only for a text query', () => {
    setup(of(catalog));
    service.getUserExperiments(0, 10, true, { status: 'success' });
    flushHistory();

    expect(loadAllDataModels).not.toHaveBeenCalled();
    expect(service.experiments()).toHaveLength(3);
  });
});
