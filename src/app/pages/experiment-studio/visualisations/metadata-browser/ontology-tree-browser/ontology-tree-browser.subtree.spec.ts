import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { OntologyTreeBrowserComponent, SUBTREE_VARIABLE_LIMIT } from './ontology-tree-browser.component';

describe('OntologyTreeBrowserComponent nested variables', () => {
  const glucose: D3HierarchyNode = { label: 'Glucose', code: 'glucose', type: 'real' };
  const model: D3HierarchyNode = {
    label: 'Stroke 3.7',
    code: 'Stroke',
    children: [
      {
        label: 'Demographics',
        code: 'demographics',
        children: [
          { label: 'Sex', code: 'sex', type: 'nominal' },
          { label: 'Age', code: 'age', type: 'real' },
        ],
      },
      {
        label: 'Vitals',
        code: 'vitals',
        children: [{ label: 'Metabolic', code: 'metabolic', children: [glucose] }],
      },
    ],
  };

  let fixture: ComponentFixture<OntologyTreeBrowserComponent>;
  let component: OntologyTreeBrowserComponent;

  const text = (element: Element | null): string => element?.textContent?.trim() ?? '';
  const variableRows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button.content-row.variable-row'));
  const variableRow = (label: string): HTMLElement =>
    variableRows().find((row) => text(row.querySelector('.row-label')) === label)!;
  const titles = (): string[] =>
    (Array.from(fixture.nativeElement.querySelectorAll('.content-section-title')) as HTMLElement[]).map(text);
  const openGroup = (code: string): void => {
    component.selectGroup(Object.values(component.index().groupsById).find((group) => group.code === code)!);
    fixture.detectChanges();
  };
  const render = (data: D3HierarchyNode): void => {
    fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OntologyTreeBrowserComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('lists the variables of nested groups under the group list, each with its path', () => {
    render(model);

    expect(titles()).toEqual(['Groups', 'In subgroups']);
    expect(variableRows().map((row) => text(row.querySelector('.row-label'))).sort()).toEqual(['Age', 'Glucose', 'Sex']);
    expect(text(variableRow('Sex').querySelector('.row-path'))).toBe('Demographics');
    expect(text(variableRow('Glucose').querySelector('.row-path'))).toBe('Vitals / Metabolic');
  });

  it('writes the path from the selected group down, not from the root', () => {
    render(model);
    openGroup('vitals');

    expect(text(variableRow('Glucose').querySelector('.row-path'))).toBe('Metabolic');
  });

  it('adds no nested section or path to a group that only holds variables', () => {
    render(model);
    openGroup('demographics');

    expect(titles()).toEqual(['Variables']);
    expect(fixture.nativeElement.querySelector('.row-path')).toBeNull();
  });

  it('keeps the pane on the current group when a nested variable is picked', () => {
    render(model);
    const selected: D3HierarchyNode[] = [];
    component.selectedNodeChange.subscribe((node) => selected.push(node));

    variableRow('Glucose').click();
    fixture.detectChanges();
    // The panel echoes the selection back as the highlighted node.
    fixture.componentRef.setInput('highlightNode', glucose);
    fixture.detectChanges();

    expect(selected).toEqual([glucose]);
    expect(component.selectedGroup().code).toBe('Stroke');
    expect(variableRow('Glucose').classList.contains('selected')).toBe(true);
  });

  it('still opens the containing group for a variable highlighted from outside', () => {
    render(model);

    fixture.componentRef.setInput('highlightNode', glucose);
    fixture.detectChanges();

    expect(component.selectedGroup().code).toBe('metabolic');
  });

  it('adds a nested variable to the pool from its row', () => {
    render(model);
    const toggled: D3HierarchyNode[] = [];
    component.variablePoolToggle.subscribe((node) => toggled.push(node));

    (variableRow('Glucose').querySelector('.row-add') as HTMLElement).click();

    expect(toggled).toEqual([glucose]);
  });

  it('caps a very long nested list and says how many variables it left out', () => {
    render({
      label: 'Big model',
      code: 'big',
      children: [
        {
          label: 'Everything',
          code: 'everything',
          children: Array.from({ length: SUBTREE_VARIABLE_LIMIT + 5 }, (_, index) => ({
            label: `Variable ${index}`,
            code: `var_${index}`,
            type: 'real',
          })),
        },
      ],
    });

    expect(SUBTREE_VARIABLE_LIMIT).toBe(200);
    expect(variableRows().length).toBe(SUBTREE_VARIABLE_LIMIT);
    expect(text(fixture.nativeElement.querySelector('.subtree-more'))).toContain('5 more');
  });
});
