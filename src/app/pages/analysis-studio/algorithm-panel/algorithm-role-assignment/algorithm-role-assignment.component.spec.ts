import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnalysisStudioService } from '../../../../services/analysis-studio.service';
import { AlgorithmRoleAssignmentComponent } from './algorithm-role-assignment.component';

describe('AlgorithmRoleAssignmentComponent', () => {
  let fixture: ComponentFixture<AlgorithmRoleAssignmentComponent>;
  let analysisStudioService: {
    algorithmAssignableVariables: ReturnType<typeof signal<any[]>>;
    algorithmY: ReturnType<typeof signal<any[]>>;
    algorithmX: ReturnType<typeof signal<any[]>>;
    setAlgorithmY: Mock;
    setAlgorithmX: Mock;
    unavailableVariables: ReturnType<typeof signal<ReadonlyMap<string, readonly string[]>>>;
  };

  const age = { code: 'age', label: 'Age', type: 'real' };
  const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
  const bmi = { code: 'bmi', label: 'BMI', type: 'real' };
  const derived = { code: 'derived_col', label: 'Derived column', type: 'real', isCreatedColumn: true };

  beforeEach(async () => {
    analysisStudioService = {
      algorithmAssignableVariables: signal<any[]>([age, sex, bmi, derived]),
      algorithmY: signal<any[]>([]),
      algorithmX: signal<any[]>([]),
      unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
      setAlgorithmY: vi.fn().mockImplementation((nodes: any[]) => {
        analysisStudioService.algorithmY.set(nodes);
      }),
      setAlgorithmX: vi.fn().mockImplementation((nodes: any[]) => {
        analysisStudioService.algorithmX.set(nodes);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [AlgorithmRoleAssignmentComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AnalysisStudioService, useValue: analysisStudioService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlgorithmRoleAssignmentComponent);
    fixture.detectChanges();
  });

  it('assigns a pool member to y via setAlgorithmY', () => {
    fixture.componentInstance.assignTo('y', age);

    expect(analysisStudioService.setAlgorithmY).toHaveBeenCalledWith([age]);
    expect(analysisStudioService.algorithmY()).toEqual([age]);
    // The assigned member leaves the available source list.
    expect(fixture.componentInstance.source()).not.toContainEqual(expect.objectContaining({ code: 'age' }));
  });

  it('assigns a pool member to x via setAlgorithmX', () => {
    fixture.componentInstance.assignTo('x', sex);

    expect(analysisStudioService.setAlgorithmX).toHaveBeenCalledWith([sex]);
    expect(analysisStudioService.algorithmX()).toEqual([sex]);
    expect(fixture.componentInstance.source()).not.toContainEqual(expect.objectContaining({ code: 'sex' }));
  });

  it('removes a member from a role via setAlgorithmY/setAlgorithmX', () => {
    analysisStudioService.algorithmY.set([age, bmi]);
    analysisStudioService.algorithmX.set([sex]);
    fixture.detectChanges();

    fixture.componentInstance.removeFrom('y', age);
    expect(analysisStudioService.setAlgorithmY).toHaveBeenCalledWith([bmi]);
    expect(analysisStudioService.algorithmY()).toEqual([bmi]);

    fixture.componentInstance.removeFrom('x', sex);
    expect(analysisStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(analysisStudioService.algorithmX()).toEqual([]);
  });

  it('renders a created badge for nodes flagged as created columns', () => {
    analysisStudioService.algorithmY.set([derived]);
    fixture.detectChanges();

    expect(fixture.componentInstance.isCreated(derived)).toBe(true);
    expect(fixture.componentInstance.isCreated(age)).toBe(false);
    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.textContent).toContain('Derived column');
    expect(nativeElement.querySelector('.role-chip-created')).toBeTruthy();
  });

  it('assigning to y removes the node from x (disjoint roles)', () => {
    analysisStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.assignTo('y', age);

    expect(analysisStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(analysisStudioService.setAlgorithmY).toHaveBeenCalledWith([age]);
    expect(analysisStudioService.algorithmX()).toEqual([]);
    expect(analysisStudioService.algorithmY()).toEqual([age]);
    // The node is not in both roles.
    expect(fixture.componentInstance.isAssigned(age, 'x')).toBe(false);
    expect(fixture.componentInstance.isAssigned(age, 'y')).toBe(true);
  });

  it('assigning to x removes the node from y (disjoint roles)', () => {
    analysisStudioService.algorithmY.set([bmi]);
    fixture.detectChanges();

    fixture.componentInstance.assignTo('x', bmi);

    expect(analysisStudioService.setAlgorithmY).toHaveBeenCalledWith([]);
    expect(analysisStudioService.setAlgorithmX).toHaveBeenCalledWith([bmi]);
    expect(analysisStudioService.algorithmY()).toEqual([]);
    expect(analysisStudioService.algorithmX()).toEqual([bmi]);
    expect(fixture.componentInstance.isAssigned(bmi, 'y')).toBe(false);
    expect(fixture.componentInstance.isAssigned(bmi, 'x')).toBe(true);
  });

  it('assigning an already-assigned node is a no-op and keeps it out of the other role', () => {
    analysisStudioService.algorithmY.set([sex]);
    fixture.detectChanges();
    analysisStudioService.setAlgorithmY.mockClear();
    analysisStudioService.setAlgorithmX.mockClear();

    fixture.componentInstance.assignTo('y', sex);

    expect(analysisStudioService.setAlgorithmY).not.toHaveBeenCalled();
    expect(analysisStudioService.setAlgorithmX).not.toHaveBeenCalled();
    expect(analysisStudioService.algorithmY()).toEqual([sex]);
    expect(analysisStudioService.algorithmX()).toEqual([]);
  });

  it('hides assigned variables from the pool roster', () => {
    analysisStudioService.algorithmY.set([age]);
    fixture.detectChanges();

    expect(fixture.componentInstance.filteredPool().some((node) => node.code === 'age')).toBe(false);
    expect(fixture.componentInstance.roleOf(age)).toBe('y');
    expect((fixture.nativeElement as HTMLElement).querySelector('.roster')?.textContent).not.toContain('Age');
  });

  it('drops a chip dragged into the other role slot', () => {
    analysisStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    const previous = {} as any;
    // Move age from predictors to outcome.
    fixture.componentInstance.onChipDrop(
      { previousContainer: previous, container: {}, item: { data: age } } as any,
      'y',
    );
    expect(analysisStudioService.algorithmX()).toEqual([]);
    expect(analysisStudioService.algorithmY()).toEqual([age]);

    // Releasing inside its own slot changes nothing.
    fixture.componentInstance.onChipDrop(
      { previousContainer: previous, container: previous, item: { data: age } } as any,
      'y',
    );
    expect(analysisStudioService.algorithmY()).toEqual([age]);
  });

  it('labels the role controls in plain language and still assigns', () => {
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.roster .roles button');
    expect(buttons.length).toBe(8); // 4 pool rows x 2 roles
    expect(buttons[0].textContent).toContain('Outcome');
    expect(buttons[1].textContent).toContain('Predictor');
    buttons[0].click(); // first roster row is age; assign it as outcome
    expect(analysisStudioService.algorithmY()).toEqual([age]);
  });

  it('renders the role band as a horizontal strip above the full-width roster', () => {
    analysisStudioService.algorithmY.set([age]);
    analysisStudioService.algorithmX.set([sex, bmi]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const band = root.querySelector<HTMLElement>('.role-band')!;
    const rails = root.querySelector<HTMLElement>('.rails')!;
    const roster = root.querySelector<HTMLElement>('.roster')!;
    const outcome = rails.querySelector<HTMLElement>('.rail--y')!;
    const predictor = rails.querySelector<HTMLElement>('.rail--x')!;

    expect(getComputedStyle(rails).display).toBe('flex');
    expect(band.textContent).toContain('Roles');
    expect(band.textContent).toContain('Outcome');
    expect(band.textContent).toContain('Predictors');
    expect(root.querySelector('.role-action--quiet')?.textContent).toContain('Done');
    // The roster is a sibling below the rails, not a side column.
    expect(roster.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      rails.getBoundingClientRect().bottom - 1,
    );
    // Outcome and predictor sit on the same band row.
    expect(Math.abs(outcome.getBoundingClientRect().top - predictor.getBoundingClientRect().top))
      .toBeLessThanOrEqual(1);
  });

  it('caps the roster at five rows and scrolls the overflow', () => {
    analysisStudioService.algorithmAssignableVariables.set([
      age,
      sex,
      bmi,
      derived,
      { code: 'a', label: 'A', type: 'real' },
      { code: 'b', label: 'B', type: 'real' },
      { code: 'c', label: 'C', type: 'real' },
    ]);
    fixture.detectChanges();

    const roster = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.roster')!;
    const style = getComputedStyle(roster);

    expect(style.overflowY).toBe('auto');
    expect(style.maxHeight).toBe('220px');
  });

  it('collapses to the compact band with Add and expands back with Done', () => {
    analysisStudioService.algorithmY.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.collapseRoles();
    fixture.detectChanges();
    let root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.roster')).toBeNull();
    expect(root.querySelector('.role-action--add')?.textContent).toContain('Add');

    (root.querySelector('.role-action--add') as HTMLButtonElement).click();
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.roster')).toBeTruthy();
    expect(root.querySelector('.role-action--quiet')?.textContent).toContain('Done');
  });

  it('setRole unassigns a node back to the pool', () => {
    analysisStudioService.algorithmY.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.setRole(age, '');

    expect(analysisStudioService.setAlgorithmY).toHaveBeenCalledWith([]);
    expect(analysisStudioService.algorithmY()).toEqual([]);
    expect(fixture.componentInstance.roleOf(age)).toBe('');
  });

  it('setRole unassigns only the node\'s own role, leaving the other role untouched', () => {
    analysisStudioService.algorithmY.set([sex]);
    analysisStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.setRole(age, '');

    expect(analysisStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(analysisStudioService.algorithmX()).toEqual([]);
    // age never was an outcome: setAlgorithmY must not be touched at all.
    expect(analysisStudioService.setAlgorithmY).not.toHaveBeenCalled();
    expect(analysisStudioService.algorithmY()).toEqual([sex]);
  });

  it('grays an unavailable pool row, names the datasets and refuses role clicks', () => {
    analysisStudioService.unavailableVariables.set(new Map([['sex', ['Dataset B']]]));
    fixture.detectChanges();

    const row = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('li.row'))
      .find((item) => item.textContent?.includes('Sex'))!;
    expect(row.classList).toContain('is-unavailable');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.getAttribute('title')).toBe('Not available in: Dataset B');
    const outcome = row.querySelector('button[data-role="y"]') as HTMLButtonElement;
    expect(outcome.getAttribute('aria-disabled')).toBe('true');

    outcome.click();
    (row.querySelector('button[data-role="x"]') as HTMLButtonElement).click();
    outcome.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.componentInstance.assignTo('x', sex);
    expect(analysisStudioService.setAlgorithmY).not.toHaveBeenCalled();
    expect(analysisStudioService.setAlgorithmX).not.toHaveBeenCalled();
  });

  it('keeps an assigned variable that became unavailable, grayed, undraggable and removable', () => {
    analysisStudioService.algorithmY.set([sex]);
    analysisStudioService.unavailableVariables.set(new Map([['sex', ['Dataset B']]]));
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('.chip--y') as HTMLElement;
    expect(chip.classList).toContain('is-unavailable');
    expect(chip.classList).toContain('cdk-drag-disabled');
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(chip.getAttribute('title')).toBe('Not available in: Dataset B');

    fixture.componentInstance.assignTo('x', sex);
    expect(analysisStudioService.algorithmY()).toEqual([sex]);
    expect(analysisStudioService.setAlgorithmX).not.toHaveBeenCalled();

    (chip.querySelector('.chip-x') as HTMLButtonElement).click();
    expect(analysisStudioService.setAlgorithmY).toHaveBeenCalledWith([]);
  });
});
