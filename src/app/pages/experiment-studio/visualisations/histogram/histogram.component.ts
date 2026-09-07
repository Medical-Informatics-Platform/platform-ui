import { afterNextRender, ChangeDetectionStrategy, Component, effect, ElementRef, inject, input } from '@angular/core';
import { createHistogram } from './histogram-chart';

@Component({
  selector: 'app-histogram',
  templateUrl: './histogram.component.html',
  styleUrl: './histogram.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistogramComponent {
  private elementRef = inject(ElementRef);
  private viewReady = false;

  readonly data = input<{
    bins: string[];
    counts: Array<number | null>;
    variableName: string;
    variableType?: string;
  } | null>(null);
  readonly config = input<{
    color?: string;
    width?: number;
    height?: number;
    orientation?: 'vertical' | 'horizontal';
  }>({});
  isLoading = false;

  constructor() {
    afterNextRender(() => {
      this.viewReady = true;
      this.renderHistogram();
    });

    effect(() => {
      this.data();
      this.config();
      if (this.viewReady) {
        this.renderHistogram();
      }
    });
  }

  renderHistogram(): void {
    const data = this.data();
    if (!data || !data.bins || !data.counts) {
      return;
    }

    const container = this.elementRef.nativeElement.querySelector('#histogram-chart');
    if (!container) {
      console.error('Histogram container not found.');
      return;
    }

    createHistogram(data, container, {
      ...this.config(),
    }); // Call D3 rendering logic

  }
}
