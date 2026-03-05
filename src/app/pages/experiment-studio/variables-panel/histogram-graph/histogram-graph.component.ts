import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { HistogramComponent } from '../../visualisations/histogram/histogram.component';
@Component({
  selector: 'app-histogram-graph',
  imports: [HistogramComponent],
  templateUrl: './histogram-graph.component.html',
  styleUrl: './histogram-graph.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistogramGraphComponent {
  @Input() data: { bins: string[]; counts: number[]; variableName: string } | null = null;

  constructor() { }
}
