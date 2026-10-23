import * as d3 from 'd3';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import {
  VARIABLE_PAGE_SIZE,
  cloneNode,
  createCollapsibleTree,
  findHierarchyNode,
  findHierarchyNodeByPath,
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

  it('keeps the root open and closes every group below it', () => {
    const root = d3.hierarchy(cloneNode(model), (node) => node.children) as any;

    initializeCollapse(root);

    expect(root.children?.length).toBe(1);
    expect(root.children[0].children).toBeUndefined();
    expect(root.children[0]._children?.length).toBe(1);
    expect(root.children[0]._all?.[0].children).toBeUndefined();
    expect(root.children[0]._all?.[0]._children?.length).toBe(1);
  });

  it('finds nodes inside collapsed branches for external highlighting', () => {
    const root = d3.hierarchy(cloneNode(model), (node) => node.children) as any;
    initializeCollapse(root);

    const target = findHierarchyNode(root, { label: 'Glucose', code: 'glucose', type: 'real' });

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
              children: [{ label: 'MAP', code: 'map', type: 'real' }],
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
              children: [{ label: 'DBP', code: 'dbp', type: 'real' }],
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

  it('opens a chain of single groups in one step', () => {
    const container = createContainer();
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
    });

    expect(renderedLabels(container)).toEqual(['Stroke 3.7', 'Vitals', 'Metabolic', 'Glucose']);
    renderer.destroy();
    container.remove();
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

describe('collapsible tree deep hierarchies', () => {
  const variables = (prefix: string, count: number): D3HierarchyNode[] =>
    Array.from({ length: count }, (_, index) => ({ label: `${prefix} ${index + 1}`, code: `${prefix}_${index + 1}`, type: 'real' }));

  const wide: D3HierarchyNode = {
    label: 'Root',
    code: 'root',
    children: [
      { label: 'Cortex', code: 'cortex', children: [{ label: 'Frontal', code: 'frontal', children: variables('Frontal area', 20) }] },
      { label: 'Nuclei', code: 'nuclei', children: [{ label: 'Striatum', code: 'striatum', children: variables('Striatum part', 3) }] },
    ],
  };

  /** Root > Level 1 > … > Level 7 > Leaf. */
  const chain = (depth: number): D3HierarchyNode => {
    let node: D3HierarchyNode = { label: 'Leaf', code: 'leaf', type: 'real' };
    for (let level = depth; level >= 1; level -= 1) {
      node = { label: `Level ${level}`, code: `level_${level}`, children: [node, { label: `Sibling ${level}`, code: `sibling_${level}`, type: 'real' }] };
    }
    return { label: 'Root', code: 'root', children: [node] };
  };

  it('opens one branch per level: opening a group folds its open sibling', () => {
    const container = createContainer();
    const renderer = createCollapsibleTree(wide, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
    });

    click(container, 'Cortex');
    expect(renderedLabels(container)).toContain('Frontal');

    click(container, 'Nuclei');
    expect(renderedLabels(container)).toContain('Striatum');
    expect(renderedLabels(container)).not.toContain('Frontal');
    renderer.destroy();
    container.remove();
  });

  it('pages a long variable list behind a "more" row', () => {
    const container = createContainer();
    const renderer = createCollapsibleTree(wide, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
    });

    // Cortex holds one group only, so Frontal opens with it.
    click(container, 'Cortex');
    const shownAreas = () => renderedLabels(container).filter((label) => label.startsWith('Frontal area'));
    expect(shownAreas().length).toBe(VARIABLE_PAGE_SIZE);
    expect(renderedLabels(container)).toContain(`+ ${20 - VARIABLE_PAGE_SIZE} more variables`);

    click(container, `+ ${20 - VARIABLE_PAGE_SIZE} more variables`);
    expect(shownAreas().length).toBe(20);
    renderer.destroy();
    container.remove();
  });

  it('pages a searched variable into view', () => {
    const container = createContainer();
    const renderer = createCollapsibleTree(wide, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
    });

    renderer.expandToNode({ label: 'Frontal area 17', code: 'Frontal area_17', type: 'real' });

    expect(renderedLabels(container)).toContain('Frontal area 17');
    expect(container.querySelector('g.collapsible-node.highlighted')?.textContent).toContain('Frontal area 17');
    renderer.destroy();
    container.remove();
  });

  it('draws only the last levels of a deep path and folds the rest into an "up" stub', () => {
    const container = createContainer();
    const onPathChange = vi.fn();
    const onNodeClick = vi.fn();
    const renderer = createCollapsibleTree(chain(7), container, {
      onNodeClick,
      onNodeDoubleClick: () => undefined,
      onPathChange,
    });

    renderer.expandToNode({ label: 'Leaf', code: 'leaf', type: 'real' });

    const path = onPathChange.mock.lastCall![0] as D3HierarchyNode[];
    expect(path.map((node) => node.label)).toEqual(['Root', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7']);
    expect(renderedLabels(container)).not.toContain('Root');
    expect(renderedLabels(container)).toContain('Leaf');
    const stub = container.querySelector<SVGGElement>('g.ancestor-stub:not([aria-hidden="true"])')!;
    expect(stub.textContent).toMatch(/^↑ Up to Level \d$/);

    const above = stub.textContent!.replace('↑ Up to ', '');
    stub.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onNodeClick).toHaveBeenLastCalledWith(expect.objectContaining({ label: above }));
    expect((onPathChange.mock.lastCall![0] as D3HierarchyNode[]).at(-1)?.label).toBe(above);
    renderer.destroy();
    container.remove();
  });

  it('focuses a breadcrumb group: folds what lies below and selects it', () => {
    const container = createContainer();
    const onPathChange = vi.fn();
    const onNodeClick = vi.fn();
    const model = chain(4);
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick,
      onNodeDoubleClick: () => undefined,
      onPathChange,
    });
    renderer.expandToNode({ label: 'Leaf', code: 'leaf', type: 'real' });

    const levelTwo = model.children![0].children![0];
    renderer.focusNode(levelTwo);

    expect(onNodeClick).toHaveBeenLastCalledWith(levelTwo);
    expect((onPathChange.mock.lastCall![0] as D3HierarchyNode[]).map((node) => node.label)).toEqual(['Root', 'Level 1', 'Level 2']);
    expect(renderedLabels(container)).not.toContain('Leaf');
    renderer.destroy();
    container.remove();
  });

  it('pans on a plain wheel and leaves zoom to Ctrl + wheel', () => {
    const container = createContainer();
    const renderer = createCollapsibleTree(wide, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
    });
    const svg = container.querySelector<SVGSVGElement>('svg.collapsible-tree-svg')!;
    const before = d3.zoomTransform(svg);

    const wheel = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
    svg.dispatchEvent(wheel);

    const after = d3.zoomTransform(svg);
    expect(wheel.defaultPrevented).toBe(true);
    expect(after.k).toBe(before.k);
    expect(after.y).toBeCloseTo(before.y - 120);
    renderer.destroy();
    container.remove();
  });
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
          { label: 'Age', code: 'age', type: 'real' },
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

function renderedLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('g.collapsible-node:not([aria-hidden="true"]) .node-label'))
    .map((label) => label.textContent ?? '');
}

function click(container: HTMLElement, label: string): void {
  const node = Array.from(container.querySelectorAll<SVGGElement>('g.collapsible-node:not([aria-hidden="true"])'))
    .find((item) => item.querySelector('.node-label')?.textContent === label);
  expect(node, `Expected rendered node for ${label}`).toBeDefined();
  node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

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
