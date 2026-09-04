import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { SelectedVariablesComponent } from './selected-variables.component';

describe('SelectedVariablesComponent', () => {
  let experimentStudioService: {
    selectedVariables: ReturnType<typeof signal<any[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    setVariables: jasmine.Spy;
    addVariableAndEnrich: jasmine.Spy;
  };

  beforeEach(() => {
    experimentStudioService = {
      selectedVariables: signal<any[]>([]),
      selectedDatasets: signal<string[]>([]),
      setVariables: jasmine.createSpy('setVariables').and.callFake((vars: any[]) =>
        experimentStudioService.selectedVariables.set(vars),
      ),
      addVariableAndEnrich: jasmine.createSpy('addVariableAndEnrich'),
    };

    TestBed.configureTestingModule({
      imports: [SelectedVariablesComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: experimentStudioService },
      ],
    });
  });

  function openPopover(fixture: ReturnType<typeof TestBed.createComponent<SelectedVariablesComponent>>): void {
    fixture.nativeElement.querySelector('.selected-variables-trigger').click();
    fixture.detectChanges();
  }

  it('toggles the popover from the count trigger', () => {
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.selected-variables-popover')).toBeNull();

    openPopover(fixture);

    expect(fixture.componentInstance.isOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('.selected-variables-popover')).not.toBeNull();
  });

  it('shows an empty hint when the pool is empty', () => {
    experimentStudioService.selectedVariables.set([]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);

    const emptyEl: HTMLElement | null = fixture.nativeElement.querySelector('.parameter-empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl?.textContent).toContain('No variables in this experiment yet');
  });

  it('reports the selected chip count', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.variables().length).toBe(2);
    const countEl: HTMLElement | null = fixture.nativeElement.querySelector('.selected-variables-trigger-count');
    expect(countEl?.textContent).toBe('2');

    openPopover(fixture);
    const rows = fixture.nativeElement.querySelectorAll('.selected-vars-row');
    expect(rows.length).toBe(2);
  });

  it('paginates when the pool exceeds the page size', () => {
    experimentStudioService.selectedVariables.set(Array.from({ length: 7 }, (_, i) => ({ code: `v${i}`, label: `Var ${i}`, type: 'real' })));
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);

    expect(fixture.nativeElement.querySelectorAll('.selected-vars-row').length).toBe(5);
    expect((fixture.nativeElement.querySelector('.selected-vars-range') as HTMLElement).textContent?.trim()).toBe('1–5 of 7');

    fixture.componentInstance.nextPage();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.selected-vars-row').length).toBe(2);
    expect((fixture.nativeElement.querySelector('.selected-vars-range') as HTMLElement).textContent?.trim()).toBe('6–7 of 7');
    expect((fixture.nativeElement.querySelector('[aria-label="Next page"]') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('clamps the page index when a removal shrinks the list', () => {
    experimentStudioService.selectedVariables.set(Array.from({ length: 6 }, (_, i) => ({ code: `v${i}`, label: `Var ${i}`, type: 'real' })));
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);

    fixture.componentInstance.nextPage();
    fixture.detectChanges();
    expect(fixture.componentInstance.pageIndex()).toBe(1);

    fixture.componentInstance.removeItem({ code: 'v5' });
    fixture.detectChanges();

    expect(fixture.componentInstance.pageIndex()).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.selected-vars-row').length).toBe(5);
  });

  it('summarises values as enumeration chips or a numeric range', () => {
    const fixture = TestBed.createComponent(SelectedVariablesComponent);

    expect(fixture.componentInstance.valuesSummary({
      label: 'Sex',
      type: 'string',
      enumerations: [{ code: '1', label: 'Male' }, { code: '2', label: 'Female' }, { code: '3', label: 'Other' }, { code: '4', label: 'Unknown' }],
    } as any)).toEqual(['Male', 'Female', 'Other', '+1 more']);

    expect(fixture.componentInstance.valuesSummary({ label: 'Age', type: 'real', minValue: 0, maxValue: 90, units: 'years' } as any))
      .toEqual(['0 – 90 years']);

    expect(fixture.componentInstance.valuesSummary({ label: 'Unknown', type: 'string' } as any)).toEqual([]);
  });

  it('renders value chips and the numeric range in the table', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'sex_value', label: 'Sex', type: 'string', enumerations: [{ code: '1', label: 'Male' }] },
      { code: 'age_value', label: 'Age', type: 'real', minValue: 0, maxValue: 90 },
    ]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);

    const chips = [...fixture.nativeElement.querySelectorAll('.selected-var-value-chip')].map((el: any) => el.textContent?.trim());
    expect(chips).toEqual(['Male', '0 – 90']);
  });

  it('removes a single variable from the pool', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();

    fixture.componentInstance.removeItem({ code: 'age_value' });

    expect(experimentStudioService.setVariables).toHaveBeenCalledWith([
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
  });

  it('clears the whole pool', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
    ]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();

    fixture.componentInstance.clearList();

    expect(experimentStudioService.setVariables).toHaveBeenCalledWith([]);
  });
});
