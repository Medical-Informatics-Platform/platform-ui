import type { MockedObject } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DatasetSelectorComponent } from './dataset-selector.component';
import { AnalysisStudioService } from '../../../../services/analysis-studio.service';
import { createSpyObj } from '../../../../testing/spy-obj.testing';

describe('DatasetSelectorComponent', () => {
  let fixture: ComponentFixture<DatasetSelectorComponent>;
  let component: DatasetSelectorComponent;
  let analysisStudioService: MockedObject<AnalysisStudioService>;

  const setInputs = (inputs: {
    datasets?: { code: string; label: string }[];
    selectedDatasetCodes?: string[];
  }): void => {
    Object.entries(inputs).forEach(([name, value]) => {
      fixture.componentRef.setInput(name, value);
    });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    analysisStudioService = createSpyObj('AnalysisStudioService', ['setSelectedDatasets']);

    await TestBed.configureTestingModule({
      imports: [DatasetSelectorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AnalysisStudioService, useValue: analysisStudioService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DatasetSelectorComponent);
    component = fixture.componentInstance;
  });

  it('does not select datasets the service has not asked for', () => {
    setInputs({
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    expect(component.selectedDatasets().size).toBe(0);
    expect(analysisStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('uses hydrated dataset codes instead of replacing them with all datasets', () => {
    setInputs({
      selectedDatasetCodes: ['ds2'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    expect(component.isDatasetSelected('ds1')).toBe(false);
    expect(component.isDatasetSelected('ds2')).toBe(true);
    expect(analysisStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('renders a chip per dataset and toggles the selection on click', () => {
    analysisStudioService.setSelectedDatasets.mockClear();
    // Mirror the real service: writing the selection is what feeds the input back.
    analysisStudioService.setSelectedDatasets.mockImplementation((codes: string[]) =>
      fixture.componentRef.setInput('selectedDatasetCodes', codes)
    );
    setInputs({
      selectedDatasetCodes: ['ds1'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    const chips = fixture.nativeElement.querySelectorAll('.studio-chip') as NodeListOf<HTMLElement>;
    expect(chips.length).toBe(2);
    expect(chips[0].classList.contains('is-selected')).toBe(true);
    expect(chips[1].classList.contains('is-selected')).toBe(false);

    chips[1].click();
    fixture.detectChanges();

    expect(component.isDatasetSelected('ds2')).toBe(true);
    expect(analysisStudioService.setSelectedDatasets).toHaveBeenCalledWith(['ds1', 'ds2']);
  });

  it('selects all datasets when selectAll is called', () => {
    setInputs({
      selectedDatasetCodes: ['ds1'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    component.selectAll();
    expect(analysisStudioService.setSelectedDatasets).toHaveBeenCalledWith(['ds1', 'ds2']);
  });

  it('clears all datasets when clearAll is called', () => {
    setInputs({
      selectedDatasetCodes: ['ds1', 'ds2'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    component.clearAll();
    expect(analysisStudioService.setSelectedDatasets).toHaveBeenCalledWith([]);
  });

  it('shows empty state when datasets array is empty', () => {
    setInputs({
      datasets: [],
      selectedDatasetCodes: [],
    });

    const emptyState = fixture.nativeElement.querySelector('.dataset-empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('No datasets available');
  });
});

