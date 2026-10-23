import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { OntologyTreeBrowserComponent } from './ontology-tree-browser.component';

describe('OntologyTreeBrowserComponent', () => {
  const model: D3HierarchyNode = {
    label: 'Stroke 3.7',
    code: 'Stroke',
    children: [
      {
        label: 'Demographics',
        code: 'demographics',
        children: [
          {
            label: 'Sex',
            code: 'sex',
            description: 'Patient sex',
            type: 'nominal',
            sql_type: 'text',
            enumerations: [{ code: '1', label: 'Female' }],
          },
        ],
      },
      {
        label: 'Vitals',
        code: 'vitals',
        children: [
          {
            label: 'Metabolic',
            code: 'metabolic',
            children: [
              {
                label: 'Glucose',
                code: 'glucose',
                description: 'Blood glucose value',
                type: 'real',
                sql_type: 'real',
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OntologyTreeBrowserComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('supports keyboard movement in the tree', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    vi.spyOn(event, 'preventDefault').mockReturnValue(undefined);
    component.onTreeKeydown(event, component.visibleTreeRows()[0], 0);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.activeTreeIndex()).toBe(1);
  });

  it('heads a nested group with its ancestors as a breadcrumb and tints that path in the tree', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('highlightNode', model.children?.[1].children?.[0]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const crumbs = Array.from(host.querySelectorAll<HTMLButtonElement>('.contents-breadcrumb .crumb'));
    expect(crumbs.map((crumb) => crumb.textContent?.trim())).toEqual(['Stroke 3.7', 'Vitals']);
    const pathRows = Array.from(host.querySelectorAll('.tree-row.on-path .tree-label')).map((label) => label.textContent?.trim());
    expect(pathRows).toEqual(['Stroke 3.7', 'Vitals']);

    crumbs[1].click();
    fixture.detectChanges();

    expect(component.selectedGroup().label).toBe('Vitals');
  });

  it('collapses every branch except the one leading to the selection', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();
    component.selectGroup(component.visibleTreeRows().find((row) => row.group.label === 'Demographics')!.group);
    component.selectGroup(component.visibleTreeRows().find((row) => row.group.label === 'Vitals')!.group);
    fixture.detectChanges();
    expect(component.visibleTreeRows().map((row) => row.group.label)).toContain('Metabolic');

    component.selectGroup(component.visibleTreeRows().find((row) => row.group.label === 'Demographics')!.group);
    component.collapseAll();
    fixture.detectChanges();

    expect(component.visibleTreeRows().map((row) => row.group.label)).toEqual(['Stroke 3.7', 'Demographics', 'Vitals']);
  });

  it('opens an externally highlighted variable in its containing group', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('highlightNode', model.children?.[0].children?.[0]);
    fixture.detectChanges();

    expect(component.selectedGroup().code).toBe('demographics');
  });

  it('emits the original node when selecting a direct variable', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();
    vi.spyOn(component.selectedNodeChange, 'emit').mockReturnValue(undefined);

    const variable = Object.values(component.index().variablesById).find((item) => item.code === 'sex');
    expect(variable).toBeDefined();
    component.selectVariable(variable!);

    expect(component.selectedNodeChange.emit).toHaveBeenCalledWith(variable!.original);
  });

  it('emits variablePoolToggle and selects the variable when the row Add control is clicked', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    const demographics = Object.values(component.index().groupsById).find((item) => item.code === 'demographics')!;
    component.selectGroup(demographics);
    fixture.detectChanges();
    vi.spyOn(component.selectedNodeChange, 'emit').mockReturnValue(undefined);
    vi.spyOn(component.variablePoolToggle, 'emit').mockReturnValue(undefined);

    (fixture.nativeElement.querySelector('.row-add') as HTMLElement).click();

    expect(component.selectedNodeChange.emit).toHaveBeenCalled();
    expect(component.variablePoolToggle.emit).toHaveBeenCalled();
  });

  it('shows a neutral Contents heading while the tree root is selected', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    // The selected group is the root (pathology) by default; the middle pane
    // must not re-head the pathology name (it is already in the chip and root).
    expect(component.contentsPaneTitle()).toBe('Contents');
    expect(component.selectedGroup().label).toBe('Stroke 3.7');
  });

  it('exposes the full label in tree-row and variable-row tooltips', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    const treeRows = fixture.nativeElement.querySelectorAll('button.tree-row');
    expect(treeRows[0].getAttribute('title')).toBe('Stroke 3.7');
    expect(treeRows[1].getAttribute('title')).toBe('Demographics');

    // Select a group to reveal its direct variables in the contents pane.
    const demographics = Object.values(component.index().groupsById).find((item) => item.code === 'demographics')!;
    component.selectGroup(demographics);
    fixture.detectChanges();

    const variableRows = fixture.nativeElement.querySelectorAll('button.content-row.variable-row');
    expect(variableRows.length).toBeGreaterThan(0);
    const labels = Array.from(variableRows as NodeListOf<Element>).map((row) => row.getAttribute('title'));
    expect(labels).toContain('Sex');
  });

  it('heads the middle pane with the group name for a non-root group', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    const demographics = Object.values(component.index().groupsById).find((item) => item.code === 'demographics')!;
    component.selectGroup(demographics);
    expect(component.selectedGroup().id).toBe(demographics.id);
    expect(component.contentsPaneTitle()).toBe('Demographics');
  });

  it('pluralizes group counts in the pane subtitle and rows', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    // Vitals has exactly one child group (Metabolic) and no direct variables.
    const vitals = Object.values(component.index().groupsById).find((item) => item.code === 'vitals')!;
    component.selectGroup(vitals);
    fixture.detectChanges();

    expect(component.contentsPaneSubtitle()).toBe('1 group · 1 variable');
    // Child groups stay listed and clickable even when the group has no
    // direct variables.
    const groupRow = fixture.nativeElement.querySelector('button.content-row.group-row') as HTMLElement;
    expect(groupRow.textContent).toContain('Metabolic');
    groupRow.click();
    fixture.detectChanges();
    expect(component.selectedGroup().code).toBe('metabolic');
  });

  it('lists the root child groups instead of a summary line', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    // Root has child groups but no direct variables: the contents pane shows
    // clickable child-group rows (the "pick a group" summary is gone).
    expect(fixture.nativeElement.querySelector('.contents-summary')).toBeNull();
    const groupLabels = Array.from(
      fixture.nativeElement.querySelectorAll('button.content-row.group-row'),
    ).map((row: any) => row.querySelector('.row-label')?.textContent);
    expect(groupLabels).toEqual(['Demographics', 'Vitals']);

    // A group with direct variables also lists its variables.
    const demographics = Object.values(component.index().groupsById).find((item) => item.code === 'demographics')!;
    component.selectGroup(demographics);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.content-row.variable-row')).toBeTruthy();
  });

  it('grays an unavailable variable row, shows which datasets lack it and ignores clicks', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('unavailableVariables', new Map([['sex', ['Dataset A', 'Dataset B']]]));
    const demographics = Object.values(component.index().groupsById).find((item) => item.code === 'demographics')!;
    component.selectGroup(demographics);
    fixture.detectChanges();

    const emitted: D3HierarchyNode[] = [];
    const opened: D3HierarchyNode[] = [];
    const toggled: D3HierarchyNode[] = [];
    component.selectedNodeChange.subscribe((node) => emitted.push(node));
    component.nodeDoubleClicked.subscribe((node) => opened.push(node));
    component.variablePoolToggle.subscribe((node) => toggled.push(node));

    const row = fixture.nativeElement.querySelector('button.content-row.variable-row') as HTMLElement;
    expect(row.classList).toContain('unavailable');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.getAttribute('title')).toBe('Sex\nNot available in: Dataset A, Dataset B');
    expect(row.querySelector('.row-add')).toBeNull();
    expect(row.querySelector('.row-unavailable')?.textContent?.trim()).toBe('Unavailable');

    row.click();
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(emitted).toEqual([]);
    expect(opened).toEqual([]);
    expect(toggled).toEqual([]);
    expect(component.selectedVariableId()).toBeNull();
  });
});
