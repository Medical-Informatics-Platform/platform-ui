import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DatasetSelectorComponent } from './dataset-selector.component';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

describe('DatasetSelectorComponent', () => {
  let fixture: ComponentFixture<DatasetSelectorComponent>;
  let component: DatasetSelectorComponent;
  let expStudioService: jasmine.SpyObj<ExperimentStudioService>;

  const setInputs = (inputs: {
    datasets?: { code: string; label: string }[];
    selectedDatasetCodes?: string[];
    autoSelectAll?: boolean;
  }): void => {
    Object.entries(inputs).forEach(([name, value]) => {
      fixture.componentRef.setInput(name, value);
    });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    expStudioService = jasmine.createSpyObj('ExperimentStudioService', ['setSelectedDatasets']);

    await TestBed.configureTestingModule({
      imports: [DatasetSelectorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: expStudioService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DatasetSelectorComponent);
    component = fixture.componentInstance;
  });

  it('does not preselect all datasets while edit state is waiting for hydration', () => {
    setInputs({
      autoSelectAll: false,
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    expect(component.selectedDatasets.size).toBe(0);
    expect(expStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('uses hydrated dataset codes instead of replacing them with all datasets', () => {
    setInputs({
      autoSelectAll: false,
      selectedDatasetCodes: ['ds2'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    expect(component.isDatasetSelected('ds1')).toBeFalse();
    expect(component.isDatasetSelected('ds2')).toBeTrue();
    expect(expStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('preselects the new pathology datasets when no previous selection is valid', () => {
    setInputs({
      autoSelectAll: true,
      datasets: [
        { code: 'old-ds1', label: 'Old Dataset 1' },
        { code: 'old-ds2', label: 'Old Dataset 2' },
      ],
    });
    expStudioService.setSelectedDatasets.calls.reset();

    setInputs({
      selectedDatasetCodes: [],
      datasets: [
        { code: 'new-ds1', label: 'New Dataset 1' },
        { code: 'new-ds2', label: 'New Dataset 2' },
      ],
    });

    expect(component.isDatasetSelected('new-ds1')).toBeTrue();
    expect(component.isDatasetSelected('new-ds2')).toBeTrue();
    expect(expStudioService.setSelectedDatasets).toHaveBeenCalledWith(['new-ds1', 'new-ds2']);
  });
});
