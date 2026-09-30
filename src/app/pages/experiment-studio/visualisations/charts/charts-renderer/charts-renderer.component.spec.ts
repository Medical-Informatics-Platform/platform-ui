import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';
import { ChartRendererComponent } from './charts-renderer.component';
import { MipChart } from '../chart-theme';

describe('ChartRendererComponent', () => {
  const variant = (v: string, caption: string): MipChart => ({
    mipTitle: 'Distribution by dataset', mipVariant: v, mipCaption: caption, mipChartHeight: 200, series: [],
  });

  async function render(charts: MipChart[]) {
    await TestBed.configureTestingModule({
      imports: [ChartRendererComponent],
      providers: [provideZonelessChangeDetection(), provideEchartsCore({ echarts: () => import('echarts') })],
    }).compileComponents();
    const fixture = TestBed.createComponent(ChartRendererComponent);
    fixture.componentRef.setInput('charts', charts);
    await fixture.whenStable();
    return fixture;
  }

  it('groups variants into one card with a switcher and swaps the caption', async () => {
    const fixture = await render([variant('age', 'Ages differ.'), variant('mmse', 'Scores differ.'), { mipTitle: 'Other', series: [] }]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('.chart-container').length).toBe(2);
    const buttons = el.querySelectorAll<HTMLButtonElement>('.chart-switcher button');
    expect(Array.from(buttons).map((b) => b.textContent?.trim())).toEqual(['age', 'mmse']);
    expect(el.querySelector('.chart-caption')?.textContent).toContain('Ages differ.');

    buttons[1].click();
    await fixture.whenStable();

    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.chart-caption')?.textContent).toContain('Scores differ.');
  });

  it('shows no switcher for a single variant and keeps card chrome out of the ECharts option', async () => {
    const fixture = await render([variant('age', 'Ages differ.')]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.chart-switcher')).toBeNull();
    expect(el.querySelector('.chart-title')?.textContent).toBe('Distribution by dataset');
    const option = fixture.componentInstance.cards()[0].variants[0].option as Record<string, unknown>;
    expect(Object.keys(option).some((k) => k.startsWith('mip'))).toBeFalse();
  });

  it('sizes a chart created inside a hidden step once the step is shown', async () => {
    const fixture = await render([]);
    const host: HTMLElement = fixture.nativeElement;
    host.style.display = 'none';
    document.body.appendChild(host);
    fixture.componentRef.setInput('charts', [{ mipTitle: 'Hidden', mipChartHeight: 200, xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [] }]);
    await fixture.whenStable();
    const until = async (ok: () => boolean) => { for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 30)); };
    await until(() => !!host.querySelector('canvas'));

    host.style.display = 'block';
    host.style.width = '600px';
    await until(() => (host.querySelector('canvas')?.clientWidth ?? 0) > 500);

    expect(host.querySelector('canvas')?.clientWidth).toBe(600);
    host.remove();
  });
});

