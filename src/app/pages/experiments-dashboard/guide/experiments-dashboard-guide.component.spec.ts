import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExperimentsDashboardGuideComponent } from './experiments-dashboard-guide.component';

describe('ExperimentsDashboardGuideComponent', () => {
  let component: ExperimentsDashboardGuideComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExperimentsDashboardGuideComponent],
      providers: [provideZonelessChangeDetection()],
    });

    component = TestBed.createComponent(ExperimentsDashboardGuideComponent).componentInstance;
  });

  afterEach(() => {
    document.querySelectorAll('[data-guide]').forEach((element) => element.remove());
  });

  it('keeps the highlight aligned when the target scrolls above the viewport', () => {
    const target = document.createElement('section');
    target.setAttribute('data-guide', 'dashboard-workspace');
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      top: -18,
      right: 680,
      bottom: 212,
      left: 48,
      width: 632,
      height: 230,
      x: 48,
      y: -18,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(target);

    component.activeSteps.set([
      {
        id: 'workspace',
        section: 'Explore',
        title: 'Experiment List',
        body: '',
        selector: '[data-guide="dashboard-workspace"]',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.highlightRect()).toEqual(jasmine.objectContaining({
      top: -28,
      left: 38,
      bottom: 222,
      right: 690,
    }));
  });
});
