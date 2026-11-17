import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface KeyFigure {
  label: string;
  value: string;
  note?: string;
}

/** The headline numbers of a result: one strip of label / value / note cells. */
@Component({
  selector: 'app-key-figures',
  templateUrl: './key-figures.component.html',
  styleUrl: './key-figures.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyFiguresComponent {
  readonly figures = input.required<KeyFigure[]>();
}
