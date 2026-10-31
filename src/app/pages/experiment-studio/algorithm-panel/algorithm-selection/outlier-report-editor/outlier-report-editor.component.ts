import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OUTLIER_STRATEGIES, OUTLIER_TAILS } from '../../../../../core/outlier-rules';
import { OutlierReportVariable } from '../../algorithm-panel.models';
import { AlgorithmConfigFormService } from '../algorithm-config-form.service';

/** outlier_report's per-variable rules: enabled, strategy, tail and fold for each numerical variable. */
@Component({
  selector: 'section[app-outlier-report-editor]',
  imports: [FormsModule],
  templateUrl: './outlier-report-editor.component.html',
  styleUrl: './outlier-report-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutlierReportEditorComponent {
  protected readonly form = inject(AlgorithmConfigFormService);
  protected readonly outlierStrategies = OUTLIER_STRATEGIES;
  protected readonly outlierTails = OUTLIER_TAILS;

  variableLabel(variable: OutlierReportVariable): string {
    return variable?.label ?? variable?.name ?? variable?.code ?? '';
  }
}
