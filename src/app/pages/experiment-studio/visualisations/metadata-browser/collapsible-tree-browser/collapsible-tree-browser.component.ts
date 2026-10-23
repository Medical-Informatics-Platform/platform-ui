import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Injector,
  NgZone,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { observeSize } from '../../../../../core/observe-resize.util';
import {
  EMPTY_UNAVAILABLE_VARIABLES,
  UnavailableVariablesMap,
} from '../../../../../core/variable-availability.utils';
import { foldPath } from '../metadata-browser-normalizer';
import {
  CollapsibleTreeRenderer,
  createCollapsibleTree,
} from './collapsible-tree-renderer';

const EMPTY_TREE: D3HierarchyNode = {
  label: 'Data model',
  code: 'data-model',
  children: [],
};

@Component({
  selector: 'app-collapsible-tree-browser',
  templateUrl: './collapsible-tree-browser.component.html',
  styleUrl: './collapsible-tree-browser.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollapsibleTreeBrowserComponent implements AfterViewInit, OnDestroy {
  readonly data = input<D3HierarchyNode | null>(null);
  readonly highlightNode = input<D3HierarchyNode | null>(null);
  readonly selectedVariables = input<D3HierarchyNode[]>([]);
  readonly unavailableVariables = input<UnavailableVariablesMap>(EMPTY_UNAVAILABLE_VARIABLES);
  readonly selectedNodeChange = output<D3HierarchyNode>();
  readonly nodeDoubleClicked = output<D3HierarchyNode>();

  readonly chartCanvas = viewChild<ElementRef<HTMLElement>>('chartCanvas');
  readonly breadcrumb = viewChild<ElementRef<HTMLElement>>('breadcrumb');
  readonly error = signal<string | null>(null);
  /** Open groups from the root down, mirrored from the renderer for the breadcrumb. */
  readonly path = signal<D3HierarchyNode[]>([]);
  readonly showFullPath = signal(false);
  readonly crumbs = computed(() => foldPath(this.path(), 3, this.showFullPath()));
  readonly foldedCrumbsTitle = computed(() => this.crumbs().folded.map((node) => node.label).join(' › '));

  private readonly ngZone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private renderer: CollapsibleTreeRenderer | null = null;
  private stopObservingSize: (() => void) | undefined;
  private viewReady = false;
  private lastDataRef: D3HierarchyNode | null = null;
  private skipNextHighlightExpand = false;
  /** Size the drawing in the DOM was measured at; zero while its step is hidden. */
  private renderedSize = { width: 0, height: 0 };

  constructor() {
    effect(() => {
      const data = this.data();
      if (!this.viewReady) return;
      if (data !== this.lastDataRef) {
        this.render();
      }
    });

    // Separate from the selection effect so a dataset change regrays nodes without recentering.
    effect(() => {
      const unavailable = this.unavailableVariables();
      this.renderer?.setUnavailableVariables(unavailable);
    });

    effect(() => {
      const highlightNode = this.highlightNode();
      const renderer = this.renderer;
      if (!renderer) return;
      renderer.refreshSelection({
        selectedVariables: this.selectedVariables(),
        highlightNode,
      });
      if (highlightNode) {
        if (this.skipNextHighlightExpand) {
          this.skipNextHighlightExpand = false;
          return;
        }
        renderer.expandToNode(highlightNode);
      }
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
    const canvas = this.chartCanvas()?.nativeElement;
    if (!canvas) return;

    this.stopObservingSize = observeSize(canvas, this.ngZone, 120, (width, height) => {
      // Zero size is the step being hidden - never a size worth drawing for.
      if (width === 0 || height === 0) return;
      // Compared against the last actual draw, so a tree built while the step was
      // hidden is re-laid-out when the step comes back.
      if (width === this.renderedSize.width && height === this.renderedSize.height) return;

      this.renderer?.resize();
      this.rememberRenderedSize();
    });
  }

  ngOnDestroy(): void {
    this.renderer?.destroy();
    this.stopObservingSize?.();
  }

  focusCrumb(node: D3HierarchyNode): void {
    this.renderer?.focusNode(node);
  }

  zoomIn(): void {
    this.renderer?.zoomBy(1.25);
  }

  zoomOut(): void {
    this.renderer?.zoomBy(0.8);
  }

  fitView(): void {
    this.renderer?.fitView();
  }

  collapseAll(): void {
    this.renderer?.collapseAll();
  }

  /** Keeps the deepest crumb in view when the path outgrows the bar. */
  private showPath(path: D3HierarchyNode[]): void {
    this.path.set(path);
    this.showFullPath.set(false);
    afterNextRender(() => {
      const bar = this.breadcrumb()?.nativeElement;
      if (bar) bar.scrollLeft = bar.scrollWidth;
    }, { injector: this.injector });
  }

  /** Records the box the drawing that follows was measured against. */
  private rememberRenderedSize(): void {
    const rect = this.chartCanvas()?.nativeElement?.getBoundingClientRect();
    this.renderedSize = rect
      ? { width: Math.floor(rect.width), height: Math.floor(rect.height) }
      : { width: 0, height: 0 };
  }

  private render(): void {
    const canvas = this.chartCanvas()?.nativeElement;
    if (!canvas) return;

    const data = this.data() ?? EMPTY_TREE;
    this.lastDataRef = data;
    this.renderer?.destroy();
    this.renderer = null;

    if (!data.children?.length) {
      this.error.set('No metadata available for visualization.');
      this.cdr.markForCheck();
      return;
    }

    this.error.set(null);
    this.rememberRenderedSize();
    this.renderer = createCollapsibleTree(data, canvas, {
      selectedVariables: this.selectedVariables(),
      highlightNode: this.highlightNode(),
      unavailableVariables: this.unavailableVariables(),
      onNodeClick: (node) => {
        // This selection originates from the renderer itself; avoid immediately
        // replaying expandToNode through the highlight effect.
        this.skipNextHighlightExpand = true;
        this.selectedNodeChange.emit(node);
        this.cdr.markForCheck();
      },
      onNodeDoubleClick: (node) => {
        this.nodeDoubleClicked.emit(node);
        this.cdr.markForCheck();
      },
      onPathChange: (path) => this.showPath(path),
    });
    this.cdr.markForCheck();
  }
}
