import { Directive, ElementRef, Injectable, OnChanges, OnDestroy, inject, input } from '@angular/core';
import { SectionKey } from './data-handling.models';

/**
 * The element `goToSection` scrolls to for each pipeline section. Provided by the Data
 * Handling panel; elements register themselves through SectionAnchorDirective wherever
 * they are rendered (the panel or one of its station components).
 */
@Injectable()
export class SectionAnchors {
  private readonly anchors = new Map<SectionKey, ElementRef<HTMLElement>>();

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
