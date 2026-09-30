import { Component, ChangeDetectionStrategy, computed, input, signal } from '@angular/core';
import { EChartsOption } from 'echarts';
import { NgxEchartsModule } from 'ngx-echarts';
import { MipChart } from '../chart-theme';

interface ChartVariant {
  label: string;
  option: EChartsOption;
  height: number;
  caption?: string;
  meta?: string;
}

interface ChartCard {
  title?: string;
  variants: ChartVariant[];
}

const BRAND_COLORS = ['#2B33E9', '#7F9CE8', '#FFBA08', '#DFEFE4'];

function toVariant(chart: MipChart): ChartVariant {
  const { mipTitle: _t, mipMeta, mipCaption, mipChartHeight, mipVariant, ...option } = chart;
  return {
    label: mipVariant ?? '',
    option: { color: BRAND_COLORS, ...option },
    height: typeof mipChartHeight === 'number' && mipChartHeight > 0 ? mipChartHeight : 500,
    caption: mipCaption,
    meta: mipMeta,
  };
}

/** Consecutive charts with a variant label and the same title share one card with a switcher. */
function toCards(charts: MipChart[]): ChartCard[] {
  const cards: ChartCard[] = [];
  for (const chart of charts) {
    const last = cards[cards.length - 1];
    if (chart.mipVariant && last?.variants[0].label && last.title === chart.mipTitle) {
      last.variants.push(toVariant(chart));
    } else {
      cards.push({ title: chart.mipTitle, variants: [toVariant(chart)] });
    }
  }
  return cards;
}

@Component({
  selector: 'app-chart-renderer',
  imports: [NgxEchartsModule],
  templateUrl: './charts-renderer.component.html',
  styleUrl: './charts-renderer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChartRendererComponent {
  readonly charts = input<MipChart[]>([]);
  readonly cards = computed(() => toCards(this.charts()));
  /** Active variant per card index; a missing entry means the first variant. */
  private readonly picked = signal<Record<number, number>>({});

  active(card: ChartCard, i: number): ChartVariant {
    return card.variants[this.picked()[i] ?? 0] ?? card.variants[0];
  }

  isActive(i: number, v: number): boolean {
    return (this.picked()[i] ?? 0) === v;
  }

  pick(i: number, v: number): void {
    this.picked.update((p) => ({ ...p, [i]: v }));
  }
}
