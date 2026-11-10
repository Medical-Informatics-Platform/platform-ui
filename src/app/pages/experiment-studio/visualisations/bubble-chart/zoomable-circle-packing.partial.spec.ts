import { createZoomableCirclePacking, PARTIAL_AVAILABILITY_FILL } from './zoomable-circle-packing';

describe('createZoomableCirclePacking partially available variables', () => {
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
    document.body.appendChild(container);
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
      { unavailableVariables: new Map([['sex', ['CLM CHUV']]]) }
    );
  });

  afterEach(() => {
    chart.destroy?.();
    container.remove();
    document.querySelectorAll('body > div').forEach((node) => {
      if (node !== container && node.textContent?.includes('CLM CHUV')) node.remove();
    });
  });

  it('colours a leaf missing in some selected dataset amber instead of graying it out', () => {
    const sex = circleFor('sex');
    expect(sex.getAttribute('fill')).toBe(PARTIAL_AVAILABILITY_FILL);
    expect(sex.getAttribute('fill')).not.toBe('#cbd5e1');
    expect(circleFor('age_value').getAttribute('fill')).not.toBe(PARTIAL_AVAILABILITY_FILL);
  });

  it('keeps the leaf selectable', () => {
    const sex = circleFor('sex');
    expect(sex.getAttribute('aria-disabled')).toBeNull();
    expect(sex.style.cursor).toBe('pointer');

    sex.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    sex.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(onClick).toHaveBeenCalled();
    expect(onDoubleClick).toHaveBeenCalled();
  });

  it('still names the datasets that lack it in the tooltip', () => {
    circleFor('sex').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.body.textContent).toContain('CLM CHUV');
  });
});
