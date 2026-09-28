import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { AlgorithmRoleAssignmentComponent } from './algorithm-role-assignment.component';

describe('AlgorithmRoleAssignmentComponent', () => {
  let fixture: ComponentFixture<AlgorithmRoleAssignmentComponent>;
  let experimentStudioService: {
    algorithmAssignableVariables: ReturnType<typeof signal<any[]>>;
    algorithmY: ReturnType<typeof signal<any[]>>;
    algorithmX: ReturnType<typeof signal<any[]>>;
    setAlgorithmY: jasmine.Spy;
    setAlgorithmX: jasmine.Spy;
  };

  const age = { code: 'age', label: 'Age', type: 'real' };
  const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
  const bmi = { code: 'bmi', label: 'BMI', type: 'real' };
  const derived = { code: 'derived_col', label: 'Derived column', type: 'real', isCreatedColumn: true };

  beforeEach(async () => {
    experimentStudioService = {
      algorithmAssignableVariables: signal<any[]>([age, sex, bmi, derived]),
      algorithmY: signal<any[]>([]),
      algorithmX: signal<any[]>([]),
      setAlgorithmY: jasmine.createSpy('setAlgorithmY').and.callFake((nodes: any[]) => {
        experimentStudioService.algorithmY.set(nodes);
      }),
      setAlgorithmX: jasmine.createSpy('setAlgorithmX').and.callFake((nodes: any[]) => {
        experimentStudioService.algorithmX.set(nodes);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [AlgorithmRoleAssignmentComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: experimentStudioService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlgorithmRoleAssignmentComponent);
    fixture.detectChanges();
  });

  it('assigns a pool member to y via setAlgorithmY', () => {
    fixture.componentInstance.assignTo('y', age);

    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([age]);
    expect(experimentStudioService.algorithmY()).toEqual([age]);
    // The assigned member leaves the available source list.
    expect(fixture.componentInstance.source()).not.toContain(jasmine.objectContaining({ code: 'age' }));
  });

  it('assigns a pool member to x via setAlgorithmX', () => {
    fixture.componentInstance.assignTo('x', sex);

    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([sex]);
    expect(experimentStudioService.algorithmX()).toEqual([sex]);
    expect(fixture.componentInstance.source()).not.toContain(jasmine.objectContaining({ code: 'sex' }));
  });

  it('removes a member from a role via setAlgorithmY/setAlgorithmX', () => {
    experimentStudioService.algorithmY.set([age, bmi]);
    experimentStudioService.algorithmX.set([sex]);
    fixture.detectChanges();

    fixture.componentInstance.removeFrom('y', age);
    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([bmi]);
    expect(experimentStudioService.algorithmY()).toEqual([bmi]);

    fixture.componentInstance.removeFrom('x', sex);
    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(experimentStudioService.algorithmX()).toEqual([]);
  });

  it('renders a created badge for nodes flagged as created columns', () => {
    experimentStudioService.algorithmY.set([derived]);
    fixture.detectChanges();

    expect(fixture.componentInstance.isCreated(derived)).toBeTrue();
    expect(fixture.componentInstance.isCreated(age)).toBeFalse();
    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.textContent).toContain('Derived column');
    expect(nativeElement.querySelector('.role-chip-created')).toBeTruthy();
  });

  it('assigning to y removes the node from x (disjoint roles)', () => {
    experimentStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.assignTo('y', age);

    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([age]);
    expect(experimentStudioService.algorithmX()).toEqual([]);
    expect(experimentStudioService.algorithmY()).toEqual([age]);
    // The node is not in both roles.
    expect(fixture.componentInstance.isAssigned(age, 'x')).toBeFalse();
    expect(fixture.componentInstance.isAssigned(age, 'y')).toBeTrue();
  });

  it('assigning to x removes the node from y (disjoint roles)', () => {
    experimentStudioService.algorithmY.set([bmi]);
    fixture.detectChanges();

    fixture.componentInstance.assignTo('x', bmi);

    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([]);
    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([bmi]);
    expect(experimentStudioService.algorithmY()).toEqual([]);
    expect(experimentStudioService.algorithmX()).toEqual([bmi]);
    expect(fixture.componentInstance.isAssigned(bmi, 'y')).toBeFalse();
    expect(fixture.componentInstance.isAssigned(bmi, 'x')).toBeTrue();
  });

  it('assigning an already-assigned node is a no-op and keeps it out of the other role', () => {
    experimentStudioService.algorithmY.set([sex]);
    fixture.detectChanges();
    experimentStudioService.setAlgorithmY.calls.reset();
    experimentStudioService.setAlgorithmX.calls.reset();

    fixture.componentInstance.assignTo('y', sex);

    expect(experimentStudioService.setAlgorithmY).not.toHaveBeenCalled();
    expect(experimentStudioService.setAlgorithmX).not.toHaveBeenCalled();
    expect(experimentStudioService.algorithmY()).toEqual([sex]);
    expect(experimentStudioService.algorithmX()).toEqual([]);
  });

  it('hides assigned variables from the pool roster', () => {
    experimentStudioService.algorithmY.set([age]);
    fixture.detectChanges();

    expect(fixture.componentInstance.filteredPool().some((node) => node.code === 'age')).toBeFalse();
    expect(fixture.componentInstance.roleOf(age)).toBe('y');
    expect((fixture.nativeElement as HTMLElement).querySelector('.roster')?.textContent).not.toContain('Age');
  });

  it('drops a chip dragged into the other role slot', () => {
    experimentStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    const previous = {} as any;
    // Move age from predictors to outcome.
    fixture.componentInstance.onChipDrop(
      { previousContainer: previous, container: {}, item: { data: age } } as any,
      'y',
    );
    expect(experimentStudioService.algorithmX()).toEqual([]);
    expect(experimentStudioService.algorithmY()).toEqual([age]);

    // Releasing inside its own slot changes nothing.
    fixture.componentInstance.onChipDrop(
      { previousContainer: previous, container: previous, item: { data: age } } as any,
      'y',
    );
    expect(experimentStudioService.algorithmY()).toEqual([age]);
  });

  it('labels the role controls in plain language and still assigns', () => {
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.roster .roles button');
    expect(buttons.length).toBe(8); // 4 pool rows x 2 roles
    expect(buttons[0].textContent).toContain('Outcome');
    expect(buttons[1].textContent).toContain('Predictor');
    buttons[0].click(); // first roster row is age; assign it as outcome
    expect(experimentStudioService.algorithmY()).toEqual([age]);
  });

  it('renders the role band as a horizontal strip above the full-width roster', () => {
    experimentStudioService.algorithmY.set([age]);
    experimentStudioService.algorithmX.set([sex, bmi]);
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
    experimentStudioService.algorithmAssignableVariables.set([
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
    experimentStudioService.algorithmY.set([age]);
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
    experimentStudioService.algorithmY.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.setRole(age, '');

    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([]);
    expect(experimentStudioService.algorithmY()).toEqual([]);
    expect(fixture.componentInstance.roleOf(age)).toBe('');
  });

  it('setRole unassigns only the node\'s own role, leaving the other role untouched', () => {
    experimentStudioService.algorithmY.set([sex]);
    experimentStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.setRole(age, '');

    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(experimentStudioService.algorithmX()).toEqual([]);
    // age never was an outcome: setAlgorithmY must not be touched at all.
    expect(experimentStudioService.setAlgorithmY).not.toHaveBeenCalled();
    expect(experimentStudioService.algorithmY()).toEqual([sex]);
  });
});
