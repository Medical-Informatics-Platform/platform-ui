import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StatusTone = 'success' | 'error' | 'pending' | 'neutral';

interface Chip {
  tone: StatusTone;
  label: string;
  icon: string;
}

/** Chip wording and icon per status. ExperimentDAO.Status is exactly these three values. */
const STATUS_PRESENTATION: Record<string, Chip> = {
  success: { tone: 'success', label: 'Completed', icon: 'fa-circle-check' },
  error: { tone: 'error', label: 'Failed', icon: 'fa-circle-exclamation' },
  pending: { tone: 'pending', label: 'Pending', icon: 'fa-clock' },
};

/** What a status renders as, so the chip and the list's poll-for-updates agree on one word list. */
export const statusChip = (status: string | null | undefined): Chip => {
  const key = (status || '').toLowerCase();
  return STATUS_PRESENTATION[key] ?? {
    tone: 'neutral',
    label: key ? key.charAt(0).toUpperCase() + key.replace(/[_-]+/g, ' ').slice(1) : 'Unknown',
    icon: 'fa-circle-info',
  };
};

@Component({
  selector: 'app-experiment-status',
  template: `
    @if (dot()) {
      <!-- A dense row has no room for a word: the dot carries the tone, the label travels as text. -->
      <span
        class="status-dot"
        role="img"
        [class.completed]="chip().tone === 'success'"
        [class.error]="chip().tone === 'error'"
        [class.pending]="chip().tone === 'pending'"
        [title]="chip().label"
        [attr.aria-label]="chip().label"
      ></span>
    } @else {
      <span
        class="status-chip"
        [class.status-chip--compact]="compact()"
        [class.completed]="chip().tone === 'success'"
        [class.error]="chip().tone === 'error'"
        [class.pending]="chip().tone === 'pending'"
      >
        <i class="fas" [class]="chip().icon" aria-hidden="true"></i>
        <span [textContent]="chip().label"></span>
      </span>
    }
  `,
  styleUrl: './experiment-status.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentStatusComponent {
  readonly status = input.required<string>();
  readonly compact = input(false);
  /** True renders the tone as a bare dot; the chip stays the default everywhere else. */
  readonly dot = input(false);

  protected readonly chip = computed(() => statusChip(this.status()));
}
