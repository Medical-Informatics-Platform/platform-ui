import { ChangeDetectionStrategy, Component, effect, inject, OnInit, untracked } from '@angular/core';
import { SelectedVariablesComponent } from './selected-variables/selected-variables.component';
import { ModelBrowserComponent } from './model-browser/model-browser.component';
import { VariableDetailsPanelComponent } from './variable-details-panel/variable-details-panel.component';
import { VariableCatalogService } from './variable-catalog.service';
import { VariableHistogramService } from './variable-histogram.service';
import { VariableSelectionService } from './variable-selection.service';

/**
 * Variables step of the experiment studio: lays out the model browser, the
 * variable details card and the selected-variables pool, and owns the
 * panel-scoped catalog / histogram / selection services they share.
 */
@Component({
  selector: 'app-variables-panel',
  templateUrl: './variables-panel.component.html',
  styleUrl: './variables-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VariableCatalogService, VariableHistogramService, VariableSelectionService],
  imports: [ModelBrowserComponent, VariableDetailsPanelComponent, SelectedVariablesComponent],
})
export class VariablesPanelComponent implements OnInit {
  private readonly catalog = inject(VariableCatalogService);
  protected readonly selection = inject(VariableSelectionService);

  constructor() {
    effect(() => {
      const model = this.catalog.selectedDataModel();
      untracked(() => this.selection.showDataModel(model));
    });
  }

  ngOnInit(): void {
    this.selection.loadDataModels();
  }
}
