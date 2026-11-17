import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { EMPTY, of } from 'rxjs';

import { Analysis } from '../../models/analyses-dashboard.model';
import { AuthService } from '../../services/auth.service';
import { AnalysisStudioService } from '../../services/analysis-studio.service';
import { AnalysesDashboardService } from '../../services/analyses-dashboard.service';
import { StudiesService } from '../../services/studies.service';
import { FakeStudiesService } from './studies.testing';
import { AnalysesDashboardComponent } from './analyses-dashboard.component';

const apiUrl = '/services/analyses';

const analysis = (id: string, overrides: Partial<Analysis> = {}): Analysis => ({
  id,
  name: `Run ${id}`,
  dateCreated: new Date('2026-01-01T00:00:00.000Z'),
  status: 'success',
  algorithmName: 'mock_anova',
  author: 'Marie Curie',
  authorEmail: 'marie.curie@chuv.ch',
  isShared: false,
  ...overrides,
});

const backendAnalysis = (uuid: string) => ({
  uuid,
  name: `Run ${uuid}`,
  created: '2026-01-01T00:00:00.000Z',
  finished: '2026-01-01T00:01:00.000Z',
  shared: false,
  viewed: false,
  status: 'success',
  description: '',
  analysisRequest: { algorithm: { name: 'mock_anova', y: ['AGE'], x: [] } },
  createdBy: {
    username: 'mcurie',
    fullname: 'Marie Curie',
    email: 'marie.curie@chuv.ch',
    subjectId: 'orcid-0000-0002',
    agreeNDA: true,
  },
});

/**
 * The centre-pane wiring around the study canvas: how a study reaches compare mode, and
 * the one event allowed to forget a member. The component is built in an injection context
 * rather than from its template — the pane children have their own specs, and this one is
 * about which signals a handoff sets.
 */
describe('AnalysesDashboardComponent studies', () => {
  let component: AnalysesDashboardComponent;
  let dashboardService: AnalysesDashboardService;
  let studiesService: FakeStudiesService;
  let httpMock: HttpTestingController;

  /** Seeded, not clicked: this spec is about which signals a handoff sets, not about the canvas. */
  const openStudy = (memberIds: string[]) => studiesService.seedStudy('Q3 meta', memberIds);

  beforeEach(async () => {
    studiesService = new FakeStudiesService();

    await TestBed.configureTestingModule({
      imports: [AnalysesDashboardComponent, HttpClientTestingModule],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: EMPTY } },
        {
          provide: AuthService,
          useValue: {
            authState: signal({
              status: 'authenticated',
              // Studies are read for the username; sharing still asks for the email.
              user: { username: 'mcurie', email: 'marie.curie@chuv.ch' },
            }),
          },
        },
        {
          provide: AnalysisStudioService,
          useValue: {
            pathologyAccessWarning: signal(null),
            getAllDataModels: () => of([]),
            backendAlgorithms: signal({ mock_anova: { label: 'Analysis of Variance' } }),
          },
        },
        { provide: StudiesService, useValue: studiesService },
      ],
    });

    component = TestBed.runInInjectionContext(() => new AnalysesDashboardComponent())!;
    dashboardService = TestBed.inject(AnalysesDashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches off-page members before handing the study to compare mode', () => {
    // The list is server-paginated: only "a" is on the loaded page.
    dashboardService.analyses.set([analysis('a')]);
    const study = openStudy(['a', 'b']);
    TestBed.flushEffects();

    component.onStudySelected(study.id);
    expect(component.selectedStudyId()).toBe(study.id);
    expect(component.compareMode()).toBe(false);

    component.onStudyCompare(['a', 'b']);
    expect(component.compareMode()).toBe(false);

    httpMock.expectOne(`${apiUrl}/b`).flush(backendAnalysis('b'));

    // The off-page member had to join the loaded list: the workspace reads that page only.
    expect(component.compareIds()).toEqual(['a', 'b']);
    expect(component.compareMode()).toBe(true);
    expect(component.selectedStudyId()).toBeNull();
    expect(dashboardService.analyses().map((analysis) => analysis.id).sort()).toEqual(['a', 'b']);
    expect(component.analysesForCompare().map((analysis) => analysis.id).sort()).toEqual(['a', 'b']);
  });

  it('leaves compare mode when a study takes the centre pane', () => {
    const study = openStudy(['a']);
    component.compareMode.set(true);
    component.compareIds.set(['a']);

    component.onStudySelected(study.id);

    expect(component.compareMode()).toBe(false);
    expect(component.compareIds()).toEqual([]);
    expect(component.selectedStudyId()).toBe(study.id);
  });

  it('gives up the study canvas when compare is turned on by hand', () => {
    // The template checks the study branch first, so a study left open would keep the pane
    // and the Compare button would flip to Exit over an unchanged canvas.
    dashboardService.analyses.set([analysis('a'), analysis('b')]);
    const study = openStudy(['a', 'b']);
    component.onStudySelected(study.id);

    component.compareIds.set(['a', 'b']);
    component.openCompare();

    expect(component.compareMode()).toBe(true);
    expect(component.selectedStudyId()).toBeNull();
  });

  it('keeps the canvas order in the compare workspace', () => {
    // The page lists them a, b; the canvas numbered them 1 = b, 2 = a.
    dashboardService.analyses.set([analysis('a'), analysis('b')]);
    const study = openStudy(['b', 'a']);
    TestBed.flushEffects();

    component.onStudySelected(study.id);
    component.onStudyCompare(['b', 'a']);

    expect(component.compareIds()).toEqual(['b', 'a']);
    expect(component.analysesForCompare().map((analysis) => analysis.id)).toEqual(['b', 'a']);
  });

  it('hands the workspace back to the study it came from', () => {
    dashboardService.analyses.set([analysis('a'), analysis('b')]);
    const study = openStudy(['a', 'b']);

    component.onStudySelected(study.id);
    component.onStudyCompare(['a', 'b']);
    expect(component.compareOriginStudyId()).toBe(study.id);

    component.onBackToOriginStudy();

    expect(component.selectedStudyId()).toBe(study.id);
    expect(component.compareMode()).toBe(false);
  });

  it('forgets the origin study once compare is entered by hand', () => {
    dashboardService.analyses.set([analysis('a'), analysis('b')]);
    const study = openStudy(['a', 'b']);

    component.onStudySelected(study.id);
    component.onStudyCompare(['a', 'b']);
    expect(component.compareOriginStudyId()).toBe(study.id);

    // Leave the study comparison, then open compare by hand: the comparison is no longer that study's.
    component.closeCompare();
    component.compareIds.set(['a', 'b']);
    component.openCompare();

    expect(component.compareOriginStudyId()).toBeNull();
  });

  it('restores the compare origin study from the URL', () => {
    const study = studiesService.seedStudy('Q3 meta', ['a', 'b']);
    const originalUrl = window.location.href;

    try {
      window.history.replaceState({}, '', `/dashboard?study=${study.id}&compare=a,b`);

      component.ngOnInit();

      expect(component.compareMode()).toBe(true);
      expect(component.compareIds()).toEqual(['a', 'b']);
      expect(component.selectedStudyId()).toBeNull();
      expect(component.compareOriginStudyId()).toBe(study.id);

      component.onBackToOriginStudy();

      expect(component.selectedStudyId()).toBe(study.id);
      expect(component.compareMode()).toBe(false);
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
  });

  it('points the studies at whoever the session turns out to be, once per user', () => {
    TestBed.flushEffects();
    TestBed.flushEffects();

    expect(studiesService.sessions).toEqual(['mcurie']);
  });

  it('prunes a deleted run from every study', () => {
    const first = openStudy(['a', 'off-page']);
    const second = studiesService.seedStudy('PCA', ['a']);
    component.compareIds.set(['a']);
    TestBed.flushEffects();

    component.confirmDelete('a');
    httpMock.expectOne(`${apiUrl}/a`).flush({});

    // The cascade behind the analysis delete already dropped the membership rows: pruning the
    // mirror is a local edit, so the study API must not see a single request here.
    httpMock.expectNone('/services/studies');
    expect(studiesService.studyById(first.id)?.analysisIds).toEqual(['off-page']);
    expect(studiesService.studyById(second.id)?.analysisIds).toEqual([]);
    expect(component.compareIds()).toEqual([]);
  });

  it('does not prune study membership until the delete succeeds', () => {
    const study = openStudy(['a', 'off-page']);
    TestBed.flushEffects();

    component.confirmDelete('a');
    httpMock.expectOne(`${apiUrl}/a`).flush('delete failed', {
      status: 500,
      statusText: 'Server Error',
    });

    expect(studiesService.studyById(study.id)?.analysisIds).toEqual(['a', 'off-page']);
  });

  it('never prunes study members against the visible page', () => {
    const study = openStudy(['a', 'off-page']);
    TestBed.flushEffects();

    // A page refresh that does not contain the members is not evidence they are gone.
    dashboardService.analyses.set([]);
    TestBed.flushEffects();

    expect(studiesService.studyById(study.id)?.analysisIds).toEqual(['a', 'off-page']);
  });

  describe('compare empty state helpers', () => {
    it('removes an analysis from compareIds and updates URL', () => {
      component.compareIds.set(['a', 'b']);
      component.removeFromCompare('a');

      expect(component.compareIds()).toEqual(['b']);
    });

    it('adds a run from its checkbox and ignores a fourth', () => {
      component.onCompareToggled('a');
      component.onCompareToggled('b');
      component.onCompareToggled('c');
      component.onCompareToggled('d');

      expect(component.compareIds()).toEqual(['a', 'b', 'c']);
      expect(component.compareMode()).toBe(false);
    });

    it('drops a checked run when its checkbox is pressed again', () => {
      component.compareIds.set(['a', 'b']);
      component.onCompareToggled('a');

      expect(component.compareIds()).toEqual(['b']);
    });

    it('resolves compare origin study name when origin study exists', () => {
      const study = openStudy(['a']);
      component.compareOriginStudyId.set(study.id);

      expect(component.compareOriginStudyName()).toBe('Q3 meta');

      component.compareOriginStudyId.set(null);
      expect(component.compareOriginStudyName()).toBeNull();
    });

    it('resolves algorithm human label or falls back to raw code', () => {
      expect(component.getAlgorithmLabel('mock_anova')).toBe('Analysis of Variance');
      expect(component.getAlgorithmLabel('unknown_algo')).toBe('unknown_algo');
      expect(component.getAlgorithmLabel(null)).toBe('Unknown algorithm');
    });
  });
});
