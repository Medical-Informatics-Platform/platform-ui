import { createZoomableCirclePacking } from './zoomable-circle-packing';

describe('createZoomableCirclePacking', () => {
  let container: HTMLDivElement;
  let chart: ReturnType<typeof createZoomableCirclePacking>;

  beforeEach(() => {
    container = document.createElement('div');
    spyOn(container, 'getBoundingClientRect').and.returnValue({
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

  it('clears the previous tutorial highlight when the next step has no resolved highlight code yet', (done) => {
    expect(container.querySelector('circle[fill="#22c55e"]')).not.toBeNull();

    chart.refreshColors({ tutorialHighlightCode: null });

    window.setTimeout(() => {
      expect(container.querySelector('circle[fill="#22c55e"]')).toBeNull();
      done();
    }, 260);
  });
});
