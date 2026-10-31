import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ControlContainer, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
import { allowsDecimal, optionLabel } from '../../utils/algorithm-parameter-form.utils';
import { EnrichedParameterField } from '../../algorithm-panel.models';
import { AlgorithmConfigFormService } from '../algorithm-config-form.service';

/**
 * One parameter of the selected method: its label, hints, the control for its type, and its
 * validation messages. Attached to the `.config-field` element, which carries the form group.
 */
@Component({
  selector: 'div[app-algorithm-config-field]',
  imports: [ReactiveFormsModule],
  // The form group sits on the host element; this lets formControlName in the view find it.
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  templateUrl: './algorithm-config-field.component.html',
  styleUrl: './algorithm-config-field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmConfigFieldComponent {
  readonly field = input.required<EnrichedParameterField>();
  protected readonly form = inject(AlgorithmConfigFormService);
  protected readonly allowsDecimal = allowsDecimal;
  protected readonly optionLabel = optionLabel;
}
