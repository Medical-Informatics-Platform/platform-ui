import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideEchartsCore } from 'ngx-echarts';
import { EMPTY, of } from 'rxjs';

import { Analysis } from '../../../models/analyses-dashboard.model';
import { AnalysisLabelService } from '../../../services/analysis-label.service';
import { AnalysesDashboardService } from '../../../services/analyses-dashboard.service';
import { StudiesService } from '../../../services/studies.service';
import { FakeStudiesService } from '../studies.testing';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { AnalysesCompareComponent } from './analyses-compare.component';

const analysis = (id: string, algorithmName = 'mock_anova'): Analysis => ({
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
 * The compare page is read as columns side by side. Two things decide the order those columns
 * lay out in: the groups the origin study defines, and the algorithm of everything nobody
 * grouped. Both are read here — groups are written on the study canvas.
 */
describe('AnalysesCompareComponent', () => {
  let fixture: ComponentFixture<AnalysesCompareComponent>;
  let component: AnalysesCompareComponent;
  let studiesService: FakeStudiesService;
  let dashboard: { analyses: unknown; getAnalysisResult: (id: string) => unknown };

  const root = () => fixture.nativeElement as HTMLElement;
  const headline = () => root().querySelector('.compare-header p')!.textContent!.trim();
  const columnsOf = () => Array.from(root().querySelectorAll<HTMLElement>('.compare-column'));
  const columnNames = () => columnsOf().map((column) => column.querySelector('.column-name')!.textContent!.trim());
  const numbers = () => columnsOf().map((column) => column.querySelector('.run-index')!.textContent!.trim());
  const algos = () => columnsOf().map((column) => column.querySelector('.run-algo')!.textContent!.trim());
  const groupTags = () => columnsOf().map((column) => column.querySelector('.column-group-tag')?.textContent!.trim() ?? null);

  /** A study the compare can read: the workspace writes nothing, so specs seed rather than click. */
  const makeStudy = (name: string, memberIds: string[] = []) => studiesService.seedStudy(name, memberIds);
  const show = (ids: string[], originStudyId: string | null = null) =>
    showRuns(ids.map((id) => analysis(id)), originStudyId);

  const showRuns = (analyses: Analysis[], originStudyId: string | null = null) => {
    fixture.componentRef.setInput('analyses', analyses);
    fixture.componentRef.setInput('originStudyId', originStudyId);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    studiesService = new FakeStudiesService();
    dashboard = { analyses: signal<Analysis[]>([]), getAnalysisResult: () => EMPTY };

    await TestBed.configureTestingModule({
      imports: [AnalysesCompareComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideEchartsCore({ echarts: () => import('echarts') }),
        { provide: StudiesService, useValue: studiesService },
        { provide: AnalysesDashboardService, useValue: dashboard },
        {
          provide: AnalysisLabelService,
          useValue: { getLabelMap: async () => ({}), getEnumMaps: async () => ({}) },
        },
        {
          provide: AnalysisStudioService,
          useValue: {
            backendAlgorithms: signal<Record<string, { label: string }>>({ ttest: { label: 'T-test' } }),
            algorithmAssignableVariables: () => [],
            selectedFilters: () => [],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalysesCompareComponent);
    component = fixture.componentInstance;
  });

  describe('header', () => {
    it('counts the runs it holds instead of asking for a selection it has', () => {
      show(['a', 'b', 'c']);

      expect(headline()).toBe('Comparing your selection · 3 runs');
    });

    it('names the study the compare came from and offers the way back', () => {
      const study = makeStudy('Q3 meta');
      show(['a', 'b'], study.id);

      expect(headline()).toBe('Comparing Q3 meta · 2 runs');

      const back = root().querySelector('.compare-back-btn') as HTMLButtonElement;
      expect(back.textContent).toContain('Back to Q3 meta');

      let emissions = 0;
      component.backToStudy.subscribe(() => emissions++);
      back.click();

      expect(emissions).toBe(1);
    });

    it('withholds the way back from a hand-built comparison', () => {
      show(['a', 'b']);

      expect(root().querySelector('.compare-back-btn')).toBeNull();
    });
  });

  describe('results', () => {
    it('hands each run its own parameters, so a t-test column names the groups it compared', () => {
      dashboard.getAnalysisResult = () => of({
        result: { t_stat: -3.9, df: 120, p: 0.0001, mean_diff: -1.2, ci_lower: -1.8, ci_upper: -0.6 },
        analysisRequest: { algorithm: { parameters: { groupA: 'M', groupB: 'F' } } },
      });
      showRuns([analysis('a', 'ttest_independent')]);
      fixture.detectChanges();

      expect(root().querySelector('.compare-column app-key-figures')?.textContent).toContain('M − F');
    });
  });

  describe('datasets', () => {
    it('shows dataset names, not the numeric codes the analysis stores', async () => {
      TestBed.inject(AnalysisLabelService).getLabelMap = async () => ({ '12': 'EDSD', '13': 'PPMI' });
      showRuns([{ ...analysis('a'), domain: 'dementia:1', datasets: ['12', '13', '99'] }]);
      await new Promise((resolve) => setTimeout(resolve));
      root().querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();

      const tags = Array.from(root().querySelectorAll('.config-tags-row'))
        .find((row) => row.querySelector('.k')?.textContent?.trim() === 'Datasets')!
        .querySelectorAll('.tag');
      expect(Array.from(tags).map((tag) => tag.textContent!.trim())).toEqual(['EDSD', 'PPMI', '99']);
    });
  });

  describe('columns', () => {
    it('gives every ungrouped run a column, grouped and ordered by its algorithm', () => {
      showRuns([
        analysis('a', 'ttest'),
        analysis('b', 'chisq'),
        analysis('c', 'ttest'),
        analysis('d', 'describe'),
      ]);

      // A code with no label still shows its own name — an ungrouped run needs a home, not a special case.
      expect(columnNames()).toEqual(['Run a', 'Run c', 'Run b', 'Run d']);
      expect(algos()).toEqual(['T-test', 'T-test', 'chisq', 'describe']);
      expect(groupTags()).toEqual([null, null, null, null]);
    });

    it('puts the study groups first and the leftovers after them', () => {
      const study = makeStudy('Stroke', ['a', 'b', 'c']);
      studiesService.seedGroup(study.id, 'Age tests', ['a', 'b']);

      show(['a', 'b', 'c'], study.id);

      expect(columnNames()).toEqual(['Run a', 'Run b', 'Run c']);
      expect(groupTags()).toEqual(['Age tests', 'Age tests', null]);
    });

    it('numbers runs once across the whole comparison', () => {
      const study = makeStudy('Stroke', ['a', 'b']);
      studiesService.seedGroup(study.id, 'Age tests', ['b']);

      showRuns([analysis('a', 'ttest'), analysis('b', 'ttest')], study.id);
      fixture.detectChanges();

      expect(columnNames()).toEqual(['Run b', 'Run a']);
      expect(numbers()).toEqual(['1', '2']);
      expect(groupTags()).toEqual(['Age tests', null]);
    });

    it('withholds a column for a group whose runs are not being compared', () => {
      const study = makeStudy('Stroke', ['a']);
      studiesService.seedGroup(study.id, 'Age tests', ['a']);

      show(['b'], study.id);

      expect(columnNames()).toEqual(['Run b']);
      expect(groupTags()).toEqual([null]);
    });

    it('keeps the configuration closed per column and opens only the one it toggled', () => {
      show(['a', 'b']);

      expect(columnsOf()[0].querySelector('.config-body')).toBeNull();

      columnsOf()[0].querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();

      expect(columnsOf()[0].querySelector('.config-body')).toBeTruthy();
      expect(columnsOf()[1].querySelector('.config-body')).toBeNull();
    });

    it('renders each column its own result state', () => {
      show(['a', 'b']);

      // The stubbed result never answers, so every column sits in its own loading state.
      for (const column of columnsOf()) {
        expect(column.querySelector('.compare-results .muted-text')!.textContent).toContain('Loading');
      }
    });

    it('groups by algorithm alone when runs arrive with no study at all', () => {
      const study = makeStudy('Stroke', ['a']);
      studiesService.seedGroup(study.id, 'Age tests', ['a']);

      showRuns([analysis('a', 'ttest'), analysis('b', 'chisq')]);

      expect(columnNames()).toEqual(['Run a', 'Run b']);
      expect(groupTags()).toEqual([null, null]);
      expect(columnsOf().length).toBe(2);
    });

    it('reads the partition without editing it', () => {
      const study = makeStudy('Stroke', ['a', 'b']);
      studiesService.seedGroup(study.id, 'Age tests', ['a']);
      const before = JSON.stringify(studiesService.studyById(study.id));

      show(['a', 'b'], study.id);
      columnsOf()[0].querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();
      columnsOf()[1].querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();

      expect(JSON.stringify(studiesService.studyById(study.id))).toBe(before);
    });
  });
});
