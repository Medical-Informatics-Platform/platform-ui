import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
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

describe('SectionAnchors scroll requests', () => {
  const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await nextFrame();
  };

  afterEach(() => vi.restoreAllMocks());

  it('scrolls the registered element into view once the page has settled, and not before', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockReturnValue(undefined);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const anchors = fixture.debugElement.injector.get(SectionAnchors);

    anchors.requestScroll('raw');
    expect(scroll).not.toHaveBeenCalled();
    await settle(fixture);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe((fixture.nativeElement as HTMLElement).querySelector('#target'));
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('lets a newer request replace one that has not run yet', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockReturnValue(undefined);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const anchors = fixture.debugElement.injector.get(SectionAnchors);

    anchors.requestScroll('processed');
    anchors.requestScroll('raw');
    await settle(fixture);

    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a section no element has registered', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockReturnValue(undefined);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    fixture.debugElement.injector.get(SectionAnchors).requestScroll('transformation');
    await settle(fixture);

    expect(scroll).not.toHaveBeenCalled();
  });
});
