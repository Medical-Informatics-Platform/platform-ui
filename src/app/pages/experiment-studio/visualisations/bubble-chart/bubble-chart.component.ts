import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  effect,
  inject,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  signal,
  output,
  input
} from '@angular/core';
import { createZoomableCirclePacking, DEFAULT_BUBBLE_COLORS } from './zoomable-circle-packing';
import { ExperimentStudioGuideStateService } from '../../guide/experiment-studio-guide-state.service';

@Component({
  selector: 'app-bubble-chart',
  templateUrl: './bubble-chart.component.html',
  styleUrl: './bubble-chart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class BubbleChartComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  private elementRef = inject(ElementRef);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  private readonly guideState = inject(ExperimentStudioGuideStateService);
  private readonly tutorialHighlightColor = '#DFEFE4';

  readonly d3Data = input<any | null>(null);
  readonly highlightNode = input<any | null>(null);
  readonly selectedVariables = input<any[]>([]);
  readonly selectedFilters = input<any[]>([]);
  readonly bubbleColors = input<Partial<{
    variable: string;
    covariate: string;
    filter: string;
    selected: string;
    groupStart: string;
    groupEnd: string;
}>>();

  readonly selectedNodeChange = output<any>();
  readonly nodeDoubleClicked = output<any>();
  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLElement>;

  private lastHighlighted: any = null;
  private zoomToNodeFn!: (d: any) => void;
  private viewReady = false;
  private refreshColorsFn!: (options?: {
    selectedVariables?: any[];
    selectedFilters?: any[];
    colors?: Partial<BubbleChartComponent['colors']>;
  }) => void;
  private destroyFn?: () => void;
  private resizeObserver?: ResizeObserver;
  private resizeRaf = 0;
  private resizeDebounce: any = 0;
  private lastSize = { width: 0, height: 0 };
  private isAnimating = false;


  readonly error = signal<string | null>(null); // Holds the current error message
  readonly COLORBLIND_PALETTE = { ...DEFAULT_BUBBLE_COLORS };

  colors: {
    variable: string;
    covariate: string;
    filter: string;
    selected: string;
    groupStart: string;
    groupEnd: string;
  } = { ...this.COLORBLIND_PALETTE };

  constructor() {
    effect(() => {
      this.guideState.activeStepId();
      this.guideState.expectedTutorialCovariate();

      if (!this.refreshColorsFn) {
        return;
      }

      this.refreshColorsFn(this.buildRefreshOptions());
    });
  }

  ngOnInit(): void {
    this.renderChart();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    const canvas = this.chartCanvas?.nativeElement;

    // Initialize lastSize BEFORE starting the observer to prevent immediate double-render
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      this.lastSize = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
    }

    this.renderChart();

    if (canvas && typeof ResizeObserver !== 'undefined') {
      this.ngZone.runOutsideAngular(() => {
        this.resizeObserver = new ResizeObserver(entries => {
          const entry = entries[0];
          if (!entry) return;

          const { width, height } = entry.contentRect;
          const roundedW = Math.floor(width);
          const roundedH = Math.floor(height);

          if (roundedW === this.lastSize.width && roundedH === this.lastSize.height) return;
          if (this.isAnimating) return;
          if (roundedW === 0 || roundedH === 0) return;

          this.lastSize = { width: roundedW, height: roundedH };

          // Debounce: wait until resizing stops before re-rendering
          clearTimeout(this.resizeDebounce);
          this.resizeDebounce = setTimeout(() => {
            this.ngZone.run(() => this.renderChart());
          }, 150);
        });
        this.resizeObserver.observe(canvas);
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['bubbleColors']?.currentValue) {
      this.colors = { ...this.colors, ...changes['bubbleColors'].currentValue };
      this.refreshColorsFn?.({ colors: this.colors });
    }

    if (changes['d3Data'] && changes['d3Data'].currentValue) {
      this.renderChart();
    }

    if (changes['highlightNode']?.currentValue && this.zoomToNodeFn) {
      const highlightNode = this.highlightNode();
      if (!this.lastHighlighted || this.lastHighlighted.code !== highlightNode.code) {
        this.zoomToNodeFn(highlightNode);
        this.lastHighlighted = highlightNode;
      }
    }

    if (
      (changes['selectedVariables'] || changes['selectedFilters']) &&
      this.refreshColorsFn
    ) {
      this.refreshColorsFn(this.buildRefreshOptions());
    }
  }

  ngOnDestroy(): void {
    this.destroyFn?.();
    this.resizeObserver?.disconnect();
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    clearTimeout(this.resizeDebounce);
  }

  renderChart(): void {
    if (!this.viewReady) return;
    const container = this.chartCanvas?.nativeElement
      ?? this.elementRef.nativeElement.querySelector('#chart-canvas');
    if (!container) return;

    if (!this.d3Data()) {
      this.error.set('No data available for visualization.');
      this.cdr.markForCheck();
      return;
    }
    this.error.set(null);
    this.cdr.markForCheck();

    // Clean up previous chart if exists (e.g. tooltip)
    this.destroyFn?.();

    const { zoomToNode, refreshColors, destroy } = createZoomableCirclePacking(
      this.d3Data(),
      container,
      node => this.selectedNodeChange.emit(node),
      node => this.nodeDoubleClicked.emit(node),
      {
        ...this.buildRefreshOptions(),
        onAnimationStart: () => this.isAnimating = true,
        onAnimationEnd: () => this.isAnimating = false,
      }
    );
    this.zoomToNodeFn = zoomToNode;
    this.refreshColorsFn = refreshColors;
    this.destroyFn = destroy;


    // apply pending highlight after chart is created
    const highlightNode = this.highlightNode();
    if (highlightNode?.code) {
      this.zoomToNodeFn(highlightNode);
      this.lastHighlighted = highlightNode;
    }

  }

  private buildRefreshOptions(): {
    selectedVariables: any[];
    selectedFilters: any[];
    colors: {
      variable: string;
      covariate: string;
      filter: string;
      selected: string;
      groupStart: string;
      groupEnd: string;
    };
    tutorialHighlightCode: string | null;
    tutorialHighlightColor: string;
  } {
    return {
      selectedVariables: this.selectedVariables(),
      selectedFilters: this.selectedFilters(),
      colors: this.colors,
      tutorialHighlightCode: this.getPendingTutorialHighlightCode(),
      tutorialHighlightColor: this.tutorialHighlightColor,
    };
  }

  private getPendingTutorialHighlightCode(): string | null {
    const expected = this.guideState.expectedTutorialCovariate();
    if (!expected || this.isTutorialStepSatisfied(expected)) {
      return null;
    }

    return this.findTutorialHighlightCode(this.d3Data(), expected);
  }

  private isTutorialStepSatisfied(expected: string): boolean {
    switch (this.guideState.activeStepId()) {
      case 'select-sex-variable':
      case 'select-age-variable':
        return this.guideState.matchesTutorialCovariate(this.highlightNode(), expected);
      case 'add-sex-covariate':
        return this.selectedVariables().some((node) => this.guideState.matchesTutorialCovariate(node, expected));
      case 'add-age-variable':
        return this.selectedVariables().some((node) => this.guideState.matchesTutorialCovariate(node, expected));
      default:
        return false;
    }
  }

  private findTutorialHighlightCode(node: any, expected: string): string | null {
    if (!node) {
      return null;
    }

    if (!node.children?.length && this.guideState.matchesTutorialCovariate(node, expected)) {
      return this.getNodeCode(node);
    }

    for (const child of node.children ?? []) {
      const match = this.findTutorialHighlightCode(child, expected);
      if (match) {
        return match;
      }
    }

    return null;
  }

  private getNodeCode(node: any): string | null {
    const raw = node?.code ?? node?.uniqueId ?? node?.id ?? node?.label ?? null;
    return raw == null ? null : String(raw);
  }
}
