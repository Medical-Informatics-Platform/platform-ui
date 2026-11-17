import { Component, ElementRef, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistogramChartConfig, HistogramComponent } from './histogram.component';
import { HistogramChartData } from './histogram-data';

type ChartData = { bins: string[]; counts: number[]; variableName: string };

const OVERALL: ChartData = {
  bins: ['0-1', '1-2', '2-3', '3-4', '4-5'],
  counts: [12, 30, 22, 5, 1],
  variableName: 'Age',
};
const SWAPPED: ChartData = { bins: ['a', 'b', 'c'], counts: [4, 8, 2], variableName: 'Sex' };
const VERTICAL: HistogramChartConfig = { color: '#2b33e9', orientation: 'vertical' };

/** Long enough for afterNextRender plus the 150ms resize debounce. */
const RENDER_MS = 200;
const RESIZE_MS = 300;

@Component({
  selector: 'app-histogram-spec-host',
  standalone: true,
  imports: [HistogramComponent],
  template: `<div #wrapper><app-histogram [data]="data()" [config]="config()" /></div>`,
  styles: ['app-histogram { display: block; }'],
})
class HistogramSpecHostComponent {
  readonly wrapper = viewChild.required<ElementRef<HTMLDivElement>>('wrapper');
  readonly data = signal<ChartData | HistogramChartData | null>(null);
  readonly config = signal<HistogramChartConfig>({});
}

describe('HistogramComponent', () => {
  let fixture: ComponentFixture<HistogramSpecHostComponent>;
  let host: HistogramSpecHostComponent;
  let wrapper: HTMLDivElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HistogramSpecHostComponent],
      providers: [provideZonelessChangeDetection()],
    });

    fixture = TestBed.createComponent(HistogramSpecHostComponent);
    host = fixture.componentInstance;
    wrapper = host.wrapper().nativeElement;
    wrapper.style.width = '480px';
  });

  afterEach(() => {
    fixture.destroy();
  });

  async function settle(waitMs: number): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  function chart(): HTMLElement {
    return wrapper.querySelector('.histogram-plot') as HTMLElement;
  }

  function svg(): SVGElement | null {
    return chart()?.querySelector('svg');
  }

  function drawnHeight(): number {
    return parseFloat(chart().style.height || '0');
  }

  function bars(): number {
    return chart().querySelectorAll('.bar').length;
  }

  it('draws the chart from the width its container actually has', async () => {
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    expect(svg(), 'chart drawn').not.toBeNull();
    expect(bars()).toBe(OVERALL.bins.length);
    expect(drawnHeight()).toBeGreaterThan(150);
  });

  it('does not draw a collapsed chart while its step is hidden', async () => {
    wrapper.style.display = 'none';
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    expect(svg(), 'nothing measured, nothing drawn').toBeNull();
  });

  it('draws as soon as the hidden step becomes visible again', async () => {
    wrapper.style.display = 'none';
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);
    expect(svg()).toBeNull();

    wrapper.style.display = '';
    await settle(RESIZE_MS);

    expect(svg(), 'redrawn on reveal').not.toBeNull();
    expect(bars()).toBe(OVERALL.bins.length);
    expect(drawnHeight()).toBeGreaterThan(150);
  });

  it('keeps the drawing when an equal config object arrives again', async () => {
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    const first = svg();
    expect(first).not.toBeNull();
    first!.setAttribute('data-probe', 'first');

    // A fresh object with the same values, exactly as an inline template literal does.
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    expect(chart().querySelectorAll('svg').length).toBe(1);
    expect(svg()!.getAttribute('data-probe')).toBe('first');
  });

  it('redraws when the container is resized', async () => {
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    const widthBefore = Number(svg()!.getAttribute('width'));
    wrapper.style.width = '300px';
    await settle(RESIZE_MS);

    const widthAfter = Number(svg()!.getAttribute('width'));
    expect(widthAfter).toBeGreaterThan(0);
    expect(widthAfter).toBeLessThan(widthBefore);
  });

  it('draws once at layout width while a parent is scaled by an enter animation', async () => {
    wrapper.style.transform = 'scale(0.9)';
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    const first = svg();
    expect(Number(first!.getAttribute('width'))).toBe(480);
    first!.setAttribute('data-probe', 'first');

    wrapper.style.transform = '';
    await settle(RESIZE_MS);

    expect(svg()!.getAttribute('data-probe'), 'no second draw').toBe('first');
  });

  it('draws data that arrived while the step was hidden once it is back', async () => {
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);
    expect(bars()).toBe(OVERALL.bins.length);

    wrapper.style.display = 'none';
    host.data.set(SWAPPED);
    await settle(RENDER_MS);

    wrapper.style.display = '';
    await settle(RESIZE_MS);

    expect(bars()).toBe(SWAPPED.bins.length);
  });
  describe('split group chips', () => {
    const SPLIT: HistogramChartData = {
      bins: ['0', '10', '20'],
      counts: [10, 20, 30],
      variableName: 'Dose',
      variableType: 'real',
      splitLabel: 'Dataset',
      splitCode: 'dataset',
      groups: [
        { key: 'SSR', label: 'SSR Swiss Stroke Registry', counts: [4, 8, 10] },
        { key: 'SSR-even', label: 'SSR Swiss Stroke Registry (even)', counts: [4, 8, 10] },
      ],
    };

    function chips(): HTMLButtonElement[] {
      return Array.from(wrapper.querySelectorAll<HTMLButtonElement>('button.histogram-chip'));
    }

    function status(): string {
      return (wrapper.querySelector('.histogram-filter-status')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    it('shows one chip per group, labelled by dataset code, named in full for assistive tech', async () => {
      host.data.set(SPLIT);
      await settle(RENDER_MS);

      expect(chips().map((chip) => chip.textContent?.trim())).toEqual(['SSR', 'SSR-even']);
      expect(chips().map((chip) => chip.getAttribute('aria-label'))).toEqual([
        'SSR Swiss Stroke Registry',
        'SSR Swiss Stroke Registry (even)',
      ]);
      expect(chips().every((chip) => chip.getAttribute('aria-pressed') === 'true')).toBe(true);
      // The groups do not add up to the totals, so the masked remainder is named
      // — as a plain legend entry, never another pill-shaped control.
      const masked = wrapper.querySelector('.histogram-legend-masked');
      expect(masked?.tagName).not.toBe('BUTTON');
      expect(masked?.classList.contains('histogram-chip')).toBe(false);
      expect(masked?.querySelector('.histogram-chip-swatch.is-masked')).not.toBeNull();
      expect(wrapper.querySelector('.histogram-chip.is-static')).toBeNull();
      expect(status()).toBe('');
    });

    it('marks a hidden chip unmistakably off: muted struck label, empty neutral swatch', async () => {
      host.data.set(SPLIT);
      await settle(RENDER_MS);

      chips()[1].click();
      // The chip animates its colour; let the 150ms transition finish first.
      await settle(300);

      const off = chips()[1];
      expect(off.classList.contains('is-off')).toBe(true);
      expect(off.getAttribute('aria-pressed')).toBe('false');
      const offSwatch = off.querySelector('.histogram-chip-swatch') as HTMLElement;
      const onSwatch = chips()[0].querySelector('.histogram-chip-swatch') as HTMLElement;
      expect(getComputedStyle(offSwatch).backgroundColor).not.toBe(getComputedStyle(onSwatch).backgroundColor);
      expect(getComputedStyle(offSwatch).boxShadow).not.toContain('rgb(127, 156, 232)');
      const offLabel = off.querySelector('.histogram-chip-label') as HTMLElement;
      expect(getComputedStyle(offLabel).textDecorationLine).toContain('line-through');
      expect(getComputedStyle(offLabel).color).toBe('rgb(71, 85, 105)');
    });

    it('keeps the status and Show all at the end of the chip row and out of the way while all groups show', async () => {
      host.data.set(SPLIT);
      await settle(RENDER_MS);

      const statusEl = wrapper.querySelector('.histogram-filter-status') as HTMLElement;
      expect(wrapper.querySelector('.histogram-show-all')).toBeNull();
      expect(getComputedStyle(statusEl).display).toBe('none');

      chips()[0].click();
      await settle(0);

      const row = wrapper.querySelector('.histogram-filter') as HTMLElement;
      expect(row.querySelector('.histogram-show-all')).not.toBeNull();
      expect(row.querySelector('.histogram-filter-status')).not.toBeNull();
      expect(status()).toContain('Showing 1 of 2 datasets');

      (wrapper.querySelector('.histogram-show-all') as HTMLButtonElement).click();
      await settle(0);
      expect(wrapper.querySelector('.histogram-show-all')).toBeNull();
      expect(getComputedStyle(wrapper.querySelector('.histogram-filter-status') as HTMLElement).display).toBe('none');
    });

    it('wraps chips without horizontal overflow at a 330px card and truncates labels with an ellipsis', async () => {
      wrapper.style.width = '330px';
      host.data.set({ ...SPLIT, groups: [...SPLIT.groups!, { key: 'SSR-odd', label: 'SSR Swiss Stroke Registry (odd)', counts: [1, 1, 1] }] });
      await settle(RENDER_MS);

      const row = wrapper.querySelector('.histogram-filter') as HTMLElement;
      expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
      for (const chip of chips()) {
        expect(chip.title).toContain(chip.getAttribute('aria-label') ?? '');
        const label = chip.querySelector('.histogram-chip-label') as HTMLElement;
        expect(getComputedStyle(label).textOverflow).toBe('ellipsis');
      }
    });

    it('hides a group on click, says how many are shown, and Show all brings it back', async () => {
      host.data.set(SPLIT);
      await settle(RENDER_MS);

      chips()[1].click();
      await settle(0);
      expect(chips()[1].getAttribute('aria-pressed')).toBe('false');
      expect(chart().querySelectorAll('.bar[data-group="SSR-even"]')).toHaveLength(0);
      expect(status()).toContain('Showing 1 of 2 datasets');

      // The last shown group is locked rather than silently ignoring the click.
      expect(chips()[0].getAttribute('aria-disabled')).toBe('true');
      chips()[0].click();
      await settle(0);
      expect(chips()[0].getAttribute('aria-pressed')).toBe('true');

      (wrapper.querySelector('.histogram-show-all') as HTMLButtonElement).click();
      await settle(0);
      expect(chips().every((chip) => chip.getAttribute('aria-pressed') === 'true')).toBe(true);
      expect(status()).toBe('');
    });

    it('uses the group names and "groups" for a non-dataset split', async () => {
      host.data.set({ ...SPLIT, splitCode: 'sex', splitLabel: 'Sex' });
      await settle(RENDER_MS);
      expect(chips()[0].textContent?.trim()).toBe('SSR Swiss Stroke Registry');
      chips()[0].click();
      await settle(0);
      expect(status()).toContain('Showing 1 of 2 groups');
    });

    it('starts fully shown again when the split groups change', async () => {
      host.data.set(SPLIT);
      await settle(RENDER_MS);
      chips()[1].click();
      await settle(0);

      host.data.set({ ...SPLIT, groups: [...SPLIT.groups!, { key: 'SSR-odd', label: 'Odd', counts: [1, 1, 1] }] });
      await settle(0);
      expect(chips().every((chip) => chip.getAttribute('aria-pressed') === 'true')).toBe(true);
    });
  });
});
