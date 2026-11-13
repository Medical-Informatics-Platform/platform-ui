import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { FilterConfigModalComponent } from './filter-config-modal.component';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

/** Per-row AND/OR connectors replace the group-level all/any toggle. */
describe('FilterConfigModalComponent row connectors', () => {
  let fixture: ComponentFixture<FilterConfigModalComponent>;
  let component: FilterConfigModalComponent;
  let expStudio: any;

  const anaesthesiaA = { field: 'sex', operator: 'equal', value: 'female' };
  const anaesthesiaB = { field: 'sex', operator: 'equal', value: 'male' };
  const ageBelow60 = { field: 'age', operator: 'less', value: 60 };

  beforeEach(async () => {
    expStudio = {
      selectedDataModel: signal({
        code: 'dm',
        label: 'Data model',
        variables: [
          { code: 'age', label: 'Age', type: 'continuous' },
          {
            code: 'sex',
            label: 'Sex',
            type: 'nominal',
            enumerations: [
              { code: 'female', label: 'Female' },
              { code: 'male', label: 'Male' },
            ],
          },
        ],
      }),
      selectedVariables: signal<any[]>([
        {
          code: 'sex',
          label: 'Sex',
          type: 'nominal',
          enumerations: [
            { code: 'female', label: 'Female' },
            { code: 'male', label: 'Male' },
          ],
        },
        { code: 'mrs_score', label: 'mRS score', type: 'discrete' },
        { code: 'notes', label: 'Notes', type: 'nominal' },
      ]),
      setFilters: vi.fn(),
      setFilterLogic: vi.fn(),
      unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
    };

    await TestBed.configureTestingModule({
      imports: [FilterConfigModalComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: expStudio },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FilterConfigModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.allFilterVariables.set([
      { code: 'age', label: 'Age', type: 'continuous' },
      {
        code: 'sex',
        label: 'Sex',
        type: 'nominal',
        enumerations: [
          { code: 'female', label: 'Female' },
          { code: 'male', label: 'Male' },
        ],
      },
    ]);
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function load(logic: any): void {
    fixture.componentRef.setInput('filterLogic', logic);
    fixture.detectChanges();
  }

  function strip(node: any): any {
    if (node && Array.isArray(node.rules)) {
      return { condition: node.condition, rules: node.rules.map(strip) };
    }
    return { field: node.field, operator: node.operator, value: node.value };
  }

  it('drops the all/any toggle from the group header', () => {
    load({ condition: 'AND', rules: [anaesthesiaA, ageBelow60] });

    expect(host().querySelector('.scope-tray')).toBeNull();
    expect(host().textContent).not.toContain('of these conditions');
    expect(host().textContent).toContain('Keep records that match');
  });

  it('offers an AND/OR toggle on every condition after the first, not on the first', () => {
    load({ condition: 'AND', rules: [anaesthesiaA, anaesthesiaB, ageBelow60] });

    const rows = Array.from(host().querySelectorAll<HTMLElement>('.filter-block-group.is-root > .filter-tree-rail > .filter-tree-node'));
    expect(rows.length).toBe(3);
    expect(rows[0].querySelector('.connector-toggle')).toBeNull();
    for (const row of rows.slice(1)) {
      const options = Array.from(row.querySelectorAll<HTMLButtonElement>('.connector-toggle button')).map((b) => b.textContent?.trim());
      expect(options).toEqual(['AND', 'OR']);
    }
    const checked = rows[1].querySelector<HTMLButtonElement>('.connector-toggle button[aria-checked="true"]');
    expect(checked?.textContent?.trim()).toBe('AND');
  });

  it('combines OR and AND left to right: A OR B AND age < 60 is (A OR B) AND age < 60', () => {
    load({ condition: 'AND', rules: [anaesthesiaA, anaesthesiaB, ageBelow60] });

    const rows = Array.from(host().querySelectorAll<HTMLElement>('.filter-block-group.is-root > .filter-tree-rail > .filter-tree-node'));
    const orButton = Array.from(rows[1].querySelectorAll<HTMLButtonElement>('.connector-toggle button'))
      .find((b) => b.textContent?.trim() === 'OR')!;
    orButton.click();
    fixture.detectChanges();

    expect(strip(component.exportFilterLogic())).toEqual({
      condition: 'AND',
      rules: [
        { condition: 'OR', rules: [strip(anaesthesiaA), strip(anaesthesiaB)] },
        strip(ageBelow60),
      ],
    });
    // Changing one row's connector leaves the others alone.
    const third = rows[2].querySelector<HTMLButtonElement>('.connector-toggle button[aria-checked="true"]');
    expect(third?.textContent?.trim()).toBe('AND');
  });

  it('reads a saved left-folded tree back as one flat list with its connectors', () => {
    load({
      condition: 'AND',
      rules: [
        { condition: 'OR', rules: [anaesthesiaA, anaesthesiaB] },
        ageBelow60,
      ],
      valid: true,
    });

    const root = component.rootGroup();
    expect(root.rules.length).toBe(3);
    expect(root.rules.every((block) => block.kind === 'condition')).toBe(true);
    expect(root.rules.map((block) => block.connector ?? null)).toEqual([null, 'OR', 'AND']);
    expect(strip(component.exportFilterLogic())).toEqual({
      condition: 'AND',
      rules: [
        { condition: 'OR', rules: [strip(anaesthesiaA), strip(anaesthesiaB)] },
        strip(ageBelow60),
      ],
    });
  });

  it('keeps a group the user built in the middle of the list as a group', () => {
    load({
      condition: 'AND',
      rules: [
        ageBelow60,
        { condition: 'OR', rules: [anaesthesiaA, anaesthesiaB] },
      ],
    });

    const root = component.rootGroup();
    expect(root.rules.length).toBe(2);
    expect(root.rules[1].kind).toBe('group');
  });
});
