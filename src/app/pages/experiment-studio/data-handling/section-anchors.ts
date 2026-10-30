import { Directive, ElementRef, Injectable, OnChanges, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { SectionKey } from './data-handling.models';

/**
 * The element `goToSection` scrolls to for each pipeline section, and the scrolling itself.
 * Provided by the Data Handling panel; elements register themselves through
 * SectionAnchorDirective wherever they are rendered (the panel or one of its station
 * components).
 */
@Injectable()
export class SectionAnchors {
  private readonly anchors = new Map<SectionKey, ElementRef<HTMLElement>>();
  private readonly request = signal<{ section: SectionKey; id: number } | null>(null);
  private lastRequestId = 0;

  constructor() {
    // The section is measured only after the template has reacted to whatever just opened or
    // closed, so a request waits for the render that follows it. A newer request replaces it.
    effect(() => {
      const request = this.request();
      if (!request) return;

      setTimeout(() => {
        if (this.request()?.id !== request.id) return;
        this.scrollIntoView(request.section);
        if (this.request()?.id === request.id) this.request.set(null);
      });
    });
  }

  /**
   * Scrolls to the section once the page has settled. A request, not a call (see the constructor).
   * Shared by goToSection and the stations' Close action, which folds an editor away and must
   * not leave the viewport stranded.
   */
  requestScroll(section: SectionKey): void {
    this.request.set({ section, id: ++this.lastRequestId });
  }

  private scrollIntoView(section: SectionKey): void {
    const element = this.anchors.get(section)?.nativeElement;
    if (!element) return;

    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  set(section: SectionKey, element: ElementRef<HTMLElement>): void {
    this.anchors.set(section, element);
  }

  delete(section: SectionKey, element: ElementRef<HTMLElement>): void {
    if (this.anchors.get(section) === element) this.anchors.delete(section);
  }

  get(section: SectionKey): ElementRef<HTMLElement> | undefined {
    return this.anchors.get(section);
  }
}

/** Marks its element as the scroll target of a pipeline section. Bind it as a property
 *  (`[dhSectionAnchor]="'raw'"`) so no attribute is added to the DOM. */
@Directive({ selector: '[dhSectionAnchor]' })
export class SectionAnchorDirective implements OnChanges, OnDestroy {
  readonly dhSectionAnchor = input.required<SectionKey>();

  private readonly anchors = inject(SectionAnchors);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private section: SectionKey | null = null;

  ngOnChanges(): void {
    if (this.section) this.anchors.delete(this.section, this.element);
    this.section = this.dhSectionAnchor();
    this.anchors.set(this.section, this.element);
  }

  ngOnDestroy(): void {
    if (this.section) this.anchors.delete(this.section, this.element);
  }
}
