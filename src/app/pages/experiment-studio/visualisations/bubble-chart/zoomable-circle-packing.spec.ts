import { createZoomableCirclePacking } from './zoomable-circle-packing';

describe('createZoomableCirclePacking', () => {
  let container: HTMLDivElement;
  let chart: ReturnType<typeof createZoomableCirclePacking>;

  beforeEach(() => {
    container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 420,
      height: 420,
      top: 0,
      right: 420,
      bottom: 420,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    chart = createZoomableCirclePacking(
      {
        label: 'root',
        children: [
          {
            label: 'Demographics',
            children: [
              { code: 'sex', label: 'Sex', type: 'text', value: 1 },
              { code: 'age_value', label: 'Age', type: 'real', value: 1 },
            ],
            value: 2,
          },
        ],
        value: 2,
      },
      container,
      () => undefined,
      () => undefined,
      {
        tutorialHighlightCode: 'sex',
        tutorialHighlightColor: '#22c55e',
      }
    );
  });

  afterEach(() => {
    chart.destroy?.();
    container.remove();
  });

  it('exposes the chart as one labelled image, not a wall of unnamed circles', () => {
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toContain('1 group and 2 variables');
  });

  it('clears the previous tutorial highlight when the next step has no resolved highlight code yet', () => new Promise<void>((done) => {
    expect(container.querySelector('circle[fill="#22c55e"]')).not.toBeNull();

    chart.refreshColors({ tutorialHighlightCode: null });

    window.setTimeout(() => {
      expect(container.querySelector('circle[fill="#22c55e"]')).toBeNull();
      done();
    }, 260);
  }));
});

describe('createZoomableCirclePacking unavailable variables', () => {
  let container: HTMLDivElement;
  let chart: ReturnType<typeof createZoomableCirclePacking>;
  const onClick = vi.fn();
  const onDoubleClick = vi.fn();

  const circleFor = (code: string): SVGCircleElement =>
    Array.from(container.querySelectorAll<SVGCircleElement>('circle.leaf'))
      .find((circle) => (circle as any).__data__?.data?.code === code)!;

  beforeEach(() => {
    onClick.mockReset();
    onDoubleClick.mockReset();
    container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 420, height: 420, top: 0, right: 420, bottom: 420, left: 0, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    chart = createZoomableCirclePacking(
      {
        label: 'root',
        children: [
          {
            label: 'Demographics',
            children: [
              { code: 'sex', label: 'Sex', type: 'text', value: 1 },
              { code: 'age_value', label: 'Age', type: 'real', value: 1 },
            ],
            value: 2,
          },
        ],
        value: 2,
      },
      container,
      onClick,
      onDoubleClick,
      { unavailableVariables: new Map([['sex', ['Dataset A', 'Dataset B']]]) }
    );
  });

  afterEach(() => {
    chart.destroy?.();
    container.remove();
  });

  it('grays an unavailable leaf, ignores its clicks and names the datasets in the tooltip', () => {
    const sex = circleFor('sex');
    expect(sex.getAttribute('fill')).toBe('#cbd5e1');
    expect(sex.getAttribute('aria-disabled')).toBe('true');
    expect(sex.style.cursor).toBe('not-allowed');
    expect(circleFor('age_value').getAttribute('aria-disabled')).toBeNull();

    sex.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    sex.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onDoubleClick).not.toHaveBeenCalled();

    sex.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.querySelector('body > .tooltip')?.textContent).toContain('Not available in: Dataset A, Dataset B');

    circleFor('age_value').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('restores a leaf when it becomes available again', () => new Promise<void>((done) => {
    chart.refreshColors({ unavailableVariables: new Map() });
    window.setTimeout(() => {
      const sex = circleFor('sex');
      expect(sex.getAttribute('fill')).not.toBe('#cbd5e1');
      expect(sex.getAttribute('aria-disabled')).toBeNull();
      sex.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onClick).toHaveBeenCalledTimes(1);
      done();
    }, 260);
  }));
});
