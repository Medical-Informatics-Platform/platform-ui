import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { BubbleChartComponent } from './bubble-chart.component';
import { ExperimentStudioGuideStateService } from '../../guide/experiment-studio-guide-state.service';

describe('BubbleChartComponent location trail', () => {
  let fixture: ComponentFixture<BubbleChartComponent>;

  const crumbs = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.map-trail .map-trail-crumb'));
  const crumbLabels = (): string[] => crumbs().map((crumb) => crumb.textContent?.trim() ?? '');

  /** Waits for the zoom animation: polls until the trail reads as expected. */
  const waitForTrail = async (expected: string[]): Promise<void> => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      fixture.detectChanges();
      if (JSON.stringify(crumbLabels()) === JSON.stringify(expected)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(crumbLabels()).toEqual(expected);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BubbleChartComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ExperimentStudioGuideStateService,
          useValue: {
            activeStepId: signal<string | null>(null),
            expectedTutorialCovariate: signal<string | null>(null),
            matchesTutorialCovariate: () => false,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BubbleChartComponent);
    fixture.componentRef.setInput('d3Data', {
      label: 'IST',
      code: 'ist',
      children: [
        {
          label: 'Demographics',
          children: [
            { code: 'sex', label: 'Sex', type: 'text' },
            { code: 'age_value', label: 'Age', type: 'real' },
          ],
        },
        {
          label: 'Outcome',
          children: [{ code: 'dead', label: 'Dead', type: 'text' }],
        },
      ],
    });
    fixture.detectChanges();
  });

  it('starts with the data model as the only, current location', async () => {
    await waitForTrail(['IST']);

    const trail = fixture.nativeElement.querySelector('.map-trail') as HTMLElement;
    expect(trail.getAttribute('aria-label')).toBe('Map location');
    expect(crumbs()[0].getAttribute('aria-current')).toBe('location');
    expect(crumbs()[0].disabled).toBe(true);
  });

  it('adds the group to the trail after zooming into it', async () => {
    await waitForTrail(['IST']);
    const groups = Array.from(fixture.nativeElement.querySelectorAll('circle.group')) as SVGCircleElement[];
    const demographics = groups.find((circle) => (circle as any).__data__?.data?.label === 'Demographics')!;

    demographics.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitForTrail(['IST', 'Demographics']);
    expect(crumbs()[0].disabled).toBe(false);
    expect(crumbs()[0].getAttribute('aria-current')).toBeNull();
    expect(crumbs()[1].getAttribute('aria-current')).toBe('location');
  });

  it('zooms back out when an earlier crumb is clicked', async () => {
    await waitForTrail(['IST']);
    const groups = Array.from(fixture.nativeElement.querySelectorAll('circle.group')) as SVGCircleElement[];
    groups[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForTrail(['IST', (groups[0] as any).__data__.data.label]);

    crumbs()[0].click();

    await waitForTrail(['IST']);
  });
});
