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
  readonly selectedCovariates = input<D3HierarchyNode[]>([]);
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
        selectedCovariates: this.selectedCovariates(),
        highlightNode,
      });
      if (highlightNode) {
        renderer.expandToNode(highlightNode);
      }
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
    const canvas = this.chartCanvas()?.nativeElement;
    if (!canvas || typeof ResizeObserver === 'undefined') return;

    this.ngZone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => {
          this.ngZone.run(() => this.render());
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
      selectedCovariates: this.selectedCovariates(),
      highlightNode: this.highlightNode(),
      onNodeClick: (node) => {
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
