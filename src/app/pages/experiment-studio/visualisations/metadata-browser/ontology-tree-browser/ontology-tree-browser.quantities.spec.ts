import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { groupContentsLabel } from '../metadata-browser-labels';
import { OntologyTreeBrowserComponent } from './ontology-tree-browser.component';

describe('groupContentsLabel', () => {
  it('names groups and variables with their plurals', () => {
    expect(groupContentsLabel(4, 21)).toBe('4 groups, 21 variables');
    expect(groupContentsLabel(1, 1)).toBe('1 group, 1 variable');
  });

  it('leaves out a zero group count', () => {
    expect(groupContentsLabel(0, 2)).toBe('2 variables');
    expect(groupContentsLabel(0, 1)).toBe('1 variable');
  });

  it('says when a group holds nothing', () => {
    expect(groupContentsLabel(0, 0)).toBe('No variables');
  });
});

describe('OntologyTreeBrowserComponent quantities', () => {
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

  const groupRow = (label: string): HTMLElement =>
    (Array.from(fixture.nativeElement.querySelectorAll('button.content-row.group-row')) as HTMLElement[])
      .find((row) => row.querySelector('.row-label')?.textContent?.trim() === label)!;
  const treeRow = (label: string): HTMLElement =>
    (Array.from(fixture.nativeElement.querySelectorAll('button.tree-row')) as HTMLElement[])
      .find((row) => row.querySelector('.tree-label')?.textContent?.trim() === label)!;
  const text = (element: Element | null): string => element?.textContent?.trim() ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OntologyTreeBrowserComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(OntologyTreeBrowserComponent);
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();
  });

  it('describes each listed group without zero counts', () => {
    expect(text(groupRow('Demographics').querySelector('.row-meta'))).toBe('2 variables');
    expect(text(groupRow('Vitals').querySelector('.row-meta'))).toBe('1 group, 1 variable');
  });

  it('draws a size bar per group, scaled to the largest listed group', () => {
    const fill = (label: string): string =>
      (groupRow(label).querySelector('.row-share .row-share-fill') as HTMLElement).style.width;

    expect(fill('Demographics')).toBe('100%');
    expect(fill('Vitals')).toBe('50%');
  });

  it('heads the two lists in sentence case', () => {
    const titles = (): string[] =>
      (Array.from(fixture.nativeElement.querySelectorAll('.content-section-title')) as HTMLElement[]).map(
        (title) => text(title)
      );
    expect(titles()[0]).toBe('Groups');
    expect(titles()).not.toContain('Child groups');

    groupRow('Demographics').click();
    fixture.detectChanges();
    expect(titles()).toEqual(['Variables']);
  });

  it('shows no pool progress while nothing was added', () => {
    expect(text(treeRow('Vitals').querySelector('.tree-count'))).toBe('1');
    expect(treeRow('Vitals').querySelector('.tree-count.has-pool')).toBeNull();
    expect(groupRow('Vitals').querySelector('.row-pool')).toBeNull();
  });

  it('shows how many variables of each group are already in the experiment', () => {
    fixture.componentRef.setInput('poolVariables', [glucose]);
    fixture.detectChanges();

    expect(text(treeRow('Stroke 3.7').querySelector('.tree-count'))).toBe('1/3');
    expect(text(treeRow('Vitals').querySelector('.tree-count'))).toBe('1/1');
    expect(treeRow('Vitals').querySelector('.tree-count.has-pool')).not.toBeNull();
    expect(text(treeRow('Demographics').querySelector('.tree-count'))).toBe('2');
    expect(treeRow('Demographics').querySelector('.tree-count.has-pool')).toBeNull();

    expect(text(groupRow('Vitals').querySelector('.row-pool'))).toBe('1 added');
    expect(groupRow('Demographics').querySelector('.row-pool')).toBeNull();
  });
});
