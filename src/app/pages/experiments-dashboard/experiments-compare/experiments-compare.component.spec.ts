import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY } from 'rxjs';

import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentLabelService } from '../../../services/experiment-label.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsCompareComponent } from './experiments-compare.component';

const experiment = (id: string, algorithmName = 'mock_anova'): Experiment => ({
  id,
  name: `Run ${id}`,
  dateCreated: new Date('2026-01-01T00:00:00.000Z'),
  status: 'success',
  algorithmName,
  author: 'Marie Curie',
  authorEmail: 'marie.curie@chuv.ch',
  isShared: false,
});

/**
 * The compare page is read as a list of blocks. Two things decide what those blocks are: the sets
 * the origin folder defines, and the algorithm of everything nobody grouped. Both are read here —
 * sets are written on the folder canvas.
 */
describe('ExperimentsCompareComponent', () => {
  let fixture: ComponentFixture<ExperimentsCompareComponent>;
  let component: ExperimentsCompareComponent;
  let foldersService: ExperimentFoldersService;

  const root = () => fixture.nativeElement as HTMLElement;
  const headline = () => root().querySelector('.compare-header p')!.textContent!.trim();
  const sectionsOf = () => Array.from(root().querySelectorAll<HTMLElement>('.compare-section'));
  const sectionTitles = () =>
    sectionsOf().map((section) => section.querySelector('.section-title')!.textContent!.trim());
  const runRows = () => Array.from(root().querySelectorAll<HTMLElement>('.run-row'));
  const numbers = () => runRows().map((row) => row.querySelector('.run-index')!.textContent!.trim());
  const names = () => runRows().map((row) => row.querySelector('.run-name')!.textContent!.trim());

  const makeFolder = (name: string) => foldersService.createFolder(name)!;
  const show = (ids: string[], originFolderId: string | null = null) =>
    showRuns(ids.map((id) => experiment(id)), originFolderId);

  const showRuns = (experiments: Experiment[], originFolderId: string | null = null) => {
    fixture.componentRef.setInput('experiments', experiments);
    fixture.componentRef.setInput('originFolderId', originFolderId);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    localStorage.clear();
    foldersService = new ExperimentFoldersService();
    foldersService.useUserScope(null);

    await TestBed.configureTestingModule({
      imports: [ExperimentsCompareComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentFoldersService, useValue: foldersService },
        {
          provide: ExperimentsDashboardService,
          useValue: { experiments: signal<Experiment[]>([]), getExperimentResult: () => EMPTY },
        },
        {
          provide: ExperimentLabelService,
          useValue: { getLabelMap: async () => ({}), getEnumMaps: async () => ({}) },
        },
        {
          provide: ExperimentStudioService,
          useValue: { backendAlgorithms: signal<Record<string, { label: string }>>({ ttest: { label: 'T-test' } }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExperimentsCompareComponent);
    component = fixture.componentInstance;
  });

  describe('header', () => {
    it('counts the runs it holds instead of asking for a selection it has', () => {
      show(['a', 'b', 'c']);

      expect(headline()).toBe('Comparing your selection · 3 runs');
    });

    it('names the analysis set the compare came from and offers the way back', () => {
      const folder = makeFolder('Q3 meta');
      show(['a', 'b'], folder.id);

      expect(headline()).toBe('Comparing Q3 meta · 2 runs');

      const back = root().querySelector('.compare-back-btn') as HTMLButtonElement;
      expect(back.textContent).toContain('Back to Q3 meta');

      let emissions = 0;
      component.backToFolder.subscribe(() => emissions++);
      back.click();

      expect(emissions).toBe(1);
    });

    it('withholds the way back from a hand-built set', () => {
      show(['a', 'b']);

      expect(root().querySelector('.compare-back-btn')).toBeNull();
    });
  });

  describe('sections', () => {
    it('gives every ungrouped run the section of its algorithm', () => {
      showRuns([
        experiment('a', 'ttest'),
        experiment('b', 'chisq'),
        experiment('c', 'ttest'),
        experiment('d', 'describe'),
      ]);

      // A code with no label still gets a heading — an ungrouped run needs a home, not a special case.
      expect(sectionTitles()).toEqual(['T-test', 'chisq', 'describe']);
      expect(names()).toEqual(['Run a', 'Run c', 'Run b', 'Run d']);
    });

    it('puts the folder sets first and the leftovers after them', () => {
      const folder = makeFolder('Stroke');
      foldersService.addExperiment(folder.id, 'a');
      foldersService.addExperiment(folder.id, 'b');
      foldersService.addExperiment(folder.id, 'c');
      foldersService.createSet(folder.id, 'Age tests', 'a');
      foldersService.moveToSet(folder.id, 'b', foldersService.folders()[0].sets[0].id);

      show(['a', 'b', 'c'], folder.id);

      expect(sectionTitles()).toEqual(['Age tests', 'mock_anova']);
      expect(names()).toEqual(['Run a', 'Run b', 'Run c']);
      expect(sectionsOf()[0].querySelector('.section-tag')).toBeTruthy();
      expect(sectionsOf()[1].querySelector('.section-tag')).toBeNull();
    });

    it('numbers runs once across the whole comparison', () => {
      const folder = makeFolder('Stroke');
      foldersService.addExperiment(folder.id, 'a');
      foldersService.addExperiment(folder.id, 'b');
      const set = foldersService.createSet(folder.id, 'Age tests', 'b')!;

      showRuns([experiment('a', 'ttest'), experiment('b', 'ttest')], folder.id);
      fixture.detectChanges();

      expect(sectionTitles()).toEqual(['Age tests', 'T-test']);
      expect(numbers()).toEqual(['1', '2']);
      expect(set.name).toBe('Age tests');
    });

    it('withholds a heading for a set whose runs are not being compared', () => {
      const folder = makeFolder('Stroke');
      foldersService.addExperiment(folder.id, 'a');
      foldersService.createSet(folder.id, 'Age tests', 'a');

      show(['b'], folder.id);

      expect(sectionTitles()).toEqual(['mock_anova']);
    });

    it('collapses a section down to its heading and opens it again', () => {
      show(['a', 'b']);

      const toggle = sectionsOf()[0].querySelector<HTMLButtonElement>('.section-toggle-btn')!;
      toggle.click();
      fixture.detectChanges();

      expect(sectionsOf().length).toBe(1);
      expect(sectionsOf()[0].querySelector('.run-row')).toBeNull();
      expect(sectionTitles()).toEqual(['mock_anova']);
      expect(sectionsOf()[0].querySelector('.count-badge')!.textContent!.trim()).toBe('2');

      toggle.click();
      fixture.detectChanges();
      expect(runRows().length).toBe(2);
    });

    it('opens one run in place and leaves the others as one line each', () => {
      show(['a', 'b', 'c']);

      runRows()[1].querySelector<HTMLButtonElement>('.run-summary')!.click();
      fixture.detectChanges();

      expect(runRows().length).toBe(3);
      expect(runRows()[1].querySelector('.run-body')).toBeTruthy();
      expect(runRows()[0].querySelector('.run-body')).toBeNull();
      expect(runRows()[1].querySelector('.run-summary')!.getAttribute('aria-expanded')).toBe('true');
    });

    it('keeps the configuration closed inside an open run', () => {
      show(['a', 'b']);

      runRows()[0].querySelector<HTMLButtonElement>('.run-summary')!.click();
      fixture.detectChanges();
      expect(runRows()[0].querySelector('.config-body')).toBeNull();

      runRows()[0].querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();
      expect(runRows()[0].querySelector('.config-body')).toBeTruthy();
    });

    it('groups by algorithm alone when runs arrive with no folder at all', () => {
      const folder = makeFolder('Stroke');
      foldersService.addExperiment(folder.id, 'a');
      foldersService.createSet(folder.id, 'Age tests', 'a');

      showRuns([experiment('a', 'ttest'), experiment('b', 'chisq')]);

      expect(sectionTitles()).toEqual(['T-test', 'chisq']);
      expect(runRows().length).toBe(2);
    });

    it('reads the partition without editing it', () => {
      const folder = makeFolder('Stroke');
      foldersService.addExperiment(folder.id, 'a');
      foldersService.addExperiment(folder.id, 'b');
      const before = JSON.stringify(foldersService.folderById(folder.id));

      show(['a', 'b'], folder.id);
      runRows()[0].querySelector<HTMLButtonElement>('.run-summary')!.click();
      fixture.detectChanges();
      runRows()[0].querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();
      sectionsOf()[0].querySelector<HTMLButtonElement>('.section-toggle-btn')!.click();
      fixture.detectChanges();

      expect(JSON.stringify(foldersService.folderById(folder.id))).toBe(before);
    });
  });
});
