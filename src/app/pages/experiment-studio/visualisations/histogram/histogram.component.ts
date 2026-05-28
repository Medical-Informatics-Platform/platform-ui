import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, OnChanges, SimpleChanges } from '@angular/core';
import { createHistogram } from './histogram-chart';

@Component({
  selector: 'app-histogram',
  templateUrl: './histogram.component.html',
  styleUrl: './histogram.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistogramComponent implements OnChanges {
  private elementRef = inject(ElementRef);

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
  }>({});
  isLoading = false;

  constructor() {
    afterNextRender(() => {
      if (this.data()) {
        this.renderHistogram();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.isLoading = true; // Show loading only if empty
    if (changes['data'] && changes['data'].currentValue) {
      this.renderHistogram();
      this.isLoading = false;
    }
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
