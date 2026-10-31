import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SectionKey } from './data-handling.models';
import { SectionAnchorDirective, SectionAnchors } from './section-anchors';

@Component({
  imports: [SectionAnchorDirective],
  providers: [SectionAnchors],
  template: `@if (shown()) {<div id="target" [dhSectionAnchor]="section()"></div>}`,
})
class HostComponent {
  readonly shown = signal(true);
  readonly section = signal<SectionKey>('raw');
}

describe('SectionAnchorDirective', () => {
  it('registers its element for the section, follows changes and leaves no attribute', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const anchors = fixture.debugElement.injector.get(SectionAnchors);
    const el = (fixture.nativeElement as HTMLElement).querySelector('#target')!;
    expect(anchors.get('raw')?.nativeElement).toBe(el);
    expect(el.getAttributeNames().some((n) => n.toLowerCase().includes('anchor'))).toBe(false);

    fixture.componentInstance.section.set('processed');
    fixture.detectChanges();
    expect(anchors.get('raw')).toBeUndefined();
    expect(anchors.get('processed')?.nativeElement).toBe(el);

    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();
    expect(anchors.get('processed')).toBeUndefined();
  });
});
