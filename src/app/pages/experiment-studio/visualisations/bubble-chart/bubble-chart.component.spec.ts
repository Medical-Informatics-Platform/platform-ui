import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { BubbleChartComponent } from './bubble-chart.component';
import { ExperimentStudioGuideStateService } from '../../guide/experiment-studio-guide-state.service';

describe('BubbleChartComponent tutorial highlighting', () => {
  let fixture: ComponentFixture<BubbleChartComponent>;
  let component: BubbleChartComponent;
  let guideState: {
    activeStepId: ReturnType<typeof signal<string | null>>;
    expectedTutorialCovariate: ReturnType<typeof signal<string | null>>;
    matchesTutorialCovariate: (node: any, expected?: string | null) => boolean;
  };

  const setInputs = (inputs: Record<string, unknown>): void => {
    Object.entries(inputs).forEach(([name, value]) => {
      fixture.componentRef.setInput(name, value);
    });
    fixture.detectChanges();
  };

  beforeEach(async () => {
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

    await TestBed.configureTestingModule({
      imports: [BubbleChartComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioGuideStateService, useValue: guideState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BubbleChartComponent);
    component = fixture.componentInstance;
    setInputs({
      d3Data: {
        label: 'root',
        children: [
          {
            label: 'Demographics',
            children: [
              { code: 'sex', label: 'Sex', type: 'nominal', value: 1 },
              { code: 'age_value', label: 'Age', type: 'continuous', value: 1 },
            ],
          },
        ],
      },
    });
  });

  it('returns the highlighted tutorial node code when the guide target is still pending', () => {
    expect((component as any).getPendingTutorialHighlightCode()).toBe('sex');
  });

  it('removes the tutorial highlight once the target is added to the pool', () => {
    guideState.activeStepId.set('add-sex-covariate');
    setInputs({ selectedVariables: [{ code: 'sex', label: 'Sex', type: 'nominal' }] });

    expect((component as any).getPendingTutorialHighlightCode()).toBeNull();
  });

  it('keeps Age highlighted until it is added to Variables for the Age add step', () => {
    guideState.activeStepId.set('add-age-variable');
    guideState.expectedTutorialCovariate.set('age');

    expect((component as any).getPendingTutorialHighlightCode()).toBe('age_value');

    setInputs({ selectedVariables: [{ code: 'age_value', label: 'Age', type: 'continuous' }] });

    expect((component as any).getPendingTutorialHighlightCode()).toBeNull();
  });

  it('always shows every legend state and the map hint', () => {
    const legend = fixture.nativeElement.querySelector('.map-legend') as HTMLElement;

    expect(legend.textContent).toContain('Group');
    expect(legend.textContent).toContain('Available');
    expect(legend.textContent).toContain('In pool');
    expect(legend.textContent).toContain('Selected');
    expect(fixture.nativeElement.querySelector('.map-legend-swatch.selected')).not.toBeNull();

    setInputs({ selectedVariables: [{ code: 'age_value', label: 'Age', type: 'continuous' }] });

    expect(legend.textContent).toContain('In pool');

    const hint = fixture.nativeElement.querySelector('.map-hint') as HTMLElement;
    expect(hint.textContent).toContain('double-click to add');
  });

  it('reads the selection fill from --primary-color instead of a fixed slate', async () => {
    guideState.expectedTutorialCovariate.set(null);
    document.documentElement.style.setProperty('--primary-color', '#0044aa');
    document.documentElement.style.setProperty('--primary-dark', '#002266');

    try {
      const tokenFixture = TestBed.createComponent(BubbleChartComponent);
      tokenFixture.componentRef.setInput('d3Data', {
        label: 'root',
        children: [{
          label: 'Demographics',
          children: [
            { code: 'sex', label: 'Sex', type: 'text', value: 1 },
            { code: 'age_value', label: 'Age', type: 'real', value: 1 },
          ],
        }],
      });
      tokenFixture.detectChanges();

      const leaf = (Array.from(tokenFixture.nativeElement.querySelectorAll('circle.leaf')) as SVGCircleElement[])
        .find((circle) => (circle as any).__data__?.data?.code === 'age_value')!;

      leaf.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise<void>((resolve) => window.setTimeout(resolve, 300));

      // d3's fill transition writes the end value in rgb() form.
      const normalizedColor = (value: string): string => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.appendChild(probe);
        const computed = getComputedStyle(probe).color;
        probe.remove();
        return computed;
      };
      expect(normalizedColor(leaf.getAttribute('fill')!)).toBe('rgb(0, 68, 170)'); // #0044aa
      expect(normalizedColor(leaf.getAttribute('stroke')!)).toBe('rgb(0, 34, 102)'); // #002266
    } finally {
      document.documentElement.style.removeProperty('--primary-color');
      document.documentElement.style.removeProperty('--primary-dark');
    }
  });
});
