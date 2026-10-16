import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface KeyFigure {
  label: string;
  value: string;
  note?: string;
}

/** The headline numbers of a result: one strip of label / value / note cells. */
@Component({
  selector: 'app-key-figures',
  template: `
    <div class="key-figures" role="group" aria-label="Key figures">
      @for (figure of figures(); track figure.label) {
      <div class="key-figure">
        <span class="key-figure-label">{{ figure.label }}</span>
        <span class="key-figure-value">{{ figure.value }}</span>
        @if (figure.note) {
        <span class="key-figure-note">{{ figure.note }}</span>
        }
      </div>
      }
    </div>
  `,
  styleUrl: './key-figures.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyFiguresComponent {
  readonly figures = input.required<KeyFigure[]>();
}
