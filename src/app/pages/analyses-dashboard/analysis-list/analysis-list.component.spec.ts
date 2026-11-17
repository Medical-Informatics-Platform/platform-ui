import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Analysis } from '../../../models/analyses-dashboard.model';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { AnalysesDashboardService } from '../../../services/analyses-dashboard.service';
import { StudiesService } from '../../../services/studies.service';
import { AnalysisLabelService } from '../../../services/analysis-label.service';
import { FakeStudiesService } from '../studies.testing';
import { AnalysesListComponent, dayBucket } from './analysis-list.component';

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

describe('AnalysesListComponent list pane', () => {
  let fixture: ComponentFixture<AnalysesListComponent>;
  let component: AnalysesListComponent;
  let studiesService: FakeStudiesService;
  let loaded: ReturnType<typeof signal<Analysis[]>>;
  let labelMaps: Record<string, Record<string, string>>;
  let pendingLabels: Promise<Record<string, string>> | null;

  const root = () => fixture.nativeElement as HTMLElement;
  const rowTrigger = () =>
    (fixture.nativeElement as HTMLElement).querySelector('.study-menu-anchor > .icon-btn') as HTMLButtonElement;

  const rows = () => Array.from(root().querySelectorAll<HTMLElement>('.analysis-row'));
  const studySelect = () => root().querySelector<HTMLSelectElement>('select[aria-label="Study"]')!;

  /** A pick from the select, the way the browser hands one over. */
  const pickStudy = (value: string) => {
    const select = studySelect();
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };

  beforeEach(async () => {
    studiesService = new FakeStudiesService();
    loaded = signal<Analysis[]>([analysis('a'), analysis('b')]);
    labelMaps = {};
    pendingLabels = null;

    await TestBed.configureTestingModule({
      imports: [AnalysesListComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AnalysesDashboardService,
          useValue: {
            analyses: loaded,
            totalPages: signal(1),
            totalAnalyses: signal(2),
            historyTruncated: signal(false),
            fullHistoryCap: 2500,
            isLoading: signal(false),
            getUserAnalyses: vi.fn(),
            toggleAnalysisShare: vi.fn().mockReturnValue(of({ shared: true })),
          },
        },
        {
          provide: AnalysisStudioService,
          useValue: { loadAllDataModels: () => of([]), backendAlgorithms: signal({}) },
        },
        { provide: StudiesService, useValue: studiesService },
        {
          provide: AnalysisLabelService,
          useValue: {
            getLabelMap: (domain: string) => pendingLabels ?? Promise.resolve(labelMaps[domain] ?? {}),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalysesListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('offers one option per study with its member count, and wears the open study', () => {
    studiesService.seedStudy('ANOVA', ['a']);
    studiesService.seedStudy('PCA');
    fixture.componentRef.setInput('selectedStudyId', studiesService.studies()[0].id);
    fixture.detectChanges();

    const texts = Array.from(studySelect().options).map((option) => option.textContent!.trim());
    expect(texts).toContain('All studies');
    expect(texts).toContain('ANOVA (1)');
    expect(texts).toContain('PCA (0)');
    expect(studySelect().value).toBe(studiesService.studies()[0].id);
  });

  it('names the history a client-side filter could not read, beside the count it limits', () => {
    const dashboard = TestBed.inject(AnalysesDashboardService) as any;
    dashboard.historyTruncated.set(true);
    fixture.detectChanges();

    const summary = root().querySelector('.list-summary')!;
    expect(summary.textContent).toContain('of');
    expect(summary.querySelector('.list-summary-note')?.textContent)
      .toContain('searched your 2500 most recent analyses');

    dashboard.historyTruncated.set(false);
    fixture.detectChanges();
    expect(root().querySelector('.list-summary-note')).toBeNull();
  });

  it('sits under the tabs, never above search: the study select is part of the tabs row', () => {
    studiesService.seedStudy('ANOVA');
    fixture.detectChanges();

    const regions = Array.from(
      root().querySelectorAll<HTMLElement>('.list-toolbar, .analyses-tabs-row'),
    ).map((region) => (region.classList.contains('list-toolbar') ? 'search' : 'tabs'));
    expect(regions).toEqual(['search', 'tabs']);
    expect(studySelect().closest('.analyses-tabs-row')).not.toBeNull();
  });

  it('keeps the "+ New" control on the tabs row and the study icon on the row', () => {
    studiesService.seedStudy('ANOVA');
    fixture.detectChanges();

    expect(root().querySelector('.study-chip--new')).toBeTruthy();

    // fa-object-group: fa-layer-group already means domain in this pane and is the compare placeholder.
    const rowTriggerIcon = root().querySelector('.study-menu-anchor .icon-btn i')!;
    expect(rowTriggerIcon.classList.contains('fa-object-group')).toBe(true);
    expect(rowTriggerIcon.classList.contains('fa-layer-group')).toBe(false);
  });

  it('tells the dashboard which study is open, and "All studies" is the clear', () => {
    const study = studiesService.seedStudy('ANOVA');
    fixture.detectChanges();

    const emitted: Array<string | null> = [];
    component.studySelected.subscribe((id) => emitted.push(id));

    pickStudy(study.id);
    fixture.componentRef.setInput('selectedStudyId', study.id);
    fixture.detectChanges();
    pickStudy('all');

    expect(emitted).toEqual([study.id, null]);
  });

  it('creates a study from the tabs row and opens it', () => {
    fixture.detectChanges();

    (root().querySelector('.study-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.study-chip-input') as HTMLInputElement;
    input.value = 'Sensitivity';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.study-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(studiesService.studies().map((study) => study.name)).toEqual(['Sensitivity']);

    const emitted: Array<string | null> = [];
    component.studySelected.subscribe((id) => emitted.push(id));
    pickStudy(studiesService.studies()[0].id);
    expect(emitted).toEqual([studiesService.studies()[0].id]);
  });

  it('rejects a duplicate name instead of creating a second study', () => {
    studiesService.seedStudy('ANOVA');
    fixture.detectChanges();

    (root().querySelector('.study-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.study-chip-input') as HTMLInputElement;
    input.value = 'anova';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.study-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(studiesService.studies().length).toBe(1);
    expect(root().querySelector('.study-strip-error')!.textContent).toContain('taken');
  });

  it('adds and drops the run of an opened row menu', () => {
    const study = studiesService.seedStudy('ANOVA');
    fixture.detectChanges();

    const trigger = root().querySelectorAll<HTMLButtonElement>('.study-menu-anchor > .icon-btn')[0];
    trigger.click();
    fixture.detectChanges();

    const items = root().querySelectorAll<HTMLElement>('.study-menu__item');
    expect(items.length).toBe(2); // the study plus "New study…"
    expect(items[0].querySelector('.study-menu__check')!.classList.contains('study-menu__check--off')).toBe(true);

    items[0].click();
    fixture.detectChanges();
    expect(studiesService.isMember(study.id, 'a')).toBe(true);

    // A pick is a tick, not a navigation: the menu stays open so a run can join a second study.
    const checks = root().querySelectorAll<HTMLElement>('.study-menu__item .study-menu__check');
    expect(checks[0].classList.contains('study-menu__check--off')).toBe(false);
    expect(root().querySelector('.study-menu')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    (checks[0].closest('.study-menu__item') as HTMLElement).click();
    fixture.detectChanges();
    expect(studiesService.isMember(study.id, 'a')).toBe(false);
  });

  it('treats a study pick as a study choice, not as a row selection', () => {
    studiesService.seedStudy('ANOVA');
    const selectAnalysis = vi.spyOn(fixture.componentInstance, 'selectAnalysis').mockReturnValue(undefined);
    fixture.detectChanges();

    rowTrigger().click();
    fixture.detectChanges();
    root().querySelector<HTMLElement>('.study-menu__item')!.click();
    fixture.detectChanges();

    expect(selectAnalysis).not.toHaveBeenCalled();
    expect(studiesService.studies()[0].analysisIds).toEqual(['a']);
  });

  it('keeps the menu open for its own clicks and closes on a click outside it', () => {
    studiesService.seedStudy('ANOVA');
    fixture.detectChanges();

    rowTrigger().click();
    fixture.detectChanges();

    // The panel hangs off the row, so "outside the trigger" must not yet mean "outside the menu".
    root()
      .querySelector<HTMLElement>('.study-menu__name')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('.study-menu')).toBeTruthy();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('.study-menu')).toBeNull();
  });

  it('states the model on its own line and checks a run into compare without selecting it', () => {
    loaded.set([analysis('a', { variables: ['MMSE'], covariates: ['Age'] }), analysis('b')]);
    fixture.detectChanges();

    expect(rows()[0].textContent).toContain('MMSE ~ Age');

    const selected: Analysis[] = [];
    const toggled: string[] = [];
    component.analysisSelected.subscribe((analysis) => selected.push(analysis));
    component.compareToggled.subscribe((id) => toggled.push(id));

    (rows()[0].querySelector('.row-check') as HTMLButtonElement).click();

    expect(toggled).toEqual(['a']);
    expect(selected).toEqual([]);
  });

  it('shows catalog labels on the model line and never the variable codes', async () => {
    labelMaps['dementia:1'] = { age: 'Age', biol_sex: 'Biological sex' };
    loaded.set([analysis('a', { domain: 'dementia:1', variables: ['age'], covariates: ['biol_sex'] })]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = rows()[0].textContent ?? '';
    expect(text).toContain('Age ~ Biological sex');
    expect(text).not.toContain('biol_sex');
    expect(text).not.toContain('age ~');
    expect(root().querySelector('.row-model-line')?.textContent).toBe('Age ~ Biological sex');
  });

  it('keeps the model line hidden until a real label exists', async () => {
    let resolveMap!: (map: Record<string, string>) => void;
    pendingLabels = new Promise((resolve) => {
      resolveMap = resolve;
    });
    loaded.set([analysis('a', { domain: 'dementia:1', variables: ['age'], covariates: ['biol_sex'] })]);
    fixture.detectChanges();

    expect(root().querySelector('.row-model-line')).toBeNull();
    expect(rows()[0].textContent).not.toContain('biol_sex');

    resolveMap({ age: 'age', biol_sex: 'Biological sex' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root().querySelector('.row-model-line')?.textContent).toBe('Biological sex');
    expect(rows()[0].textContent).not.toContain('age');
  });

  it('keeps the name form open when the create never reached the server', () => {
    vi.spyOn(console, 'error').mockReturnValue(undefined);
    studiesService.failWith('createStudy');
    fixture.detectChanges();

    (root().querySelector('.study-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.study-chip-input') as HTMLInputElement;
    input.value = 'Sensitivity';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.study-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(studiesService.studies()).toEqual([]);
    expect(root().querySelector('.study-chip-input')).toBeTruthy();
    expect(root().querySelector('.study-strip-error')!.textContent).toContain('Could not create the study');
  });

  it('says the studies could not be read at all, rather than showing an empty strip as the truth', () => {
    studiesService.loadError.set('Could not load your studies. Check the connection and reload the page.');
    fixture.detectChanges();

    expect(root().querySelector('.study-strip-error')!.textContent).toContain('Could not load your studies');
    expect(root().querySelector('.study-strip-hint')).toBeNull();
  });

  it('creates a study straight from the row menu and files the run in it', () => {
    fixture.detectChanges();

    root().querySelectorAll<HTMLButtonElement>('.study-menu-anchor > .icon-btn')[0].click();
    fixture.detectChanges();

    const newItem = root().querySelector('.study-menu__item--new') as HTMLButtonElement;
    newItem.click();
    fixture.detectChanges();

    const input = root().querySelector('.study-menu__input') as HTMLInputElement;
    input.value = 'Q3 meta';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.study-menu__form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(studiesService.studies().length).toBe(1);
    expect(studiesService.studies()[0].analysisIds).toEqual(['a']);
  });

  describe('the tabs row', () => {
    // Sort sits inside the filter panel, so the panel is opened before the orders are looked for.
    const trigger = () => root().querySelector<HTMLButtonElement>('.sort-overflow__trigger')!;

    // A sort pick writes the query, and the test browser keeps one page across specs: start clean, leave clean.
    beforeEach(() => {
      history.replaceState(null, '', '/analyses-dashboard');
      component.sort.set('created-desc');
    });
    afterEach(() => history.replaceState(null, '', '/analyses-dashboard'));

    const openFilters = () => {
      fixture.detectChanges();
      (root().querySelector('.filter-toggle-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
    };

    const orders = () => Array.from(root().querySelectorAll<HTMLElement>('.sort-overflow .row-overflow__item'));
    const details = () => root().querySelector<HTMLDetailsElement>('.sort-overflow')!;
    const checkOf = (item: HTMLElement) =>
      item.querySelector<HTMLElement>('.sort-overflow__check')!.classList.contains('sort-overflow__check--off');

    it('keeps the tabs and the controls on one row, with the six orders behind the sort icon', () => {
      fixture.detectChanges();
      // A select here measured 112px and pushed Filters onto a second line of its own.
      expect(root().querySelector('select.sort-select')).toBeNull();

      const rowEl = root().querySelector<HTMLElement>('.analyses-tabs-row')!;
      const tallest = Math.max(
        ...Array.from(rowEl.children).map((el) => (el as HTMLElement).getBoundingClientRect().height),
      );
      if (window.innerWidth > 640) {
        // Below that the two-row layout is the design, not an accident, and it re-wraps on purpose.
        // A wrapped row would stand as tall as both of its lines together.
        expect(rowEl.getBoundingClientRect().height).toBeLessThanOrEqual(tallest + 4);
      }

      openFilters();

      expect(trigger().title).toBe('Sort: Newest');
      expect(details().open).toBe(false);

      trigger().click();
      fixture.detectChanges();

      expect(orders().map((b) => b.textContent!.trim())).toEqual([
        'Newest',
        'Oldest',
        'Name A–Z',
        'Name Z–A',
        'Status',
        'Algorithm',
      ]);
      expect(checkOf(orders()[0])).toBe(false);
      expect(checkOf(orders()[1])).toBe(true);
      expect(details().open).toBe(true);
    });

    it('folds back into the icon once an order is taken, and says which one is on', () => {
      openFilters();
      trigger().click();
      fixture.detectChanges();

      orders()[2].click();
      fixture.detectChanges();

      expect(component.sort()).toBe('name-asc');
      expect(details().open).toBe(false);
      expect(trigger().title).toBe('Sort: Name A–Z');
    });
  });

  describe('the page count', () => {
    it('is paged once, with the range stated inside the pager', () => {
      fixture.detectChanges();

      expect(root().querySelectorAll('.list-pagination').length).toBe(1);
      expect(root().querySelector('.list-pagination small')).toBeNull();
      expect(root().querySelector('.list-summary')!.textContent).toContain('1–2 of 2');
    });
  });
});

describe('dayBucket', () => {
  const now = new Date(2026, 8, 28, 10, 0);

  it('splits by local calendar day: today, the six days before, then earlier', () => {
    expect(dayBucket(new Date(2026, 8, 28, 0, 5), now)).toBe('Today');
    expect(dayBucket(new Date(2026, 8, 27, 23, 59), now)).toBe('This week');
    expect(dayBucket(new Date(2026, 8, 22, 0, 0), now)).toBe('This week');
    expect(dayBucket(new Date(2026, 8, 21, 23, 59), now)).toBe('Earlier');
    expect(dayBucket('not a date', now)).toBe('Earlier');
  });
});
