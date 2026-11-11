import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { StepPickerGroup, StepPickerOption } from '../../../../core/step-picker.utils';

/**
 * The one "add" row of a pipeline stage. Closed, it is a single dashed row on the stage's rail;
 * opened, it lists every step the stage can still add, grouped by purpose (see
 * `core/step-picker.utils.ts`). It only reports the pick: the panel opens the station.
 */
@Component({
  selector: 'app-step-picker',
  templateUrl: './step-picker.component.html',
  styleUrl: './step-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepPickerComponent {
  /** The menu. With no group the picker renders nothing. */
  readonly groups = input<StepPickerGroup[]>([]);
  /** The action on the add row, e.g. "Add a preprocessing step". */
  readonly label = input('Add a step');
  /** One plain sentence under the label saying what kind of steps the menu holds. */
  readonly hint = input('');
  /** Whether the menu is shown. The picker toggles it itself; a parent may also set it. */
  readonly open = model(false);
  /** The `id` of the picked option. */
  readonly pick = output<string>();

  protected toggle(): void {
    throw new Error('not implemented');
  }

  protected choose(option: StepPickerOption): void {
    void option;
    throw new Error('not implemented');
  }

  protected close(): void {
    throw new Error('not implemented');
  }
}
