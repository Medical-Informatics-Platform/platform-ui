import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, SimpleChanges, OnChanges, OnInit } from '@angular/core';
import { FormsModule } from "@angular/forms";
import { DataModel } from '../../../../models/data-model.interface';

@Component({
    selector: 'app-data-model-selector',
    templateUrl: './data-model-selector.component.html',
    styleUrls: ['./data-model-selector.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,
    ]
})
export class DataModelSelectorComponent implements OnChanges, OnInit {
  @Input() crossSectionalModels: DataModel[] = [];
  @Input() longitudinalModels: DataModel[] = [];
  @Input() defaultModel: DataModel | null = null;

  @Output() dataModelChange = new EventEmitter<DataModel | null>();

  selectedDataModel: DataModel | null = null;

  ngOnInit(): void {
    this.updateSelectedModel();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultModel'] || changes['crossSectionalModels'] || changes['longitudinalModels']) {
      this.updateSelectedModel();
    }
  }

  updateSelectedModel(): void {
    this.selectedDataModel = this.defaultModel;
    this.dataModelChange.emit(this.selectedDataModel);
  }

  onDataModelChange(): void {
    this.dataModelChange.emit(this.selectedDataModel);
  }
}
