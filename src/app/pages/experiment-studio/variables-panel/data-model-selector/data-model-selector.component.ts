import { ChangeDetectionStrategy, Component, computed, input, OnChanges, OnInit, output, SimpleChanges } from '@angular/core';
import { DataModel } from '../../../../models/data-model.interface';
import { isSameDataModel } from '../../../../core/data-model.utils';

@Component({
  selector: 'app-data-model-selector',
  templateUrl: './data-model-selector.component.html',
  styleUrl: './data-model-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataModelSelectorComponent implements OnChanges, OnInit {
  readonly crossSectionalModels = input<DataModel[]>([]);
  readonly longitudinalModels = input<DataModel[]>([]);
  readonly defaultModel = input<DataModel | null>(null);

  readonly dataModelChange = output<DataModel | null>();

  selectedDataModel: DataModel | null = null;

  /** Single flat list for the chip loop (cross-sectional first). */
  readonly models = computed(() => [...this.crossSectionalModels(), ...this.longitudinalModels()]);

  ngOnInit(): void {
    this.updateSelectedModel();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultModel'] || changes['crossSectionalModels'] || changes['longitudinalModels']) {
      this.updateSelectedModel();
    }
  }

  updateSelectedModel(): void {
    const defaultModel = this.defaultModel();
    if (this.selectedDataModel === defaultModel) {
      return;
    }

    const shouldEmit = !isSameDataModel(this.selectedDataModel, defaultModel);
    this.selectedDataModel = defaultModel;
    if (shouldEmit) {
      this.dataModelChange.emit(this.selectedDataModel);
    }
  }

  selectModel(model: DataModel): void {
    this.selectedDataModel = model;
    this.dataModelChange.emit(this.selectedDataModel);
  }

  isOptionSelected(model: DataModel): boolean {
    return isSameDataModel(this.selectedDataModel, model);
  }
}
