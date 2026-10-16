import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartRendererComponent } from './charts-renderer.component';

describe('ChartRendererComponent house style', () => {
  function themed(chart: Record<string, unknown>): any {
    TestBed.configureTestingModule({
      imports: [ChartRendererComponent],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(ChartRendererComponent);
    fixture.componentRef.setInput('charts', [chart]);
    fixture.componentInstance.ngOnChanges({});
    return fixture.componentInstance.themedCharts[0];
  }

  it('adds the app font, title ink and tooltip card under the chart’s own settings', () => {
    const chart = themed({
      title: { text: 'T', textStyle: { fontSize: 16 } },
      tooltip: { trigger: 'axis', backgroundColor: '#000' },
      series: [{ type: 'line', data: [1, 2] }],
    });

    expect(chart.textStyle.fontFamily).toContain('Inter');
    expect(chart.title.textStyle).toEqual({ fontSize: 16, fontWeight: 600, color: '#0f172a' });
    expect(chart.tooltip.backgroundColor).toBe('#000');
    expect(chart.tooltip.borderWidth).toBe(1);
    expect(chart.aria.enabled).toBe(true);
    // Lines keep their real shape: no default smoothing or area fill.
    expect(chart.series[0].smooth).toBeUndefined();
    expect(chart.series[0].areaStyle).toBeUndefined();
  });

  it('groups value-axis thousands with a thin space unless the axis formats its own labels', () => {
    const chart = themed({
      xAxis: { type: 'category', data: ['a'] },
      yAxis: [{}, { type: 'value', axisLabel: { formatter: '{value} %' } }],
      series: [],
    });

    expect(chart.xAxis.axisLabel).toBeUndefined();
    expect(chart.yAxis[0].axisLabel.formatter(12500)).toBe('12\u202f500');
    expect(chart.yAxis[0].axisLabel.formatter(0.25)).toBe('0.25');
    expect(chart.yAxis[1].axisLabel.formatter).toBe('{value} %');
  });

  it('adds no tooltip to a chart that has none', () => {
    expect(themed({ series: [] }).tooltip).toBeUndefined();
  });
});
