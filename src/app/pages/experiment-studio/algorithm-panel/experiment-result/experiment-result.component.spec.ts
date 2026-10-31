import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlgorithmRunService } from './algorithm-run.service';
import { ExperimentResultComponent } from './experiment-result.component';

@Component({
  imports: [ExperimentResultComponent],
  template: '<div app-experiment-result class="algorithm-run-bar" role="status"></div>',
})
class HostComponent {}

describe('ExperimentResultComponent', () => {
  const run = {
    canRun: signal(false),
    readinessText: signal('Select a method'),
    errorMsg: signal<string | null>(null),
  };

  beforeEach(() => {
    run.canRun.set(false);
    run.errorMsg.set(null);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection(), { provide: AlgorithmRunService, useValue: run }],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.algorithm-run-bar') as HTMLElement;
  }

  it('renders into the run bar and asks to finish the needs while the run is blocked', () => {
    const bar = render();

    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.classList.contains('is-ready')).toBe(false);
    expect(bar.querySelector('.algorithm-run-text')?.textContent).toContain('Select a method');
    expect(bar.querySelector('.algorithm-run-hint')).toBeTruthy();
  });

  it('marks the bar ready and shows the last error', () => {
    run.canRun.set(true);
    run.errorMsg.set('Failed to export the result tables.');
    const bar = render();

    expect(bar.classList.contains('is-ready')).toBe(true);
    expect(bar.querySelector('.algorithm-run-hint')).toBeNull();
    expect(bar.querySelector('.algorithm-run-error')?.textContent).toContain('Backend error: Failed to export the result tables.');
  });
});
