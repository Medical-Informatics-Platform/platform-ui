import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpinnerComponent {
  readonly size = input<string>('64px');
  readonly color = input<string>('teal');
  readonly text = input<string>();
  // When false, renders inline rather than a full-screen overlay
  readonly overlay = input<boolean>(true);
}
