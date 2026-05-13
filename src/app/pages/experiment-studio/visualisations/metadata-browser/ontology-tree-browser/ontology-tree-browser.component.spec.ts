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
    spyOn(event, 'preventDefault');
    component.onTreeKeydown(event, component.visibleTreeRows()[0], 0);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.activeTreeIndex()).toBe(1);
  });

  it('opens an externally highlighted variable in its containing group', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('highlightNode', model.children?.[0].children?.[0]);
    fixture.detectChanges();

    expect(component.selectedGroup().code).toBe('demographics');
    expect(component.selectedVariable()?.code).toBe('sex');
  });

  it('emits the original node when selecting a direct variable', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();
    spyOn(component.selectedNodeChange, 'emit');

    const variable = Object.values(component.index().variablesById).find((item) => item.code === 'sex');
    expect(variable).toBeDefined();
    component.selectVariable(variable!);

    expect(component.selectedNodeChange.emit).toHaveBeenCalledWith(variable!.original);
  });
});
