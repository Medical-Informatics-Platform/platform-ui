import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { createCollapsibleTree } from './collapsible-tree-renderer';

describe('collapsible tree partially available variables', () => {
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
  it('marks variables missing in some dataset, shows them on click, never adds them, lists the datasets on hover', () => {
    const container = createContainer();
    const onNodeClick = vi.fn();
    const onNodeDoubleClick = vi.fn();
    const renderer = createCollapsibleTree(model, container, {
      unavailableVariables: new Map([['sex', ['Dataset B']]]),
      onNodeClick,
      onNodeDoubleClick,
    });

    const sex = nodeFor(container, 'Sex');
    expect(sex.classList).toContain('partial-variable');
    expect(sex.classList).not.toContain('unavailable-variable');
    expect(sex.getAttribute('aria-disabled')).toBeNull();
    expect(nodeFor(container, 'Age').classList).not.toContain('partial-variable');

    sex.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    sex.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onNodeClick).toHaveBeenCalled();
    expect(onNodeDoubleClick).not.toHaveBeenCalled();

    sex.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelector('.collapsible-tree-tooltip')?.textContent).toContain('Not available in: Dataset B');

    renderer.setUnavailableVariables(new Map());
    expect(nodeFor(container, 'Sex').classList).not.toContain('partial-variable');
    renderer.destroy();
    container.remove();
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
