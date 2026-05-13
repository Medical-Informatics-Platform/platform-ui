import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { CollapsibleTreeBrowserComponent } from './collapsible-tree-browser.component';

describe('CollapsibleTreeBrowserComponent', () => {
  const model: D3HierarchyNode = {
    label: 'Stroke 3.7',
    code: 'stroke',
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
          },
        ],
      },
      {
        label: 'Age',
        code: 'age',
        description: 'Patient age',
        type: 'real',
        units: 'years',
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CollapsibleTreeBrowserComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('emits the original node when selecting a visible variable', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    const component = fixture.componentInstance;
    const age = model.children![1];
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();
    spyOn(component.selectedNodeChange, 'emit');

    const variableNode = findRenderedNode(fixture.nativeElement, 'Age');
    variableNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(component.selectedNodeChange.emit).toHaveBeenCalledWith(age);
  });

  it('double-click emits the original variable for the add action', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    const component = fixture.componentInstance;
    const age = model.children![1];
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();
    spyOn(component.nodeDoubleClicked, 'emit');

    const variableNode = findRenderedNode(fixture.nativeElement, 'Age');
    variableNode.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(component.nodeDoubleClicked.emit).toHaveBeenCalledWith(age);
  });

  it('expands a highlighted variable inside a collapsed branch', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('highlightNode', model.children?.[0].children?.[0]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sex');
  });

  it('keeps an externally highlighted group selected on initial render', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    const group = model.children![0];
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('highlightNode', group);
    fixture.detectChanges();

    const highlightedNode = fixture.nativeElement.querySelector('g.collapsible-node.highlighted');
    expect(highlightedNode?.textContent).toContain('Demographics');
  });

  it('renders mixed nodes with child groups and direct variables', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Demographics');
    expect(fixture.nativeElement.textContent).toContain('Age');
  });
});

function findRenderedNode(host: HTMLElement, label: string): SVGGElement {
  const nodes = Array.from(host.querySelectorAll<SVGGElement>('g.collapsible-node'));
  const node = nodes.find((item) => item.textContent?.includes(label));
  expect(node).withContext(`Expected rendered node for ${label}`).toBeDefined();
  return node!;
}
