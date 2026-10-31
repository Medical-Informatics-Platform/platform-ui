import { computed, inject, Injectable, signal } from '@angular/core';
import { DataModel, D3HierarchyNode } from '../../../models/data-model.interface';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { isSameDataModel } from '../../../core/data-model.utils';
import { DatasetOption } from './variables-panel.models';

/**
 * What the variables panel browses: the pathologies on offer, the selected one as a
 * tree, and the datasets it can draw on. Provided by VariablesPanelComponent, so each
 * panel instance owns one.
 */
@Injectable()
export class VariableCatalogService {
  private readonly studio = inject(ExperimentStudioService);

  readonly crossSectionalModels = signal<DataModel[]>([]);
  readonly longitudinalModels = signal<DataModel[]>([]);
  /** The selected pathology as a browsable tree; null until a data model is loaded. */
  readonly hierarchy = signal<D3HierarchyNode | null>(null);
  readonly availableDatasets = signal<DatasetOption[]>([]);

  readonly selectedDataModel = this.studio.selectedDataModel;
  readonly selectedVariables = this.studio.selectedVariables;
  /** Variables missing from a selected dataset: grayed out in every view and never selected. */
  readonly unavailableVariables = this.studio.unavailableVariables;
  readonly selectedDatasets = this.studio.selectedDatasets;
  readonly selectedDatasetCount = computed(() => (this.studio.selectedDatasets() ?? []).length);
  readonly hasSelectedDatasets = computed(() => this.selectedDatasetCount() > 0);

  /**
   * Stores the pathologies the backend offers and keeps the selected one when it is
   * still offered. Otherwise the first one is picked, except while an existing
   * experiment is open (its pathology must not silently change).
   */
  setDataModels(dataModels: DataModel[]): void {
    const { crossSectional, longitudinal } = this.studio.categorizeDataModels(dataModels);
    this.crossSectionalModels.set(crossSectional);
    this.longitudinalModels.set(longitudinal);
    if (!dataModels.length) {
      this.selectedDataModel.set(null);
      return;
    }
    const current = this.selectedDataModel();
    const models = [...crossSectional, ...longitudinal];
    const next = current ? models.find((model) => isSameDataModel(model, current)) ?? null : null;
    const fallback = this.studio.editingExistingExperiment() ? null : models[0] ?? null;
    this.selectedDataModel.set(next ?? fallback);
  }

  /** Builds the tree and the dataset options of the selected pathology. */
  loadHierarchy(): void {
    const model = this.selectedDataModel();
    if (!model) return;
    this.hierarchy.set(this.studio.convertToD3Hierarchy(model).hierarchy);
    // TODO: Refactor dataset sourcing via Exaflow so datasets/labels come from a single canonical source.
    this.studio.updateAvailableDatasets(model);
    this.availableDatasets.set(this.studio.availableDatasets());
    this.ensureDatasetsSelected();
  }

  /**
   * A new session (or a fresh pathology pick) should land with a working
   * dataset gate, not a lone "0". Auto-select every available dataset unless
   * the user has a valid selection or is opening an existing experiment.
   */
  ensureDatasetsSelected(): void {
    if (this.studio.editingExistingExperiment()) {
      return;
    }
    const selected = new Set(this.studio.selectedDatasets());
    const available = this.availableDatasets();
    if (available.some((dataset) => selected.has(dataset.code))) {
      return;
    }
    this.studio.setSelectedDatasets(available.map((dataset) => dataset.code));
  }

  clear(): void {
    this.availableDatasets.set([]);
    this.hierarchy.set(null);
  }

  /** The label of a dataset code, falling back to the code. */
  datasetLabel(code: string): string {
    return this.availableDatasets().find((dataset) => dataset.code === code)?.label ?? code;
  }
}
