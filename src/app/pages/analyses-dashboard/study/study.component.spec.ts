import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { ANALYSIS_DRAG_MIME } from '../../../core/analysis-drag.utils';
import { Analysis } from '../../../models/analyses-dashboard.model';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { AnalysesDashboardService } from '../../../services/analyses-dashboard.service';
import { StudiesService } from '../../../services/studies.service';
import { FakeStudiesService } from '../studies.testing';
import { StudyComponent } from './study.component';

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

describe('StudyComponent', () => {
  let fixture: ComponentFixture<StudyComponent>;
  let component: StudyComponent;
  let studiesService: FakeStudiesService;
  let loaded: ReturnType<typeof signal<Analysis[]>>;
  let fetchSpy: Mock;
  let pending: Subject<Analysis>;

  const root = () => fixture.nativeElement as HTMLElement;
  const canvas = () => root().querySelector<HTMLElement>('.study-canvas')!;
  const dataTransferWith = (type: string, value: string) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData(type, value);
    return dataTransfer;
  };
  /** Returns the event so a spec can assert whether the target accepted the drag. */
  const dragOverWith = (target: HTMLElement, dataTransfer: DataTransfer) => {
    const event = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
    target.dispatchEvent(event);
    return event;
  };
  const dropWith = (target: HTMLElement, dataTransfer: DataTransfer) => {
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
    target.dispatchEvent(event);
    return event;
  };
  const runDrag = (analysisId: string) => dataTransferWith(ANALYSIS_DRAG_MIME, analysisId);
  const notice = () => root().querySelector<HTMLElement>('.study-drop-notice');
  const rowsOf = () => Array.from(root().querySelectorAll<HTMLElement>('.member-row'));
  const groupsOf = () => Array.from(root().querySelectorAll<HTMLElement>('.member-group'));
  const groupHeaders = () => Array.from(root().querySelectorAll<HTMLElement>('.member-group-header'));
  const groupNames = () => groupHeaders().map((header) => header.querySelector('.member-group-name')!.textContent!.trim());
  const rowsIn = (group: HTMLElement) => Array.from(group.querySelectorAll<HTMLElement>('.member-row'));
  /** The move-to-group trigger sits in its own popover anchor; Remove stays the row's own action. */
  const groupTrigger = (rowIndex: number) => rowsOf()[rowIndex].querySelector<HTMLButtonElement>('.group-menu-anchor > .icon-btn')!;
  const removeButton = (rowIndex: number) => rowsOf()[rowIndex].querySelector<HTMLButtonElement>('.row-actions > .icon-btn:last-child')!;
  const headerAction = (label: string) =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.study-actions .study-form-action'))
      .find((button) => button.textContent!.trim().includes(label))!;

  /** Seeds the study the canvas is pointed at — the click paths have their own specs below. */
  const openStudy = (memberIds: string[], name = 'Q3 meta') => {
    const study = studiesService.seedStudy(name, memberIds);
    fixture.componentRef.setInput('studyId', study.id);
    return study;
  };

  beforeEach(async () => {
    studiesService = new FakeStudiesService();
    loaded = signal<Analysis[]>([]);
    pending = new Subject<Analysis>();
    fetchSpy = vi.fn().mockReturnValue(pending);

    await TestBed.configureTestingModule({
      imports: [StudyComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AnalysesDashboardService, useValue: { analyses: loaded, fetchAnalysisById: fetchSpy } },
        { provide: AnalysisStudioService, useValue: { backendAlgorithms: signal({}) } },
        { provide: StudiesService, useValue: studiesService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StudyComponent);
    component = fixture.componentInstance;
  });



  it('lists the members it can resolve from the loaded page', () => {
    loaded.set([analysis('a'), analysis('b')]);
    openStudy(['a', 'b']);
    fixture.detectChanges();

    expect(root().querySelector('.study-title')!.textContent.trim()).toBe('Q3 meta');
    expect(root().querySelector('.count-badge')!.textContent.trim()).toBe('2');
    expect(rowsOf().length).toBe(2);
    expect(rowsOf()[0].textContent).toContain('Run a');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks for a member that sits on another page and holds the row open while loading', () => {
    loaded.set([analysis('a')]);
    openStudy(['a', 'off-page']);
    fixture.detectChanges();

    expect(fetchSpy).toHaveBeenCalledWith('off-page');
    expect(rowsOf()[1].querySelector('.member-skeleton--title')).toBeTruthy();

    pending.next(analysis('off-page', { name: 'Off page run' }));
    fixture.detectChanges();

    expect(rowsOf()[1].textContent).toContain('Off page run');
    expect(rowsOf()[1].querySelector('.member-skeleton--title')).toBeNull();
  });

  it('reports a member the backend dropped and prunes it from the study', () => {
    loaded.set([analysis('a')]);
    openStudy(['a', 'off-page']);
    fixture.detectChanges();

    pending.error(new HttpErrorResponse({ status: 404 }));
    fixture.detectChanges();

    expect(rowsOf()[1].querySelector('.member-name--gone')!.textContent!.trim()).toBe('No longer available');
    expect(studiesService.studies()[0].analysisIds).toEqual(['a']);
  });

  it('keeps a member on a transient load error instead of pruning it', () => {
    loaded.set([analysis('a')]);
    openStudy(['a', 'off-page']);
    fixture.detectChanges();

    pending.error(new Error('network down'));
    fixture.detectChanges();

    expect(rowsOf()[1].textContent).toContain('Could not load this run');
    expect(studiesService.studies()[0].analysisIds).toEqual(['a', 'off-page']);
  });

  it('takes a run the backend dropped out of its group as well', () => {
    loaded.set([analysis('a')]);
    const study = openStudy(['a', 'off-page']);
    const group = studiesService.seedGroup(study.id, 'T-tests', ['off-page'])!;
    fixture.detectChanges();

    pending.error(new HttpErrorResponse({ status: 404 }));
    fixture.detectChanges();

    expect(studiesService.studies()[0].groups[0].id).toBe(group.id);
    expect(studiesService.studies()[0].groups[0].analysisIds).toEqual([]);
    expect(studiesService.studies()[0].analysisIds).toEqual(['a']);
  });

  it('explains how to add runs to an empty study', () => {
    openStudy([]);
    fixture.detectChanges();

    expect(root().querySelector('.study-empty')).toBeTruthy();
    expect(rowsOf().length).toBe(0);
  });

  it('numbers the members, so the canvas reads as an ordered study', () => {
    loaded.set([analysis('a'), analysis('b')]);
    openStudy(['b', 'a']);
    fixture.detectChanges();

    expect(rowsOf().map((row) => row.querySelector('.member-index')!.textContent!.trim())).toEqual(['1', '2']);
  });

  it('summarises what the study holds', () => {
    loaded.set([
      analysis('a', { algorithmName: 'mock_anova', domain: 'cmso' }),
      analysis('b', { algorithmName: 'mock_pca', domain: 'cmso' }),
    ]);
    openStudy(['a', 'b']);
    fixture.detectChanges();

    expect(root().querySelector('.study-summary')!.textContent!.trim()).toBe('2 algorithms · 1 domain');
  });

  it('withholds the summary until a member resolves', () => {
    openStudy(['off-page']);
    fixture.detectChanges();

    expect(root().querySelector('.study-summary')).toBeNull();

    pending.next(analysis('off-page', { algorithmName: 'mock_pca' }));
    fixture.detectChanges();

    expect(root().querySelector('.study-summary')!.textContent!.trim()).toBe('1 algorithm');
  });

  it('hands the member ids to the compare workspace in study order', () => {
    loaded.set([analysis('a'), analysis('b')]);
    openStudy(['b', 'a']);
    fixture.detectChanges();

    const emitted: string[][] = [];
    component.compareRequested.subscribe((ids) => emitted.push(ids));
    (root().querySelector('.study-compare-btn') as HTMLButtonElement).click();

    expect(emitted).toEqual([['b', 'a']]);
  });

  it('refuses to compare a single member', () => {
    loaded.set([analysis('a')]);
    openStudy(['a']);
    fixture.detectChanges();

    expect((root().querySelector('.study-compare-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renames the study through the service', () => {
    openStudy([]);
    fixture.detectChanges();

    headerAction('Rename').click();
    fixture.detectChanges();

    const input = root().querySelector('.study-rename-input') as HTMLInputElement;
    input.value = 'ANOVA sensitivity';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (root().querySelector('.study-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(studiesService.studies()[0].name).toBe('ANOVA sensitivity');
    expect(root().querySelector('.study-title')!.textContent.trim()).toBe('ANOVA sensitivity');
  });

  it('commits the rename on Enter', () => {
    openStudy([]);
    fixture.detectChanges();

    headerAction('Rename').click();
    fixture.detectChanges();

    const input = root().querySelector('.study-rename-input') as HTMLInputElement;
    input.value = 'PCA on bids';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(studiesService.studies()[0].name).toBe('PCA on bids');
    expect(root().querySelector('.study-rename-input')).toBeNull();
  });

  it('asks the server to delete the study and only leaves the canvas once it has agreed', () => {
    loaded.set([analysis('a')]);
    const study = openStudy(['a']);
    fixture.detectChanges();

    const back: number[] = [];
    component.back.subscribe(() => back.push(1));

    headerAction('Delete').click();
    fixture.detectChanges();
    (root().querySelector('.study-delete-confirm .study-form-action.danger') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(studiesService.studyById(study.id)).toBeNull();
    expect(component.isConfirmingDelete()).toBe(false);
    expect(back).toEqual([1]);
  });

  it('holds the canvas, and the confirmation, when the delete never reached the server', () => {
    vi.spyOn(console, 'error').mockReturnValue(undefined);
    loaded.set([analysis('a')]);
    const study = openStudy(['a']);
    studiesService.failWith('deleteStudy');
    fixture.detectChanges();

    const back: number[] = [];
    component.back.subscribe(() => back.push(1));

    headerAction('Delete').click();
    fixture.detectChanges();
    (root().querySelector('.study-delete-confirm .study-form-action.danger') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(studiesService.studyById(study.id)).toBeTruthy();
    expect(back).toEqual([]);
    expect(root().querySelector('.study-delete-confirm')).toBeTruthy();
    expect(root().querySelector('.study-form-error')!.textContent).toContain('Could not delete the study');
  });

  it('tells a server that did not answer apart from a name that is taken', () => {
    vi.spyOn(console, 'error').mockReturnValue(undefined);
    loaded.set([analysis('a')]);
    openStudy(['a']);
    fixture.detectChanges();

    headerAction('Rename').click();
    fixture.detectChanges();

    const input = root().querySelector('.study-rename-input') as HTMLInputElement;
    input.value = 'ANOVA sensitivity';
    input.dispatchEvent(new Event('input'));
    studiesService.failWith('renameStudy');
    (root().querySelector('.study-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(studiesService.studies()[0].name).toBe('Q3 meta');
    expect(root().querySelector('.study-rename-input')).toBeTruthy();
    expect(root().querySelector('.study-form-error')!.textContent).toContain('Could not rename the study');
  });

  it('keeps the row and says so when removing the run did not reach the server', () => {
    vi.spyOn(console, 'error').mockReturnValue(undefined);
    loaded.set([analysis('a'), analysis('b')]);
    const study = openStudy(['a', 'b']);
    studiesService.failWith('removeAnalysis');
    fixture.detectChanges();

    removeButton(0).click();
    fixture.detectChanges();

    expect(studiesService.studyById(study.id)!.analysisIds).toEqual(['a', 'b']);
    expect(rowsOf().length).toBe(2);
    expect(root().querySelector('.study-form-error')!.textContent).toContain('Could not remove that run');
  });

  it('dismisses a ghost row instead of no-opping against a pruned member', () => {
    loaded.set([analysis('a')]);
    openStudy(['a', 'off-page']);
    fixture.detectChanges();

    pending.error(new HttpErrorResponse({ status: 404 }));
    fixture.detectChanges();
    expect(rowsOf().length).toBe(2);

    removeButton(1).click();
    fixture.detectChanges();

    expect(rowsOf().length).toBe(1);
    expect(studiesService.studies()[0].analysisIds).toEqual(['a']);
  });

  it('removes a member without touching the analysis', () => {
    loaded.set([analysis('a'), analysis('b')]);
    openStudy(['a', 'b']);
    fixture.detectChanges();

    removeButton(0).click();
    fixture.detectChanges();

    expect(rowsOf().length).toBe(1);
    expect(loaded().length).toBe(2);
  });

  it('takes a run dragged onto the canvas and files it in the study', () => {
    loaded.set([analysis('a'), analysis('c')]);
    const study = openStudy(['a']);
    fixture.detectChanges();

    const dataTransfer = runDrag('c');
    const hover = dragOverWith(canvas(), dataTransfer);
    fixture.detectChanges();

    // Without preventDefault the browser never fires drop, so the ring would be a lie.
    expect(hover.defaultPrevented).toBe(true);
    expect(canvas().classList.contains('study-canvas--receiving')).toBe(true);

    dropWith(canvas(), dataTransfer);
    fixture.detectChanges();

    expect(studiesService.studyById(study.id)!.analysisIds).toEqual(['a', 'c']);
    expect(notice()!.textContent).toContain('Added to Q3 meta');
    expect(canvas().classList.contains('study-canvas--receiving')).toBe(false);
    expect(rowsOf()[1].classList.contains('member-row--landed')).toBe(true);
  });

  it('names a re-drop instead of adding the run twice or removing it', () => {
    openStudy(['a']);
    fixture.detectChanges();

    dragOverWith(canvas(), runDrag('a'));
    dropWith(canvas(), runDrag('a'));
    fixture.detectChanges();

    expect(studiesService.studies()[0].analysisIds).toEqual(['a']);
    expect(notice()!.textContent).toContain('Already in Q3 meta');
    expect(notice()!.classList.contains('study-drop-notice--duplicate')).toBe(true);
    expect(root().querySelector('.member-row--landed')).toBeNull();
  });

  it('withholds the "added" report from a drop the server refused', () => {
    vi.spyOn(console, 'error').mockReturnValue(undefined);
    loaded.set([analysis('a'), analysis('c')]);
    const study = openStudy(['a']);
    studiesService.failWith('addAnalysis');
    fixture.detectChanges();

    dropWith(canvas(), runDrag('c'));
    fixture.detectChanges();

    expect(studiesService.studyById(study.id)!.analysisIds).toEqual(['a']);
    expect(notice()).toBeNull();
    expect(root().querySelector('.study-form-error')!.textContent).toContain('Could not add that run');
  });

  it('leaves a drag alone that carries something other than a run', () => {
    openStudy(['a']);
    fixture.detectChanges();

    const dataTransfer = dataTransferWith('text/plain', 'a');
    const hover = dragOverWith(canvas(), dataTransfer);
    fixture.detectChanges();
    expect(hover.defaultPrevented).toBe(false);
    expect(canvas().classList.contains('study-canvas--receiving')).toBe(false);

    dropWith(canvas(), dataTransfer);
    fixture.detectChanges();
    expect(studiesService.studies()[0].analysisIds).toEqual(['a']);
    expect(notice()).toBeNull();
  });

  it('tells an empty study what the hovering run will do to it', () => {
    openStudy([]);
    fixture.detectChanges();
    expect(root().querySelector('.study-empty h3')!.textContent!.trim()).toBe('Nothing in this study yet');

    dragOverWith(canvas(), runDrag('c'));
    fixture.detectChanges();

    expect(root().querySelector('.study-empty--receiving')).toBeTruthy();
    expect(root().querySelector('.study-empty h3')!.textContent!.trim()).toBe('Drop it here');
  });

  it('fades its own drop report, with the newest drop holding the clock', () => {
    vi.useFakeTimers();
    try {
      loaded.set([analysis('a'), analysis('c')]);
      openStudy(['a']);
      fixture.detectChanges();

      dropWith(canvas(), runDrag('c'));
      fixture.detectChanges();
      expect(notice()!.textContent).toContain('Added');

      dropWith(canvas(), runDrag('c'));
      fixture.detectChanges();
      vi.advanceTimersByTime(2100);
      expect(notice()!.textContent).toContain('Already in');

      vi.advanceTimersByTime(200);
      fixture.detectChanges();
      expect(notice()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('groups', () => {
    it('partitions the members under their group headings, Ungrouped last', () => {
      loaded.set([analysis('a'), analysis('b'), analysis('c')]);
      const study = openStudy(['a', 'b', 'c']);
      studiesService.seedGroup(study.id, 'T-tests', ['b']);
      fixture.detectChanges();

      expect(groupNames()).toEqual(['T-tests', 'Ungrouped']);
      expect(rowsIn(groupsOf()[0]).map((row) => row.querySelector('.member-name')!.textContent!.trim())).toEqual(['Run b']);
      expect(rowsIn(groupsOf()[1]).length).toBe(2);
      // The group is a heading, not a renumbering: one order runs down the whole canvas.
      expect(rowsOf().map((row) => row.querySelector('.member-index')!.textContent!.trim())).toEqual(['1', '2', '3']);
    });

    it('numbers every member once when no group exists yet', () => {
      loaded.set([analysis('a'), analysis('b')]);
      openStudy(['a', 'b']);
      fixture.detectChanges();

      expect(groupNames()).toEqual(['Ungrouped']);
      expect(rowsOf().map((row) => row.querySelector('.member-index')!.textContent!.trim())).toEqual(['1', '2']);
    });

    it('collapses a group heading without losing its count', () => {
      loaded.set([analysis('a'), analysis('b'), analysis('c')]);
      const study = openStudy(['a', 'b', 'c']);
      studiesService.seedGroup(study.id, 'T-tests', ['b']);
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-toggle')!.click();
      fixture.detectChanges();

      expect(rowsIn(groupsOf()[0]).length).toBe(0);
      expect(groupHeaders()[0].querySelector('.count-badge')!.textContent!.trim()).toBe('1');
      expect(rowsIn(groupsOf()[1]).length).toBe(2);

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-toggle')!.click();
      fixture.detectChanges();
      expect(rowsIn(groupsOf()[0]).length).toBe(1);
    });

    it('withholds rename and delete from the implicit group', () => {
      loaded.set([analysis('a')]);
      openStudy(['a']);
      fixture.detectChanges();

      expect(groupHeaders()[0].querySelector('.member-group-actions')).toBeNull();
      expect(groupHeaders()[0].querySelector('.member-group-name')!.textContent!.trim()).toBe('Ungrouped');
    });

    it('moves a run into a group from its row, out of the group that had it', () => {
      loaded.set([analysis('a'), analysis('b')]);
      const study = openStudy(['a', 'b']);
      const ttests = studiesService.seedGroup(study.id, 'T-tests', ['a'])!;
      fixture.detectChanges();

      groupTrigger(1).click();
      fixture.detectChanges();
      expect(root().querySelector('.group-menu')).toBeTruthy();

      root().querySelectorAll<HTMLElement>('.group-menu__item')[0].click();
      fixture.detectChanges();

      expect(studiesService.groupOf(study.id, 'b')).toBe(ttests.id);
      // Strict means b cannot sit in two groups — it left Ungrouped, which is where it was. The run
      // T-tests already held keeps its home: a move files a run, it does not evict anyone.
      expect(studiesService.studyById(study.id)!.groups[0].analysisIds).toEqual(['a', 'b']);
      expect(rowsIn(groupsOf()[0]).length).toBe(2);
      expect(groupsOf().length).toBe(1);
    });

    it('leaves a group for Ungrouped without leaving the study', () => {
      loaded.set([analysis('a'), analysis('b')]);
      const study = openStudy(['a', 'b']);
      studiesService.seedGroup(study.id, 'T-tests', ['a']);
      fixture.detectChanges();

      groupTrigger(0).click();
      fixture.detectChanges();
      (root().querySelector('.group-menu__item--unset') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(studiesService.groupOf(study.id, 'a')).toBeNull();
      expect(studiesService.studyById(study.id)!.analysisIds).toEqual(['a', 'b']);
      expect(root().querySelector('.group-menu')).toBeNull();
      // An empty group keeps its heading and says what would fill it.
      expect(groupNames()).toEqual(['T-tests', 'Ungrouped']);
      expect(groupsOf()[0].querySelector('.member-group-empty')).toBeTruthy();
    });

    it('creates a group around the run whose menu is open', () => {
      loaded.set([analysis('a'), analysis('b')]);
      const study = openStudy(['a', 'b']);
      fixture.detectChanges();

      groupTrigger(0).click();
      fixture.detectChanges();
      (root().querySelector('.group-menu__item--new') as HTMLButtonElement).click();
      fixture.detectChanges();

      const input = root().querySelector('.group-menu__input') as HTMLInputElement;
      input.value = 'Chi-squared';
      input.dispatchEvent(new Event('input'));
      (root().querySelector('.group-menu__form-action') as HTMLButtonElement).click();
      fixture.detectChanges();

      const stored = studiesService.studyById(study.id)!;
      expect(stored.groups.map((group) => group.name)).toEqual(['Chi-squared']);
      expect(stored.groups[0].analysisIds).toEqual(['a']);
      expect(groupNames()).toEqual(['Chi-squared', 'Ungrouped']);
    });

    it('refuses a group name a sibling already took', () => {
      loaded.set([analysis('a')]);
      const study = openStudy(['a']);
      studiesService.seedGroup(study.id, 'T-tests');
      fixture.detectChanges();

      groupTrigger(0).click();
      fixture.detectChanges();
      (root().querySelector('.group-menu__item--new') as HTMLButtonElement).click();
      fixture.detectChanges();

      const input = root().querySelector('.group-menu__input') as HTMLInputElement;
      input.value = 't-tests';
      input.dispatchEvent(new Event('input'));
      (root().querySelector('.group-menu__form-action') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(root().querySelector('.group-menu__error')!.textContent).toContain('taken');
      expect(studiesService.studyById(study.id)!.groups.length).toBe(1);
    });

    it('says so when a new group never made it to the server', () => {
      vi.spyOn(console, 'error').mockReturnValue(undefined);
      loaded.set([analysis('a')]);
      const study = openStudy(['a']);
      studiesService.failWith('createGroup');
      fixture.detectChanges();

      groupTrigger(0).click();
      fixture.detectChanges();
      (root().querySelector('.group-menu__item--new') as HTMLButtonElement).click();
      fixture.detectChanges();

      const input = root().querySelector('.group-menu__input') as HTMLInputElement;
      input.value = 'Chi-squared';
      input.dispatchEvent(new Event('input'));
      (root().querySelector('.group-menu__form-action') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(studiesService.studyById(study.id)!.groups).toEqual([]);
      expect(root().querySelector('.group-menu__input')).toBeTruthy();
      expect(root().querySelector('.study-form-error')!.textContent).toContain('Could not create the group');
    });

    it('renames a group from its heading', () => {
      loaded.set([analysis('a')]);
      const study = openStudy(['a']);
      studiesService.seedGroup(study.id, 'T-tests', ['a']);
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-actions .icon-btn')!.click();
      fixture.detectChanges();

      const input = root().querySelector('.member-group-rename-input') as HTMLInputElement;
      input.value = 'Age tests';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(studiesService.studyById(study.id)!.groups[0].name).toBe('Age tests');
      expect(groupNames()[0]).toBe('Age tests');
    });

    it('keeps a group name that clashes with a sibling, and says so', () => {
      loaded.set([analysis('a')]);
      const study = openStudy(['a']);
      studiesService.seedGroup(study.id, 'T-tests', ['a']);
      studiesService.seedGroup(study.id, 'Chi-squared');
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-actions .icon-btn')!.click();
      fixture.detectChanges();

      const input = root().querySelector('.member-group-rename-input') as HTMLInputElement;
      input.value = 'chi-squared';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(root().querySelector('.study-form-error')!.textContent).toContain('already exists');
      expect(studiesService.studyById(study.id)!.groups[0].name).toBe('T-tests');
    });

    it('deletes a group and hands its runs back to Ungrouped', () => {
      loaded.set([analysis('a'), analysis('b')]);
      const study = openStudy(['a', 'b']);
      studiesService.seedGroup(study.id, 'T-tests', ['a']);
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-actions .icon-btn.danger')!.click();
      fixture.detectChanges();
      (root().querySelector('.member-group-confirm .study-form-action.danger') as HTMLButtonElement).click();
      fixture.detectChanges();

      const stored = studiesService.studyById(study.id)!;
      expect(stored.groups).toEqual([]);
      expect(stored.analysisIds).toEqual(['a', 'b']);
      expect(groupNames()).toEqual(['Ungrouped']);
      expect(rowsOf().length).toBe(2);
    });

    it('aborts a group delete before it happens', () => {
      loaded.set([analysis('a')]);
      const study = openStudy(['a']);
      studiesService.seedGroup(study.id, 'T-tests', ['a']);
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-actions .icon-btn.danger')!.click();
      fixture.detectChanges();
      root().querySelector<HTMLButtonElement>('.member-group-confirm .study-form-action.cancel')!.click();
      fixture.detectChanges();

      expect(studiesService.studyById(study.id)!.groups.length).toBe(1);
      expect(rowsOf().length).toBe(1);
    });

    it('keeps a group assignment out of the detail view', () => {
      loaded.set([analysis('a'), analysis('b')]);
      openStudy(['a', 'b']);
      const openAnalysis = vi.spyOn(fixture.componentInstance, 'onRowClick').mockReturnValue(undefined);
      fixture.detectChanges();

      groupTrigger(0).click();
      fixture.detectChanges();
      root().querySelector<HTMLElement>('.group-menu__name')!.click();
      fixture.detectChanges();

      expect(openAnalysis).not.toHaveBeenCalled();
    });
  });

  it('opens the detail view when a member row is clicked', () => {
    loaded.set([analysis('a')]);
    openStudy(['a']);
    fixture.detectChanges();

    const opened: Analysis[] = [];
    component.openAnalysis.subscribe((analysis) => opened.push(analysis));
    rowsOf()[0].click();

    expect(opened.map((analysis) => analysis.id)).toEqual(['a']);
  });
});
