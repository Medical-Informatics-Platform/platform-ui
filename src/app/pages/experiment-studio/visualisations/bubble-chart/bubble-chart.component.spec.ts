import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BubbleChartComponent } from './bubble-chart.component';
import { ExperimentStudioGuideStateService } from '../../guide/experiment-studio-guide-state.service';

describe('BubbleChartComponent tutorial highlighting', () => {
  let component: BubbleChartComponent;
  let guideState: {
    activeStepId: ReturnType<typeof signal<string | null>>;
    expectedTutorialCovariate: ReturnType<typeof signal<string | null>>;
    matchesTutorialCovariate: (node: any, expected?: string | null) => boolean;
  };

  beforeEach(() => {
    guideState = {
      activeStepId: signal<string | null>('select-sex-variable'),
      expectedTutorialCovariate: signal<string | null>('sex'),
      matchesTutorialCovariate: (node: any, expected?: string | null) => {
        const target = String(expected ?? '').trim().toLowerCase();
        const candidates = [node?.code, node?.label, node?.name]
          .map((value) => String(value ?? '').trim().toLowerCase())
          .filter(Boolean);

        return candidates.some((value) => value === target || value.includes(target));
      },
    };

    TestBed.configureTestingModule({
      imports: [BubbleChartComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioGuideStateService, useValue: guideState },
      ],
    });

    component = TestBed.createComponent(BubbleChartComponent).componentInstance;
    component.d3Data = {
      label: 'root',
      children: [
        {
          label: 'Demographics',
          children: [
            { code: 'sex', label: 'Sex', type: 'text' },
            { code: 'age_value', label: 'Age', type: 'real' },
          ],
        },
      ],
    };
  });

  it('returns the highlighted tutorial node code when the guide target is still pending', () => {
    expect((component as any).getPendingTutorialHighlightCode()).toBe('sex');
  });

  it('removes the tutorial highlight once the target is added to a role list', () => {
    guideState.activeStepId.set('add-sex-covariate');
    component.selectedCovariates = [{ code: 'sex', label: 'Sex', type: 'text' }];

    expect((component as any).getPendingTutorialHighlightCode()).toBeNull();
  });

  it('keeps Age highlighted until it is added to Variables for the Age add step', () => {
    guideState.activeStepId.set('add-age-variable');
    guideState.expectedTutorialCovariate.set('age');
    component.selectedCovariates = [{ code: 'age_value', label: 'Age', type: 'real' }];

    expect((component as any).getPendingTutorialHighlightCode()).toBe('age_value');

    component.selectedVariables = [{ code: 'age_value', label: 'Age', type: 'real' }];

    expect((component as any).getPendingTutorialHighlightCode()).toBeNull();
  });
});
