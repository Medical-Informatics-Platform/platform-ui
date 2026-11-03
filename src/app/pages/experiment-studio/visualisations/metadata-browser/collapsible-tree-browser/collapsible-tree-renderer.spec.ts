import * as d3 from 'd3';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import {
  cloneNode,
  createCollapsibleTree,
  findHierarchyNode,
  findHierarchyNodeByPath,
  focalPointForExpandedGroup,
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
                type: 'continuous',
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

    const target = findHierarchyNode(root, { label: 'Glucose', code: 'glucose', type: 'continuous' });

    expect(target?.data.label).toBe('Glucose');
  });

  it('finds duplicate group labels by full path instead of the first code match', () => {
    const duplicateModel: typeof model = {
      label: 'Stroke 3.7',
      code: 'stroke',
      children: [
        {
          label: 'Vitals',
          code: 'vitals',
          children: [
            {
              label: 'Arterial',
              code: 'arterial',
              children: [{ label: 'MAP', code: 'map', type: 'continuous' }],
            },
          ],
        },
        {
          label: 'Other',
          code: 'other',
          children: [
            {
              label: 'Arterial',
              code: 'arterial',
              children: [{ label: 'DBP', code: 'dbp', type: 'continuous' }],
            },
          ],
        },
      ],
    };
    const root = d3.hierarchy(cloneNode(duplicateModel), (node) => node.children) as any;
    initializeCollapse(root);

    const target = findHierarchyNodeByPath(root, 'Stroke 3.7 > Other > Arterial');

    expect(target?.data.label).toBe('Arterial');
    expect(target?.parent?.data.label).toBe('Other');
  });

  it('schedules auto-fit when opening without a highlighted node', () => {
    const container = createContainer();
    const onAutoFitScheduled = vi.fn();
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
    const onAutoFitScheduled = vi.fn();
    const onNodeCentered = vi.fn();

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
    const onAutoFitCanceled = vi.fn();
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

  it('targets expanded group content instead of the group node position', () => {
    const root = d3.hierarchy(cloneNode(model), (node) => node.children) as any;
    const group = root.children![0];
    group.x = 80;
    group.y = 120;
    const child = group.children![0];
    child.x = 140;
    child.y = 380;
    const grandchild = child.children![0];
    grandchild.x = 200;
    grandchild.y = 380;

    const focal = focalPointForExpandedGroup(group);

    expect(focal.x).toBe(170);
    expect(focal.y).toBe(380);
    expect(focal.y).not.toBe(group.y);
  });

  it('resizes the svg in place without rebuilding the tree', () => {
    const rect = { width: 900, height: 600 };
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockImplementation(() => ({
      ...rect,
      x: 0,
      y: 0,
      top: 0,
      right: rect.width,
      bottom: rect.height,
      left: 0,
      toJSON: () => undefined,
    } as DOMRect));
    document.body.appendChild(container);

    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
    });

    const svg = container.querySelector('svg.collapsible-tree-svg') as SVGElement;
    const firstNodes = Array.from(container.querySelectorAll('g.collapsible-node'));
    expect(svg.getAttribute('width')).toBe('900');
    expect(firstNodes.length).toBeGreaterThan(0);

    rect.width = 1200;
    rect.height = 800;
    renderer.resize();

    expect(svg.getAttribute('width')).toBe('1200');
    expect(svg.getAttribute('height')).toBe('800');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1200 800');
    const resizedNodes = Array.from(container.querySelectorAll('g.collapsible-node'));
    expect(resizedNodes.length).toBe(firstNodes.length);
    expect(resizedNodes[0]).toBe(firstNodes[0]);
    renderer.destroy();
    container.remove();
  });

  it('cancels pending auto-fit when destroyed before the next animation frame', () => {
    const container = createContainer();
    const onAutoFitCanceled = vi.fn();
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitCanceled,
    });

    renderer.destroy();

    expect(onAutoFitCanceled).toHaveBeenCalled();
    container.remove();
  });

describe('collapsible tree unavailable variables', () => {
  const model: D3HierarchyNode = {
    label: 'Root',
    code: 'root',
    children: [
      {
        label: 'Demographics',
        code: 'demographics',
        children: [
          { label: 'Sex', code: 'sex', type: 'nominal' },
          { label: 'Age', code: 'age', type: 'continuous' },
        ],
      },
    ],
  };

  const nodeFor = (container: HTMLElement, label: string): SVGGElement =>
    Array.from(container.querySelectorAll<SVGGElement>('g.collapsible-node'))
      .find((node) => node.querySelector('.node-label')?.textContent === label)!;

  it('grays unavailable variables, ignores their clicks and lists the datasets on hover', () => {
    const container = createContainer();
    const onNodeClick = vi.fn();
    const onNodeDoubleClick = vi.fn();
    const renderer = createCollapsibleTree(model, container, {
      unavailableVariables: new Map([['sex', ['Dataset B']]]),
      onNodeClick,
      onNodeDoubleClick,
    });

    const sex = nodeFor(container, 'Sex');
    const age = nodeFor(container, 'Age');
    expect(sex.classList).toContain('unavailable-variable');
    expect(sex.getAttribute('aria-disabled')).toBe('true');
    expect(age.classList).not.toContain('unavailable-variable');
    expect(nodeFor(container, 'Demographics').classList).not.toContain('unavailable-variable');

    sex.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    sex.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    sex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onNodeClick).not.toHaveBeenCalled();
    expect(onNodeDoubleClick).not.toHaveBeenCalled();

    sex.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelector('.collapsible-tree-tooltip')?.textContent).toContain('Not available in: Dataset B');

    age.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onNodeClick).toHaveBeenCalledTimes(1);

    renderer.setUnavailableVariables(new Map());
    expect(nodeFor(container, 'Sex').classList).not.toContain('unavailable-variable');
    renderer.destroy();
    container.remove();
  });
});
});

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
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
