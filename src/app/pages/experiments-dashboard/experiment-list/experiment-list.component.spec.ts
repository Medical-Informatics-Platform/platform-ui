import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { ExperimentLabelService } from '../../../services/experiment-label.service';
import { FakeExperimentFoldersService } from '../experiment-folders.testing';
import { ExperimentsListComponent } from './experiment-list.component';

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

describe('ExperimentsListComponent list pane', () => {
  let fixture: ComponentFixture<ExperimentsListComponent>;
  let component: ExperimentsListComponent;
  let foldersService: FakeExperimentFoldersService;
  let loaded: ReturnType<typeof signal<Experiment[]>>;
  let labelMaps: Record<string, Record<string, string>>;
  let pendingLabels: Promise<Record<string, string>> | null;

  const root = () => fixture.nativeElement as HTMLElement;
  const rowTrigger = () =>
    (fixture.nativeElement as HTMLElement).querySelector('.folder-menu-anchor > .icon-btn') as HTMLButtonElement;

  const rows = () => Array.from(root().querySelectorAll<HTMLElement>('.experiment-row'));
  const folderSelect = () => root().querySelector<HTMLSelectElement>('select[aria-label="Folder"]')!;

  /** A pick from the select, the way the browser hands one over. */
  const pickFolder = (value: string) => {
    const select = folderSelect();
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };

  beforeEach(async () => {
    foldersService = new FakeExperimentFoldersService();
    loaded = signal<Experiment[]>([experiment('a'), experiment('b')]);
    labelMaps = {};
    pendingLabels = null;

    await TestBed.configureTestingModule({
      imports: [ExperimentsListComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ExperimentsDashboardService,
          useValue: {
            experiments: loaded,
            totalPages: signal(1),
            totalExperiments: signal(2),
            historyTruncated: signal(false),
            fullHistoryCap: 2500,
            isLoading: signal(false),
            getUserExperiments: jasmine.createSpy('getUserExperiments'),
            toggleExperimentShare: jasmine.createSpy('toggleExperimentShare').and.returnValue(of({ shared: true })),
          },
        },
        {
          provide: ExperimentStudioService,
          useValue: { loadAllDataModels: () => of([]), backendAlgorithms: signal({}) },
        },
        { provide: ExperimentFoldersService, useValue: foldersService },
        {
          provide: ExperimentLabelService,
          useValue: {
            getLabelMap: (domain: string) => pendingLabels ?? Promise.resolve(labelMaps[domain] ?? {}),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExperimentsListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('offers one option per folder with its member count, and wears the open folder', () => {
    foldersService.seedFolder('ANOVA', ['a']);
    foldersService.seedFolder('PCA');
    fixture.componentRef.setInput('selectedFolderId', foldersService.folders()[0].id);
    fixture.detectChanges();

    const texts = Array.from(folderSelect().options).map((option) => option.textContent!.trim());
    expect(texts).toContain('All folders');
    expect(texts).toContain('ANOVA (1)');
    expect(texts).toContain('PCA (0)');
    expect(folderSelect().value).toBe(foldersService.folders()[0].id);
  });

  it('names the history a client-side filter could not read, beside the count it limits', () => {
    const dashboard = TestBed.inject(ExperimentsDashboardService) as any;
    dashboard.historyTruncated.set(true);
    fixture.detectChanges();

    const summary = root().querySelector('.list-summary')!;
    expect(summary.textContent).toContain('of');
    expect(summary.querySelector('.list-summary-note')?.textContent)
      .toContain('searched your 2500 most recent experiments');

    dashboard.historyTruncated.set(false);
    fixture.detectChanges();
    expect(root().querySelector('.list-summary-note')).toBeNull();
  });

  it('sits under the tabs, never above search: the folder select is part of the tabs row', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const regions = Array.from(
      root().querySelectorAll<HTMLElement>('.list-toolbar, .experiments-tabs-row'),
    ).map((region) => (region.classList.contains('list-toolbar') ? 'search' : 'tabs'));
    expect(regions).toEqual(['search', 'tabs']);
    expect(folderSelect().closest('.experiments-tabs-row')).not.toBeNull();
  });

  it('keeps the "+ New" control on the tabs row and the folder icon on the row', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    expect(root().querySelector('.folder-chip--new')).toBeTruthy();

    // fa-object-group: fa-layer-group already means domain in this pane and is the compare placeholder.
    const rowTriggerIcon = root().querySelector('.folder-menu-anchor .icon-btn i')!;
    expect(rowTriggerIcon.classList.contains('fa-object-group')).toBeTrue();
    expect(rowTriggerIcon.classList.contains('fa-layer-group')).toBeFalse();
  });

  it('tells the dashboard which folder is open, and "All folders" is the clear', () => {
    const folder = foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const emitted: Array<string | null> = [];
    component.folderSelected.subscribe((id) => emitted.push(id));

    pickFolder(folder.id);
    fixture.componentRef.setInput('selectedFolderId', folder.id);
    fixture.detectChanges();
    pickFolder('all');

    expect(emitted).toEqual([folder.id, null]);
  });

  it('creates a folder from the tabs row and opens it', () => {
    fixture.detectChanges();

    (root().querySelector('.folder-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-chip-input') as HTMLInputElement;
    input.value = 'Sensitivity';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.folder-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders().map((folder) => folder.name)).toEqual(['Sensitivity']);

    const emitted: Array<string | null> = [];
    component.folderSelected.subscribe((id) => emitted.push(id));
    pickFolder(foldersService.folders()[0].id);
    expect(emitted).toEqual([foldersService.folders()[0].id]);
  });

  it('rejects a duplicate name instead of creating a second folder', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    (root().querySelector('.folder-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-chip-input') as HTMLInputElement;
    input.value = 'anova';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.folder-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders().length).toBe(1);
    expect(root().querySelector('.folder-strip-error')!.textContent).toContain('taken');
  });

  it('adds and drops the run of an opened row menu', () => {
    const folder = foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const trigger = root().querySelectorAll<HTMLButtonElement>('.folder-menu-anchor > .icon-btn')[0];
    trigger.click();
    fixture.detectChanges();

    const items = root().querySelectorAll<HTMLElement>('.folder-menu__item');
    expect(items.length).toBe(2); // the folder plus "New folder…"
    expect(items[0].querySelector('.folder-menu__check')!.classList.contains('folder-menu__check--off')).toBeTrue();

    items[0].click();
    fixture.detectChanges();
    expect(foldersService.isMember(folder.id, 'a')).toBeTrue();

    // A pick is a tick, not a navigation: the menu stays open so a run can join a second folder.
    const checks = root().querySelectorAll<HTMLElement>('.folder-menu__item .folder-menu__check');
    expect(checks[0].classList.contains('folder-menu__check--off')).toBeFalse();
    expect(root().querySelector('.folder-menu')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    (checks[0].closest('.folder-menu__item') as HTMLElement).click();
    fixture.detectChanges();
    expect(foldersService.isMember(folder.id, 'a')).toBeFalse();
  });

  it('treats a folder pick as a folder choice, not as a row selection', () => {
    foldersService.seedFolder('ANOVA');
    const selectExperiment = spyOn(fixture.componentInstance, 'selectExperiment');
    fixture.detectChanges();

    rowTrigger().click();
    fixture.detectChanges();
    root().querySelector<HTMLElement>('.folder-menu__item')!.click();
    fixture.detectChanges();

    expect(selectExperiment).not.toHaveBeenCalled();
    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
  });

  it('keeps the menu open for its own clicks and closes on a click outside it', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    rowTrigger().click();
    fixture.detectChanges();

    // The panel hangs off the row, so "outside the trigger" must not yet mean "outside the menu".
    root()
      .querySelector<HTMLElement>('.folder-menu__name')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('.folder-menu')).toBeTruthy();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('.folder-menu')).toBeNull();
  });

  it('states the model on its own line and checks a run into compare without selecting it', () => {
    loaded.set([experiment('a', { variables: ['MMSE'], covariates: ['Age'] }), experiment('b')]);
    fixture.detectChanges();

    expect(rows()[0].textContent).toContain('MMSE ~ Age');

    const selected: Experiment[] = [];
    const toggled: string[] = [];
    component.experimentSelected.subscribe((exp) => selected.push(exp));
    component.compareToggled.subscribe((id) => toggled.push(id));

    (rows()[0].querySelector('.row-check') as HTMLButtonElement).click();

    expect(toggled).toEqual(['a']);
    expect(selected).toEqual([]);
  });

  it('shows catalog labels on the model line and never the variable codes', async () => {
    labelMaps['dementia:1'] = { age: 'Age', biol_sex: 'Biological sex' };
    loaded.set([experiment('a', { domain: 'dementia:1', variables: ['age'], covariates: ['biol_sex'] })]);
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
    loaded.set([experiment('a', { domain: 'dementia:1', variables: ['age'], covariates: ['biol_sex'] })]);
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
    spyOn(console, 'error');
    foldersService.failWith('createFolder');
    fixture.detectChanges();

    (root().querySelector('.folder-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-chip-input') as HTMLInputElement;
    input.value = 'Sensitivity';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.folder-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders()).toEqual([]);
    expect(root().querySelector('.folder-chip-input')).toBeTruthy();
    expect(root().querySelector('.folder-strip-error')!.textContent).toContain('Could not create the folder');
  });

  it('says the folders could not be read at all, rather than showing an empty strip as the truth', () => {
    foldersService.loadError.set('Could not load your folders. Check the connection and reload the page.');
    fixture.detectChanges();

    expect(root().querySelector('.folder-strip-error')!.textContent).toContain('Could not load your folders');
    expect(root().querySelector('.folder-strip-hint')).toBeNull();
  });

  it('creates a folder straight from the row menu and files the run in it', () => {
    fixture.detectChanges();

    root().querySelectorAll<HTMLButtonElement>('.folder-menu-anchor > .icon-btn')[0].click();
    fixture.detectChanges();

    const newItem = root().querySelector('.folder-menu__item--new') as HTMLButtonElement;
    newItem.click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-menu__input') as HTMLInputElement;
    input.value = 'Q3 meta';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.folder-menu__form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders().length).toBe(1);
    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
  });

  describe('the tabs row', () => {
    // Sort sits inside the filter panel, so the panel is opened before the orders are looked for.
    const trigger = () => root().querySelector<HTMLButtonElement>('.sort-overflow__trigger')!;

    // A sort pick writes the query, and Karma keeps one page across specs: start clean, leave clean.
    beforeEach(() => {
      history.replaceState(null, '', '/experiments-dashboard');
      component.sort.set('created-desc');
    });
    afterEach(() => history.replaceState(null, '', '/experiments-dashboard'));

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

      const rowEl = root().querySelector<HTMLElement>('.experiments-tabs-row')!;
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
      expect(details().open).toBeFalse();

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
      expect(checkOf(orders()[0])).toBeFalse();
      expect(checkOf(orders()[1])).toBeTrue();
      expect(details().open).toBeTrue();
    });

    it('folds back into the icon once an order is taken, and says which one is on', () => {
      openFilters();
      trigger().click();
      fixture.detectChanges();

      orders()[2].click();
      fixture.detectChanges();

      expect(component.sort()).toBe('name-asc');
      expect(details().open).toBeFalse();
      expect(trigger().title).toBe('Sort: Name A–Z');
    });
  });

  describe('the page count', () => {
    it('is paged once, with the range stated inside the pager', () => {
      fixture.detectChanges();

      expect(root().querySelectorAll('.list-pagination').length).toBe(1);
      expect(root().querySelector('.list-pagination small')).toBeNull();
      expect(root().querySelector('.list-summary')!.textContent).toContain('Showing 1–2 of 2');
    });
  });
});
