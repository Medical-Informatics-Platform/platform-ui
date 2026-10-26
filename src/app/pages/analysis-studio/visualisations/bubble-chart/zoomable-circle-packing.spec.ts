import { createZoomableCirclePacking, PARTIAL_AVAILABILITY_FILL } from './zoomable-circle-packing';

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
              { code: 'sex', label: 'Sex', type: 'nominal', value: 1 },
              { code: 'age_value', label: 'Age', type: 'continuous', value: 1 },
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
              { code: 'sex', label: 'Sex', type: 'nominal', value: 1 },
              { code: 'age_value', label: 'Age', type: 'continuous', value: 1 },
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

  it('shows a partially available leaf in amber, keeps its clicks and names the datasets in the tooltip', () => {
    const sex = circleFor('sex');
    expect(sex.getAttribute('fill')).toBe(PARTIAL_AVAILABILITY_FILL);
    expect(sex.getAttribute('fill-opacity')).toBe('1');
    expect(sex.getAttribute('aria-disabled')).toBeNull();
    expect(sex.style.cursor).toBe('pointer');
    expect(sex.getAttribute('stroke-dasharray')).toBe('3 2');
    expect(circleFor('age_value').getAttribute('aria-disabled')).toBeNull();

    sex.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);

    sex.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onDoubleClick).not.toHaveBeenCalled();

    sex.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.querySelector('body > .tooltip')?.textContent).toContain('Not available in: Dataset A, Dataset B');

    circleFor('age_value').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(2);
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

describe('createZoomableCirclePacking selection', () => {
  let container: HTMLDivElement;
  let chart: ReturnType<typeof createZoomableCirclePacking>;

  const circleFor = (code: string): SVGCircleElement =>
    Array.from(container.querySelectorAll<SVGCircleElement>('circle.leaf'))
      .find((circle) => (circle as any).__data__?.data?.code === code)!;

  const labelFor = (code: string): SVGTextElement | null => {
    const group = Array.from(container.querySelectorAll<SVGGElement>('g.label-group'))
      .find((node) => (node as any).__data__?.data?.code === code);
    return group ? group.querySelector('text') as SVGTextElement | null : null;
  };

  /** d3 writes transitioned colours in rgb() form; read both hex and rgb() the same way. */
  const normalizedColor = (value: string): string => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  };

  beforeEach(() => {
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
      () => undefined,
      () => undefined,
      {}
    );
  });

  afterEach(() => {
    chart.destroy?.();
    container.remove();
  });

  it('paints the clicked bubble with the primary-blue selection fill and ring', () => new Promise<void>((done) => {
    circleFor('age_value').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    window.setTimeout(() => {
      const leaf = circleFor('age_value');
      // d3's fill transition writes the end value in rgb() form.
      expect(normalizedColor(leaf.getAttribute('fill')!)).toBe('rgb(43, 51, 233)'); // #2b33e9
      // Selection stays readable without colour: the ring is the darker step of the same
      // blue, thicker than every resting leaf (0.6) and its hover (1.5).
      expect(normalizedColor(leaf.getAttribute('stroke')!)).toBe('rgb(27, 33, 163)'); // #1b21a3
      expect(leaf.getAttribute('stroke-width')).toBe('2.5');
      // Unselected siblings are untouched.
      expect(normalizedColor(circleFor('sex').getAttribute('fill')!)).toBe('rgb(255, 255, 255)');
      done();
    }, 300);
  }));

  it('writes the selected label in white without the halo and keeps the halo elsewhere', () => new Promise<void>((done) => {
    // Zooming to a leaf selects it and rebuilds that group's labels at the same time.
    chart.zoomToNode('age_value');

    window.setTimeout(() => {
      const ageLabel = labelFor('age_value');
      expect(ageLabel).not.toBeNull();
      // Same size and weight as every label; only the ink changes. White on the
      // selection blue is ~6.9:1, and no outline blurs it.
      expect(ageLabel!.style.fill).toBe('rgb(255, 255, 255)');
      expect(ageLabel!.style.stroke).toBe('');

      const sexLabel = labelFor('sex');
      expect(sexLabel?.style.fill).toBe('rgb(15, 23, 42)');
      expect(sexLabel?.style.stroke).not.toBe('');
      done();
    }, 300);
  }));
});
