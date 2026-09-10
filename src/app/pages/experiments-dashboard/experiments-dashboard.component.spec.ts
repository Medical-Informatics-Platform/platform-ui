import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { EMPTY, of } from 'rxjs';

import { Experiment } from '../../models/experiments-dashboard.model';
import { AuthService } from '../../services/auth.service';
import { ExperimentStudioService } from '../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../services/experiments-dashboard.service';
import { ExperimentFoldersService } from '../../services/experiment-folders.service';
import { ExperimentsDashboardComponent } from './experiments-dashboard.component';

const apiUrl = '/services/experiments';

const experiment = (id: string, overrides: Partial<Experiment> = {}): Experiment => ({
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

const backendExperiment = (uuid: string) => ({
  uuid,
  name: `Run ${uuid}`,
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

/**
 * The centre-pane wiring around the folder canvas: how a folder reaches compare mode, and
 * the one event allowed to forget a member. The component is built in an injection context
 * rather than from its template — the pane children have their own specs, and this one is
 * about which signals a handoff sets.
 */
describe('ExperimentsDashboardComponent folders', () => {
  let component: ExperimentsDashboardComponent;
  let dashboardService: ExperimentsDashboardService;
  let foldersService: ExperimentFoldersService;
  let httpMock: HttpTestingController;

  const openFolder = (memberIds: string[]) => {
    const folder = foldersService.createFolder('Q3 meta', memberIds[0])!;
    memberIds.slice(1).forEach((id) => foldersService.addExperiment(folder.id, id));
    return folder;
  };

  beforeEach(async () => {
    localStorage.clear();
    foldersService = new ExperimentFoldersService();
    foldersService.useUserScope(null);

    await TestBed.configureTestingModule({
      imports: [ExperimentsDashboardComponent, HttpClientTestingModule],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: EMPTY } },
        {
          provide: AuthService,
          useValue: { authState: signal({ status: 'authenticated', user: { email: 'marie.curie@chuv.ch' } }) },
        },
        {
          provide: ExperimentStudioService,
          useValue: { pathologyAccessWarning: signal(null), getAllDataModels: () => of([]) },
        },
        { provide: ExperimentFoldersService, useValue: foldersService },
      ],
    });

    component = TestBed.runInInjectionContext(() => new ExperimentsDashboardComponent())!;
    dashboardService = TestBed.inject(ExperimentsDashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('fetches off-page members before handing the folder to compare mode', () => {
    // The list is server-paginated: only "a" is on the loaded page.
    dashboardService.experiments.set([experiment('a')]);
    const folder = openFolder(['a', 'b']);
    TestBed.flushEffects();

    component.onFolderSelected(folder.id);
    expect(component.selectedFolderId()).toBe(folder.id);
    expect(component.compareMode()).toBeFalse();

    component.onFolderCompare(['a', 'b']);
    expect(component.compareMode()).toBeFalse();

    httpMock.expectOne(`${apiUrl}/b`).flush(backendExperiment('b'));

    // The off-page member had to join the loaded list: the workspace reads that page only.
    expect(component.compareIds()).toEqual(['a', 'b']);
    expect(component.compareMode()).toBeTrue();
    expect(component.selectedFolderId()).toBeNull();
    expect(dashboardService.experiments().map((exp) => exp.id).sort()).toEqual(['a', 'b']);
    expect(component.experimentsForCompare().map((exp) => exp.id).sort()).toEqual(['a', 'b']);
  });

  it('leaves compare mode when a folder takes the centre pane', () => {
    const folder = openFolder(['a']);
    component.compareMode.set(true);
    component.compareIds.set(['a']);

    component.onFolderSelected(folder.id);

    expect(component.compareMode()).toBeFalse();
    expect(component.compareIds()).toEqual([]);
    expect(component.selectedFolderId()).toBe(folder.id);
  });

  it('gives up the folder canvas when compare is turned on by hand', () => {
    // The template checks the folder branch first, so a folder left open would keep the pane
    // and the Compare button would flip to Exit over an unchanged canvas.
    dashboardService.experiments.set([experiment('a'), experiment('b')]);
    const folder = openFolder(['a', 'b']);
    component.onFolderSelected(folder.id);

    component.toggleCompareMode();

    expect(component.compareMode()).toBeTrue();
    expect(component.selectedFolderId()).toBeNull();
  });

  it('keeps the canvas order in the compare workspace', () => {
    // The page lists them a, b; the canvas numbered them 1 = b, 2 = a.
    dashboardService.experiments.set([experiment('a'), experiment('b')]);
    const folder = openFolder(['b', 'a']);
    TestBed.flushEffects();

    component.onFolderSelected(folder.id);
    component.onFolderCompare(['b', 'a']);

    expect(component.compareIds()).toEqual(['b', 'a']);
    expect(component.experimentsForCompare().map((exp) => exp.id)).toEqual(['b', 'a']);
  });

  it('hands the workspace back to the folder it came from', () => {
    dashboardService.experiments.set([experiment('a'), experiment('b')]);
    const folder = openFolder(['a', 'b']);

    component.onFolderSelected(folder.id);
    component.onFolderCompare(['a', 'b']);
    expect(component.compareOriginFolderId()).toBe(folder.id);

    component.onBackToOriginFolder();

    expect(component.selectedFolderId()).toBe(folder.id);
    expect(component.compareMode()).toBeFalse();
  });

  it('forgets the origin folder once compare is entered by hand', () => {
    dashboardService.experiments.set([experiment('a'), experiment('b')]);
    const folder = openFolder(['a', 'b']);

    component.onFolderSelected(folder.id);
    component.onFolderCompare(['a', 'b']);
    expect(component.compareOriginFolderId()).toBe(folder.id);

    // Exit, then press Compare again: the set is hand-built from here.
    component.toggleCompareMode();
    component.toggleCompareMode();

    expect(component.compareOriginFolderId()).toBeNull();
  });

  it('prunes a deleted run from every folder', () => {
    const first = openFolder(['a', 'off-page']);
    const second = foldersService.createFolder('PCA', 'a')!;
    component.compareIds.set(['a']);
    TestBed.flushEffects();

    component.confirmDelete('a');
    httpMock.expectOne(`${apiUrl}/a`).flush({});

    expect(foldersService.folderById(first.id)?.experimentIds).toEqual(['off-page']);
    expect(foldersService.folderById(second.id)?.experimentIds).toEqual([]);
    expect(component.compareIds()).toEqual([]);
  });

  it('does not prune folder membership until the delete succeeds', () => {
    const folder = openFolder(['a', 'off-page']);
    TestBed.flushEffects();

    component.confirmDelete('a');
    httpMock.expectOne(`${apiUrl}/a`).flush('delete failed', {
      status: 500,
      statusText: 'Server Error',
    });

    expect(foldersService.folderById(folder.id)?.experimentIds).toEqual(['a', 'off-page']);
  });

  it('never prunes folder members against the visible page', () => {
    const folder = openFolder(['a', 'off-page']);
    TestBed.flushEffects();

    // A page refresh that does not contain the members is not evidence they are gone.
    dashboardService.experiments.set([]);
    TestBed.flushEffects();

    expect(foldersService.folderById(folder.id)?.experimentIds).toEqual(['a', 'off-page']);
  });
});
