import { ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { createHistogram } from './histogram-chart';

@Component({
  selector: 'app-histogram',
  templateUrl: './histogram.component.html',
  styleUrls: ['./histogram.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistogramComponent implements OnChanges {
  @Input() data: { bins: string[]; counts: number[]; variableName: string; variableType?: string } | null = null; // Data for histogram
  @Input() config: { color?: string; width?: number; height?: number } = {}; // Configuration for the graph
  isLoading = false;

  constructor(private elementRef: ElementRef) { }

  ngOnChanges(changes: SimpleChanges): void {
    this.isLoading = true; // Show loading only if empty
    if (changes['data'] && changes['data'].currentValue) {
      this.renderHistogram();
      this.isLoading = false;
    }
  }

  renderHistogram(): void {
    if (!this.data || !this.data.bins || !this.data.counts) {
      return;
    }

    const container = this.elementRef.nativeElement.querySelector('#histogram-chart');
    if (!container) {
      console.error('Histogram container not found.');
      return;
    }

    const binsCount = this.data.bins.length;
    const baseRect = container.parentElement?.getBoundingClientRect();
    const baseWidth = baseRect?.width;
    const baseHeight = baseRect?.height;
    createHistogram(this.data, container, {
      ...this.config,
      skipEveryOtherLabel: binsCount > 6,
    }); // Call D3 rendering logic

  }
}
