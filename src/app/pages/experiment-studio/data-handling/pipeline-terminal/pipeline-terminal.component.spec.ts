import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PipelineTerminalComponent } from './pipeline-terminal.component';

@Component({
  imports: [PipelineTerminalComponent],
  template: `<div app-pipeline-terminal
    [retention]="retention()" [variableCount]="3" [datasetCount]="2"
    [preprocessingLine]="'No preprocessing'" [showUnappliedWarning]="warn()"
    (continue)="log.push('continue')" (applyAndContinue)="log.push('apply')"
    (discardAndContinue)="log.push('discard')" (stay)="log.push('stay')"></div>`,
})
class HostComponent {
  readonly retention = signal<{ raw: number; processed: number } | null>({ raw: 1200, processed: 1000 });
  readonly warn = signal(false);
  readonly log: string[] = [];
}

describe('PipelineTerminalComponent', () => {
  async function render() {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('renders on the card element itself with the run summary', async () => {
    const { el } = await render();
    const card = el.querySelector('div.pipeline-terminal-card')!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('1,000 of 1,200 records');
    expect(card.textContent).toContain('3 variables · 2 datasets');
    expect(card.textContent).toContain('No preprocessing');
    expect(card.querySelector('.unapplied-warning-card')).toBeNull();
  });

  it('hides the records line until retention is known', async () => {
    const { fixture, host, el } = await render();
    host.retention.set(null);
    await fixture.whenStable();
    expect(el.textContent).not.toContain('records');
  });

  it('emits continue from the hand-off button', async () => {
    const { host, el } = await render();
    (el.querySelector('.pipeline-terminal-card > button.btn-finish-pipeline') as HTMLButtonElement).click();
    expect(host.log).toEqual(['continue']);
  });

  it('shows the unapplied-changes guard and emits each choice', async () => {
    const { fixture, host, el } = await render();
    host.warn.set(true);
    await fixture.whenStable();
    const buttons = el.querySelectorAll<HTMLButtonElement>('.unapplied-warning-actions button');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('You have unapplied changes');
    buttons.forEach((b) => b.click());
    expect(host.log).toEqual(['apply', 'discard', 'stay']);
  });
});
