import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ExperimentStudioService } from '../../../../../services/experiment-studio.service';
import { AlgorithmRunService } from '../../experiment-result/algorithm-run.service';
import { AlgorithmRunRequirementsComponent } from '../../experiment-result/algorithm-run-requirements/algorithm-run-requirements.component';
import { AlgorithmCatalogService } from '../algorithm-catalog.service';
import { AlgorithmConfigFormService } from '../algorithm-config-form.service';
import { AlgorithmConfigFieldComponent } from '../algorithm-config-field/algorithm-config-field.component';
import { OutlierReportEditorComponent } from '../outlier-report-editor/outlier-report-editor.component';

/**
 * The selected method's parameters: what still blocks the run, the parameter form with its
 * Advanced fields, cross-validation, and the outlier_report editor. Read-only while the method
 * is unavailable.
 */
@Component({
  selector: 'section[app-algorithm-parameters]',
  imports: [ReactiveFormsModule, AlgorithmConfigFieldComponent, OutlierReportEditorComponent, AlgorithmRunRequirementsComponent],
  templateUrl: './algorithm-parameters.component.html',
  styleUrl: './algorithm-parameters.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmParametersComponent {
  protected readonly catalog = inject(AlgorithmCatalogService);
  protected readonly form = inject(AlgorithmConfigFormService);
  protected readonly run = inject(AlgorithmRunService);
  protected readonly selectedAlgorithm = inject(ExperimentStudioService).selectedAlgorithm;

  toggleCrossValidation(event: Event): void {
    this.form.setCrossValidation(!!(event.target as HTMLInputElement | null)?.checked);
  }
}
