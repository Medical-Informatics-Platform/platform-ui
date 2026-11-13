import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { OntologyTreeBrowserComponent } from './ontology-tree-browser.component';

describe('OntologyTreeBrowserComponent partially available variables', () => {
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
                type: 'continuous',
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

  it('marks a variable missing in some dataset, names the datasets, shows it on click but never adds it', () => {
    const fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('unavailableVariables', new Map([['sex', ['Dataset A', 'Dataset B']]]));
    const demographics = Object.values(component.index().groupsById).find((item) => item.code === 'demographics')!;
    component.selectGroup(demographics);
    fixture.detectChanges();

    const emitted: D3HierarchyNode[] = [];
    const opened: D3HierarchyNode[] = [];
    component.selectedNodeChange.subscribe((node) => emitted.push(node));
    component.nodeDoubleClicked.subscribe((node) => opened.push(node));

    const row = Array.from(fixture.nativeElement.querySelectorAll('button.content-row.variable-row') as NodeListOf<HTMLElement>)
      .find((candidate) => candidate.textContent?.includes('Sex'))!;
    expect(row.classList).toContain('partial');
    expect(row.getAttribute('aria-disabled')).toBeNull();
    expect(row.getAttribute('title')).toBe('Sex\nNot available in: Dataset A, Dataset B');
    expect(row.querySelector('.row-add')).toBeNull();
    expect(row.querySelector('.row-partial')?.textContent?.trim()).toBe('Missing in 2 datasets');

    row.click();
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(emitted.map((node) => node.code)).toContain('sex');
    expect(component.selectedVariableId()).not.toBeNull();
    expect(opened).toEqual([]);
  });
});
