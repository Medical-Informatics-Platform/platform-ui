import * as d3 from 'd3';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import {
  cloneNode,
  createCollapsibleTree,
  findHierarchyNode,
  initializeCollapse,
} from './collapsible-tree-renderer';

describe('collapsible tree renderer helpers', () => {
  const model: D3HierarchyNode = {
    label: 'Stroke 3.7',
    code: 'stroke',
    children: [
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
                type: 'real',
              },
            ],
          },
        ],
      },
    ],
  };

  it('clones input hierarchy without sharing children arrays', () => {
    const cloned = cloneNode(model);

    expect(cloned).not.toBe(model);
    expect(cloned.children).not.toBe(model.children);
    expect(cloned.children?.[0]).not.toBe(model.children?.[0]);
  });

  it('keeps root and first level open while collapsing deeper branches', () => {
    const root = d3.hierarchy(cloneNode(model), (node) => node.children) as any;

    initializeCollapse(root);

    expect(root.children?.length).toBe(1);
    expect(root.children[0].children?.length).toBe(1);
    expect(root.children[0].children[0].children).toBeUndefined();
    expect(root.children[0].children[0]._children?.length).toBe(1);
  });

  it('finds nodes inside collapsed branches for external highlighting', () => {
    const root = d3.hierarchy(cloneNode(model), (node) => node.children) as any;
    initializeCollapse(root);

    const target = findHierarchyNode(root, { label: 'Glucose', code: 'glucose', type: 'real' });

    expect(target?.data.label).toBe('Glucose');
  });

  it('schedules auto-fit when opening without a highlighted node', () => {
    const container = createContainer();
    const onAutoFitScheduled = jasmine.createSpy('onAutoFitScheduled');
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitScheduled,
    });

    expect(onAutoFitScheduled).toHaveBeenCalled();
    renderer.destroy();
    container.remove();
  });

  it('centers a highlighted group instead of scheduling initial auto-fit', () => {
    const group = model.children![0];
    const container = createContainer();
    const onAutoFitScheduled = jasmine.createSpy('onAutoFitScheduled');
    const onNodeCentered = jasmine.createSpy('onNodeCentered');

    const renderer = createCollapsibleTree(model, container, {
      highlightNode: group,
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitScheduled,
      onNodeCentered,
    });

    expect(onAutoFitScheduled).not.toHaveBeenCalled();
    expect(onNodeCentered).toHaveBeenCalledWith(group);
    renderer.destroy();
    container.remove();
  });

  it('cancels pending auto-fit when expanding to a selected node', () => {
    const container = createContainer();
    const onAutoFitCanceled = jasmine.createSpy('onAutoFitCanceled');
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitCanceled,
    });

    renderer.expandToNode(model.children![0]);

    expect(onAutoFitCanceled).toHaveBeenCalled();
    renderer.destroy();
    container.remove();
  });

  it('cancels pending auto-fit when destroyed before the next animation frame', () => {
    const container = createContainer();
    const onAutoFitCanceled = jasmine.createSpy('onAutoFitCanceled');
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitCanceled,
    });

    renderer.destroy();

    expect(onAutoFitCanceled).toHaveBeenCalled();
    container.remove();
  });
});

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  spyOn(container, 'getBoundingClientRect').and.returnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 900,
    bottom: 600,
    left: 0,
    width: 900,
    height: 600,
    toJSON: () => undefined,
  } as DOMRect);
  document.body.appendChild(container);
  return container;
}
