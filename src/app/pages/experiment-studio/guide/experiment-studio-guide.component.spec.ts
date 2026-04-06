import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ExperimentStudioGuideComponent } from './experiment-studio-guide.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStudioGuideStateService } from './experiment-studio-guide-state.service';

describe('ExperimentStudioGuideComponent', () => {
  let component: ExperimentStudioGuideComponent;
  let router: jasmine.SpyObj<Router>;
  let experimentStudioService: {
    resetStudioState: jasmine.Spy;
    pathologyAccessWarning: ReturnType<typeof signal>;
    selectedVariables: ReturnType<typeof signal>;
    selectedCovariates: ReturnType<typeof signal>;
    selectedAlgorithm: ReturnType<typeof signal>;
    currentExperimentUUID: ReturnType<typeof signal>;
  };

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));

    experimentStudioService = {
      resetStudioState: jasmine.createSpy('resetStudioState'),
      pathologyAccessWarning: signal(null),
      selectedVariables: signal([]),
      selectedCovariates: signal([]),
      selectedAlgorithm: signal(null),
      currentExperimentUUID: signal<string | null>(null),
    };

    TestBed.configureTestingModule({
      imports: [ExperimentStudioGuideComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: router },
        { provide: ExperimentStudioService, useValue: experimentStudioService },
        ExperimentStudioGuideStateService,
      ],
    });

    component = TestBed.createComponent(ExperimentStudioGuideComponent).componentInstance;
  });

  afterEach(() => {
    document.querySelectorAll('.studio-sidenav').forEach((element) => element.remove());
    document.querySelectorAll('[data-guide]').forEach((element) => element.remove());
  });

  it('does not reset studio state when the guide is opened manually', () => {
    component.startGuide();

    expect(experimentStudioService.resetStudioState).not.toHaveBeenCalled();

    component.closeGuide();
  });

  it('tracks the highlighted target rectangle for the active step', () => {
    const target = document.createElement('section');
    target.setAttribute('data-guide', 'variable-selection');
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      top: 140,
      right: 760,
      bottom: 540,
      left: 220,
      width: 540,
      height: 400,
      x: 220,
      y: 140,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(target);

    component.activeSteps.set([
      {
        id: 'variable-selection',
        section: 'Explore',
        title: 'Variables Selection',
        body: '',
        selector: '[data-guide="variable-selection"]',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.highlightRect()).toEqual(jasmine.objectContaining({
      top: 130,
      left: 210,
    }));
    expect(component.highlightRect()?.right).toBeGreaterThan(component.highlightRect()!.left);
    expect(component.highlightRect()?.bottom).toBeGreaterThan(component.highlightRect()!.top);
  });

  it('keeps the highlight aligned when the target scrolls above the viewport', () => {
    const target = document.createElement('section');
    target.setAttribute('data-guide', 'analysis-section');
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      top: -24,
      right: 760,
      bottom: 140,
      left: 220,
      width: 540,
      height: 164,
      x: 220,
      y: -24,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(target);

    component.activeSteps.set([
      {
        id: 'analysis-intro',
        section: 'Analysis',
        title: 'Analysis Section',
        body: '',
        selector: '[data-guide="analysis-section"]',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.highlightRect()).toEqual(jasmine.objectContaining({
      top: -34,
      left: 210,
      bottom: 150,
      right: 770,
    }));
  });

  it('clears the highlight when the active step target is missing', () => {
    component.highlightRect.set({
      top: 40,
      right: 160,
      bottom: 120,
      left: 24,
      width: 136,
      height: 80,
    });
    component.activeSteps.set([
      {
        id: 'missing-target',
        section: 'Explore',
        title: 'Missing',
        body: '',
        selector: '[data-guide="missing-target"]',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.highlightRect()).toBeNull();
  });

  it('scrolls the analysis section guide step to the top of the viewport', () => {
    const analysisSection = document.createElement('section');
    analysisSection.setAttribute('data-guide', 'analysis-section');
    spyOn(analysisSection, 'getBoundingClientRect').and.returnValue({
      top: 320,
      right: 920,
      bottom: 880,
      left: 260,
      width: 660,
      height: 560,
      x: 260,
      y: 320,
      toJSON: () => ({}),
    } as DOMRect);
    const scrollSpy = spyOn(analysisSection, 'scrollIntoView');
    document.body.appendChild(analysisSection);
    spyOn(component as any, 'scheduleLayoutUpdate').and.stub();

    component.activeSteps.set([
      {
        id: 'analysis-intro',
        section: 'Analysis',
        title: 'Analysis Section',
        body: '',
        selector: '[data-guide="analysis-section"]',
      },
    ] as any);

    (component as any).syncStepLayout();

    expect(scrollSpy).toHaveBeenCalledWith(jasmine.objectContaining({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    }));
  });

  it('keeps the guide collapsed when navigating to the next step from collapsed mode', () => {
    spyOn(component as any, 'syncStepLayout').and.stub();
    component.activeSteps.set([
      { id: 'step-1', section: 'Explore', title: 'Step 1', body: '' },
      { id: 'step-2', section: 'Explore', title: 'Step 2', body: '' },
    ] as any);
    component.isOpen.set(true);
    component.isCollapsed.set(true);

    component.goToNextStep();

    expect(component.currentIndex()).toBe(1);
    expect(component.isCollapsed()).toBeTrue();
  });

  it('disables Back when the previous step requires action', () => {
    spyOn(component as any, 'syncStepLayout').and.stub();
    component.activeSteps.set([
      { id: 'step-1', section: 'Explore', title: 'Step 1', body: '', requirement: 'selected-sex' },
      { id: 'step-2', section: 'Explore', title: 'Step 2', body: '' },
    ] as any);
    component.isOpen.set(true);
    component.currentIndex.set(1);

    expect(component.canGoToPrevious()).toBeFalse();

    component.goToPreviousStep();

    expect(component.currentIndex()).toBe(1);
  });

  it('keeps Back available when the previous step is informational', () => {
    spyOn(component as any, 'syncStepLayout').and.stub();
    component.activeSteps.set([
      { id: 'step-1', section: 'Explore', title: 'Step 1', body: '' },
      { id: 'step-2', section: 'Explore', title: 'Step 2', body: '' },
    ] as any);
    component.isOpen.set(true);
    component.currentIndex.set(1);

    expect(component.canGoToPrevious()).toBeTrue();

    component.goToPreviousStep();

    expect(component.currentIndex()).toBe(0);
  });

  it('keeps the guide expanded when navigating onto compact-title steps', () => {
    spyOn(component as any, 'syncStepLayout').and.stub();
    component.activeSteps.set([
      { id: 'step-1', section: 'Explore', title: 'Step 1', body: '' },
      { id: 'step-2', section: 'Explore', title: 'Step 2', body: '', compactTitle: true },
      { id: 'step-3', section: 'Explore', title: 'Step 3', body: '' },
    ] as any);
    component.isOpen.set(true);

    component.goToNextStep();

    expect(component.currentIndex()).toBe(1);
    expect(component.isCollapsed()).toBeFalse();

    component.isCollapsed.set(true);
    component.goToNextStep();

    expect(component.currentIndex()).toBe(2);
    expect(component.isCollapsed()).toBeTrue();
  });

  it('replaces exact Sex and Age guide copy with the configured guide labels', () => {
    (component as any).guideCovariateLabel = 'Biological Sex';
    (component as any).guideVariableLabel = 'Age Years';

    const replaced = (component as any).replaceGuideTargets('Use Sex as Covariate and Age as Variable.');
    const steps = (component as any).resolveSteps();

    expect(replaced).toBe('Use Biological Sex as Covariate and Age Years as Variable.');
    expect(steps.find((step: any) => step.id === 'add-sex-covariate')?.title).toBe('Add Biological Sex as Covariate');
    expect(steps.find((step: any) => step.id === 'add-age-variable')?.title).toBe('Add Age Years as Variable');
  });

  it('treats the Age guide step as complete only when Age is added to Variables', () => {
    experimentStudioService.selectedCovariates.set([{ code: 'sex', label: 'Sex' }]);
    experimentStudioService.selectedVariables.set([{ code: 'age', label: 'Age' }]);

    expect((component as any).isStepRequirementSatisfied({ requirement: 'variable-age' })).toBeTrue();
  });

  it('unlocks the algorithm selection guide step when any algorithm is selected', () => {
    expect((component as any).isStepRequirementSatisfied({ requirement: 'algorithm-selected' })).toBeFalse();

    experimentStudioService.selectedAlgorithm.set({ name: 'linear_regression', label: 'Linear Regression' });
    expect((component as any).isStepRequirementSatisfied({ requirement: 'algorithm-selected' })).toBeTrue();
  });

  it('marks the add-sex and add-age guide steps as requiring action until the assignment is completed', () => {
    component.activeSteps.set([
      { id: 'add-sex-covariate', section: 'Explore', title: 'Add Sex', body: '', requirement: 'covariate-sex' },
      { id: 'add-age-variable', section: 'Explore', title: 'Add Age', body: '', requirement: 'variable-age' },
    ] as any);

    component.currentIndex.set(0);
    expect(component.stepNeedsAction()).toBeTrue();
    expect(component.nextButtonLabel()).toBe('Action required');

    experimentStudioService.selectedCovariates.set([{ code: 'sex', label: 'Sex' }]);
    expect(component.stepNeedsAction()).toBeFalse();

    component.currentIndex.set(1);
    expect(component.stepNeedsAction()).toBeTrue();
    expect(component.nextButtonLabel()).toBe('Action required');

    experimentStudioService.selectedVariables.set([{ code: 'age', label: 'Age' }]);
    expect(component.stepNeedsAction()).toBeFalse();
  });

  it('keeps future experiment steps in the guide flow even before the save flow is opened', () => {
    const steps = (component as any).resolveSteps();

    expect(steps.some((step: any) => step.id === 'experiment-set-parameters')).toBeFalse();
    expect(steps.some((step: any) => step.id === 'experiment-wait-for-save')).toBeTrue();
    expect(steps.some((step: any) => step.id === 'experiment-finish')).toBeTrue();
  });

  it('lets the algorithm selection step interact with the full experiment section', () => {
    const steps = (component as any).resolveSteps();
    const algorithmStep = steps.find((step: any) => step.id === 'experiment-select-algorithm');

    expect(algorithmStep?.selector).toBe('[data-guide="experiment-workspace"]');
    expect(algorithmStep?.allowTargetInteraction).toBeTrue();
  });

  it('marks the Save As step as requiring action until the save form is opened', () => {
    component.activeSteps.set([
      {
        id: 'experiment-save-as-action',
        section: 'Experiment',
        title: 'Save As',
        body: '',
        selector: '[data-guide="save-as-action"]',
        allowTargetInteraction: true,
        advanceOnTargetClick: true,
        requirement: 'save-as-opened',
      },
    ] as any);

    expect(component.stepNeedsAction()).toBeTrue();
    expect(component.nextButtonLabel()).toBe('Action required');
    expect((component as any).isStepRequirementSatisfied({ requirement: 'save-as-opened' })).toBeFalse();

    const saveForm = document.createElement('div');
    saveForm.setAttribute('data-guide', 'save-as-form');
    spyOn(saveForm, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 420,
      bottom: 320,
      left: 240,
      width: 180,
      height: 80,
      x: 240,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(saveForm);

    expect((component as any).isStepRequirementSatisfied({ requirement: 'save-as-opened' })).toBeTrue();
  });

  it('moves to the next step after clicking the Save As target', (done) => {
    const saveButton = document.createElement('button');
    saveButton.setAttribute('data-guide', 'save-as-action');
    spyOn(saveButton, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 360,
      bottom: 280,
      left: 240,
      width: 120,
      height: 40,
      x: 240,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(saveButton);

    const saveForm = document.createElement('div');
    saveForm.setAttribute('data-guide', 'save-as-form');
    spyOn(saveForm, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 460,
      bottom: 330,
      left: 240,
      width: 220,
      height: 90,
      x: 240,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(saveForm);

    spyOn(component as any, 'syncStepLayout').and.callFake(() => undefined);
    component.isOpen.set(true);
    component.activeSteps.set([
      {
        id: 'experiment-save-as-action',
        section: 'Experiment',
        title: 'Save As',
        body: '',
        selector: '[data-guide="save-as-action"]',
        allowTargetInteraction: true,
        advanceOnTargetClick: true,
        requirement: 'save-as-opened',
      },
      {
        id: 'experiment-wait-for-save',
        section: 'Experiment',
        title: 'Save Experiment',
        body: '',
        selector: '[data-guide="save-as-flow"]',
        allowTargetInteraction: true,
        requirement: 'experiment-saved-as',
      },
    ] as any);

    component.onDocumentClick({ target: saveButton } as unknown as MouseEvent);

    setTimeout(() => {
      expect(component.currentIndex()).toBe(1);
      done();
    }, 320);
  });

  it('places the result action familiarization steps before the save-complete waiting step', () => {
    const steps = (component as any).resolveSteps();
    const runIndex = steps.findIndex((step: any) => step.id === 'experiment-run');
    const exploreIndex = steps.findIndex((step: any) => step.id === 'experiment-explore-result');
    const editIndex = steps.findIndex((step: any) => step.id === 'experiment-edit-parameters');
    const summaryActionIndex = steps.findIndex((step: any) => step.id === 'experiment-summary-action');
    const saveActionIndex = steps.findIndex((step: any) => step.id === 'experiment-save-as-action');
    const saveWaitIndex = steps.findIndex((step: any) => step.id === 'experiment-wait-for-save');

    expect(runIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBe(runIndex + 1);
    expect(editIndex).toBe(exploreIndex + 1);
    expect(summaryActionIndex).toBe(editIndex + 1);
    expect(saveActionIndex).toBe(summaryActionIndex + 1);
    expect(saveWaitIndex).toBe(saveActionIndex + 1);
  });

  it('keeps the Edit Parameters familiarization step non-interactive', () => {
    const steps = (component as any).resolveSteps();
    const editStep = steps.find((step: any) => step.id === 'experiment-edit-parameters');

    expect(editStep?.allowTargetInteraction).toBeFalse();
  });

  it('keeps the experiment summary familiarization step non-interactive', () => {
    const steps = (component as any).resolveSteps();
    const summaryStep = steps.find((step: any) => step.id === 'experiment-summary-action');

    expect(summaryStep?.allowTargetInteraction).toBeFalse();
  });

  it('keeps the final experiment step open to page interaction', () => {
    const steps = (component as any).resolveSteps();
    const finishStep = steps.find((step: any) => step.id === 'experiment-finish');

    expect(finishStep?.allowTargetInteraction).toBeTrue();
  });

  it('labels the final experiment step action as Move to dashboard', () => {
    component.activeSteps.set([
      { id: 'experiment-finish', section: 'Experiment', title: 'Done', body: '', allowTargetInteraction: true },
    ] as any);

    expect(component.nextButtonLabel()).toBe('Move to dashboard');
  });

  it('navigates to the dashboard from the final experiment step', () => {
    component.activeSteps.set([
      { id: 'experiment-finish', section: 'Experiment', title: 'Done', body: '', allowTargetInteraction: true },
    ] as any);
    component.isOpen.set(true);

    component.goToNextStep();

    expect(router.navigate).toHaveBeenCalledWith(['/experiments-dashboard']);
    expect(component.isOpen()).toBeFalse();
  });

  it('keeps the run step locked until an experiment result is rendered', () => {
    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-result-ready' })).toBeFalse();

    const resultSection = document.createElement('section');
    resultSection.setAttribute('data-guide', 'experiment-result');
    spyOn(resultSection, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 1080,
      bottom: 760,
      left: 360,
      width: 720,
      height: 520,
      x: 360,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(resultSection);

    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-result-ready' })).toBeTrue();
  });

  it('keeps the save-wait step locked until Save As creates a new experiment and returns to parameters', () => {
    component.isOpen.set(true);
    component.activeSteps.set([
      {
        id: 'experiment-wait-for-save',
        section: 'Experiment',
        title: 'Save Experiment',
        body: '',
        requirement: 'experiment-saved-as',
      },
    ] as any);
    (component as any).experimentSaveBaselineUuid.set(null);

    const resultSection = document.createElement('section');
    resultSection.setAttribute('data-guide', 'experiment-result');
    spyOn(resultSection, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 1080,
      bottom: 760,
      left: 360,
      width: 720,
      height: 520,
      x: 360,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(resultSection);

    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-saved-as' })).toBeFalse();

    experimentStudioService.currentExperimentUUID.set('saved-experiment-uuid');

    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-saved-as' })).toBeFalse();

    resultSection.remove();

    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-saved-as' })).toBeTrue();
  });

  it('auto-advances after an algorithm is selected', () => {
    expect((component as any).shouldAutoAdvance({ requirement: 'algorithm-selected' })).toBeTrue();
  });

  it('auto-advances after the experiment result becomes available', () => {
    expect((component as any).shouldAutoAdvance({ requirement: 'experiment-result-ready' })).toBeTrue();
  });

  it('auto-advances after Save As opens the save form', () => {
    expect((component as any).shouldAutoAdvance({ requirement: 'save-as-opened' })).toBeTrue();
  });

  it('auto-advances after Save As creates a new experiment', () => {
    expect((component as any).shouldAutoAdvance({ requirement: 'experiment-saved-as' })).toBeTrue();
  });
});
