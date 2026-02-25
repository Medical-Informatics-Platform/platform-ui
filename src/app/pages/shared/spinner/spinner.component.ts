import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  standalone: true,
  templateUrl: './spinner.component.html',
  styleUrls: ['./spinner.component.scss']
})
export class SpinnerComponent {
  @Input() size: string = '64px';
  @Input() color: string = 'teal';
  @Input() text?: string;
  // When false, renders inline rather than a full-screen overlay
  @Input() overlay: boolean = true;
}
