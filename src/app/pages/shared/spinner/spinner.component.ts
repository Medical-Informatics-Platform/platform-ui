import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  templateUrl: './spinner.component.html',
  styleUrls: ['./spinner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpinnerComponent {
  @Input() size: string = '64px';
  @Input() color: string = 'teal';
  @Input() text?: string;
  // When false, renders inline rather than a full-screen overlay
  @Input() overlay: boolean = true;
}
