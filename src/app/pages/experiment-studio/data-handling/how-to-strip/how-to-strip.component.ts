import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HowToGuide } from '../data-handling.models';

/**
 * "How to use" strip under an expanded stage header: numbered steps plus one note.
 * Folded by default so it never pushes the editor down; the summary line opens it.
 * Attached to the <details> element itself, so the DOM is the same as when it was an
 * inline template and parent rules such as `.workflow-section-body.open > *` still reach it.
 */
@Component({
  selector: 'details[app-how-to-strip]',
  host: { class: 'how-to-strip' },
  templateUrl: './how-to-strip.component.html',
  styleUrl: './how-to-strip.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowToStripComponent {
  readonly guide = input.required<HowToGuide>();
}
