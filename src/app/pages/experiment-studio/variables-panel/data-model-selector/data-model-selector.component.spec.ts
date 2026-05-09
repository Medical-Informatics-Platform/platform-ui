import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DataModelSelectorComponent } from './data-model-selector.component';
import { DataModel } from '../../../../models/data-model.interface';

describe('DataModelSelectorComponent', () => {
  let fixture: ComponentFixture<DataModelSelectorComponent>;
  let component: DataModelSelectorComponent;

  const persistedModel: DataModel = {
    uuid: 'persisted-stroke',
    code: 'stroke',
    version: '3.7',
    label: 'Stroke 3.7',
    released: true,
  };

  const catalogModel: DataModel = {
    uuid: 'catalog-stroke',
    code: 'stroke',
    version: '3.7',
    label: 'Stroke 3.7',
    released: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DataModelSelectorComponent],
      providers: [provideZonelessChangeDetection()],
    });

    fixture = TestBed.createComponent(DataModelSelectorComponent);
    component = fixture.componentInstance;
  });

  it('replaces an equivalent persisted model with the catalog option instance without re-emitting', () => {
    spyOn(component.dataModelChange, 'emit');
    component.selectedDataModel = persistedModel;
    fixture.componentRef.setInput('crossSectionalModels', [catalogModel]);
    fixture.componentRef.setInput('defaultModel', catalogModel);

    fixture.detectChanges();

    expect(component.selectedDataModel).toBe(catalogModel);
    expect(component.dataModelChange.emit).not.toHaveBeenCalled();
  });
});
