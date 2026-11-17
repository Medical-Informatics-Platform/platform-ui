import * as d3 from 'd3';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import {
  MIN_READABLE_SCALE,
  cloneNode,
  createCollapsibleTree,
  fitTransform,
  initializeCollapse,
} from './collapsible-tree-renderer';

/** 12 groups of 4 variables: 48 rows when every group is open. */
const wideModel: D3HierarchyNode = {
  label: 'IST',
  code: 'ist',
  children: Array.from({ length: 12 }, (_, groupIndex) => ({
    label: `Group ${groupIndex}`,
    code: `group_${groupIndex}`,
    children: Array.from({ length: 4 }, (_, leafIndex) => ({
      label: `Variable ${groupIndex}-${leafIndex}`,
      code: `var_${groupIndex}_${leafIndex}`,
      type: 'real',
    })),
  })),
};

const smallModel: D3HierarchyNode = {
  label: 'Stroke',
  code: 'stroke',
  children: [
    { label: 'Demographics', code: 'demographics', children: [{ label: 'Sex', code: 'sex', type: 'nominal' }] },
    { label: 'Vitals', code: 'vitals', children: [{ label: 'Glucose', code: 'glucose', type: 'real' }] },
  ],
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const layerScale = (host: HTMLElement): number => {
  const transform = host.querySelector('.collapsible-tree-layer')?.getAttribute('transform') ?? '';
  const match = /scale\(([\d.]+)/.exec(transform);
  return match ? Number(match[1]) : NaN;
};

describe('collapsible tree first view', () => {
  it('opens only the first level when the second level would not fit the view', () => {
    const root = d3.hierarchy(cloneNode(wideModel), (node) => node.children) as any;

    initializeCollapse(root);

    expect(root.children.length).toBe(12);
    for (const group of root.children) {
      expect(group.children).toBeUndefined();
      expect(group._children.length).toBe(4);
    }
  });

  it('keeps the second level open for a small model', () => {
    const root = d3.hierarchy(cloneNode(smallModel), (node) => node.children) as any;

    initializeCollapse(root);

    expect(root.children[0].children.length).toBe(1);
  });
});

describe('fitTransform', () => {
  it('centres a tree that fits and never magnifies past 1.15', () => {
    const transform = fitTransform({ width: 1000, height: 600 }, { width: 400, height: 200 });

    expect(transform.k).toBe(1.15);
    expect(transform.x).toBeCloseTo((1000 - 400 * 1.15) / 2);
    expect(transform.y).toBeCloseTo((600 - 200 * 1.15) / 2);
  });

  it('scales a slightly larger tree down to fit', () => {
    const transform = fitTransform({ width: 800, height: 500 }, { width: 900, height: 400 });

    expect(transform.k).toBeCloseTo((800 / 900) * 0.92);
  });

  it('stops shrinking at the readable scale and anchors the tree to the top left', () => {
    const transform = fitTransform({ width: 700, height: 500 }, { width: 1200, height: 3000 });

    expect(MIN_READABLE_SCALE).toBe(0.75);
    expect(transform.k).toBe(MIN_READABLE_SCALE);
    expect(transform.x).toBe(18);
    expect(transform.y).toBe(18);
  });
});

describe('collapsible tree rendering', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '700px';
    container.style.height = '500px';
    document.body.appendChild(container);
  });

  afterEach(() => container.remove());

  const create = (model: D3HierarchyNode) =>
    createCollapsibleTree(model, container, { onNodeClick: () => undefined, onNodeDoubleClick: () => undefined });

  it('opens a large model at a readable scale', async () => {
    const renderer = create(wideModel);
    await wait(450);

    expect(layerScale(container)).toBeGreaterThanOrEqual(MIN_READABLE_SCALE);
    renderer.destroy();
  });

  it('describes a group without zero counts or the "groups/items" wording', () => {
    const renderer = create(wideModel);
    const meta = Array.from(container.querySelectorAll('g.group-node text.node-meta')).map((node) => node.textContent);

    expect(meta[0]).toBe('12 groups, 48 variables');
    expect(meta[1]).toBe('4 variables');
    renderer.destroy();
  });
});
