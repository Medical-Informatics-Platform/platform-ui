import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
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
  readonly selectedNodeChange = output<D3HierarchyNode>();
  readonly nodeDoubleClicked = output<D3HierarchyNode>();

  readonly chartCanvas = viewChild<ElementRef<HTMLElement>>('chartCanvas');
  readonly error = signal<string | null>(null);

  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private renderer: CollapsibleTreeRenderer | null = null;
  private resizeObserver?: ResizeObserver;
  private resizeTimer = 0;
  private viewReady = false;
  private lastDataRef: D3HierarchyNode | null = null;
  private skipNextHighlightExpand = false;
  private lastSize = { width: 0, height: 0 };

  constructor() {
    effect(() => {
      const data = this.data();
      if (!this.viewReady) return;
      if (data !== this.lastDataRef) {
        this.render();
      }
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
    if (!canvas || typeof ResizeObserver === 'undefined') return;

    // Initialize lastSize before observing to prevent the observer's initial
    // callback from triggering a second full rebuild of the tree.
    const rect = canvas.getBoundingClientRect();
    this.lastSize = { width: Math.floor(rect.width), height: Math.floor(rect.height) };

    this.ngZone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;

        const roundedW = Math.floor(entry.contentRect.width);
        const roundedH = Math.floor(entry.contentRect.height);
        if (roundedW === this.lastSize.width && roundedH === this.lastSize.height) return;
        if (roundedW === 0 || roundedH === 0) return;

        this.lastSize = { width: roundedW, height: roundedH };
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => {
          this.ngZone.run(() => this.renderer?.resize());
        }, 120);
      });
      this.resizeObserver.observe(canvas);
    });
  }

  ngOnDestroy(): void {
    this.renderer?.destroy();
    this.resizeObserver?.disconnect();
    window.clearTimeout(this.resizeTimer);
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
    this.renderer = createCollapsibleTree(data, canvas, {
      selectedVariables: this.selectedVariables(),
      highlightNode: this.highlightNode(),
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
    });
    this.cdr.markForCheck();
  }
}
