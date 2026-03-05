import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createZoomableCirclePacking } from './zoomable-circle-packing';

@Component({
  selector: 'app-bubble-chart',
  templateUrl: './bubble-chart.component.html',
  styleUrls: ['./bubble-chart.component.css'],
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class BubbleChartComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() d3Data: any;
  @Input() highlightNode: any | null = null;
  @Input() selectedVariables: any[] = [];
  @Input() selectedCovariates: any[] = [];
  @Input() selectedFilters: any[] = [];
  @Input() bubbleColors?: Partial<{
    variable: string;
    covariate: string;
    filter: string;
    selected: string;
    groupStart: string;
    groupEnd: string;
  }>;

  @Output() selectedNodeChange = new EventEmitter<any>();
  @Output() nodeDoubleClicked = new EventEmitter<any>();
  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLElement>;

  private lastHighlighted: any = null;
  private zoomToNodeFn!: (d: any) => void;
  private viewReady = false;
  private refreshColorsFn!: (options?: {
    selectedVariables?: any[];
    selectedCovariates?: any[];
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
  readonly DEFAULT_PALETTE = {
    variable: '#2b33e9',     // Brand Blue (--variable-color)
    covariate: '#ccb692',    // Muted Sand (--covariate-color)
    filter: '#94a3b8',       // Muted Slate (--filter-color)
    selected: '#1b21a3',     // Brand Blue darker
    groupStart: '#dfefe4',   // Light green for groups
    groupEnd: '#2b33e9',     // Brand Blue for groups
  };

  readonly COLORBLIND_PALETTE = {
    variable: '#ffba08',     // MIP golden yellow (from portal-frontend)
    covariate: '#bba66f',    // MIP tan/beige (from portal-frontend)
    filter: '#483300',       // MIP dark brown (from portal-frontend)
    selected: '#3f6078',     // MIP steel blue (from portal-frontend)
    groupStart: '#c8d5f0',   // Light pale blue (from portal-frontend)
    groupEnd: '#3340e8',     // Deep blue (from portal-frontend)
  };

  colorMode: 'default' | 'colorBlind' | 'custom' = 'default';

  colors: {
    variable: string;
    covariate: string;
    filter: string;
    selected: string;
    groupStart: string;
    groupEnd: string;
  } = { ...this.DEFAULT_PALETTE };

  readonly showSettings = signal(false);

  toggleSettings(): void {
    this.showSettings.update((open) => !open);
  }

  applyColorMode(mode: 'default' | 'colorBlind' | 'custom'): void {
    this.colorMode = mode;
    if (mode === 'default') {
      this.colors = { ...this.DEFAULT_PALETTE };
      document.body.classList.remove('colorblind-mode');
    } else if (mode === 'colorBlind') {
      this.colors = { ...this.COLORBLIND_PALETTE };
      document.body.classList.add('colorblind-mode');
    } else {
      document.body.classList.remove('colorblind-mode');
    }
    this.saveSettings();
    this.onColorChange();
  }

  private readonly STORAGE_KEY = 'bubble_chart_colors';

  private saveSettings(): void {
    const settings = {
      mode: this.colorMode,
      colors: this.colors
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
  }

  private loadSettings(): void {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        if (settings.mode) {
          this.colorMode = settings.mode;
          // Apply colorblind class if mode was saved as colorBlind
          if (settings.mode === 'colorBlind') {
            document.body.classList.add('colorblind-mode');
          } else {
            document.body.classList.remove('colorblind-mode');
          }
        }
        if (settings.colors) this.colors = { ...settings.colors };
      } catch (e) {
        console.error('Failed to load chart settings', e);
      }
    }
  }

  constructor(
    private elementRef: ElementRef,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadSettings();
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
      if (!this.lastHighlighted || this.lastHighlighted.code !== this.highlightNode.code) {
        this.zoomToNodeFn(this.highlightNode);
        this.lastHighlighted = this.highlightNode;
      }
    }

    if (
      (changes['selectedVariables'] ||
        changes['selectedCovariates'] ||
        changes['selectedFilters']) &&
      this.refreshColorsFn
    ) {
      this.refreshColorsFn({
        selectedVariables: this.selectedVariables,
        selectedCovariates: this.selectedCovariates,
        selectedFilters: this.selectedFilters,
        colors: this.colors,
      });
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

    if (!this.d3Data) {
      this.error.set('No data available for visualization.');
      this.cdr.markForCheck();
      return;
    }
    this.error.set(null);
    this.cdr.markForCheck();

    // Clean up previous chart if exists (e.g. tooltip)
    this.destroyFn?.();

    const { zoomToNode, refreshColors, destroy } = createZoomableCirclePacking(
      this.d3Data,
      container,
      node => this.selectedNodeChange.emit(node),
      node => this.nodeDoubleClicked.emit(node),
      {
        selectedVariables: this.selectedVariables,
        selectedCovariates: this.selectedCovariates,
        selectedFilters: this.selectedFilters,
        colors: this.colors,
        onAnimationStart: () => this.isAnimating = true,
        onAnimationEnd: () => this.isAnimating = false,
      }
    );
    this.zoomToNodeFn = zoomToNode;
    this.refreshColorsFn = refreshColors;
    this.destroyFn = destroy;


    // apply pending highlight after chart is created
    if (this.highlightNode?.code) {
      this.zoomToNodeFn(this.highlightNode);
      this.lastHighlighted = this.highlightNode;
    }

  }

  public updateSelectionColors(): void {
    if (!this.zoomToNodeFn) return;
    this.renderChart(); // re-render to update fills
  }

  onNodeClick(node: any): void {
    this.selectedNodeChange.emit(node);
  }

  public zoomToNode(variable: any): void {
    if (this.zoomToNodeFn) {
      this.zoomToNodeFn(variable);
    } else {
      console.warn('zoomToNodeFn not ready yet, retrying...');
      setTimeout(() => {
        if (this.zoomToNodeFn) {
          this.zoomToNodeFn(variable);
        }
      }, 15);
    }
  }

  public refreshColors(newOptions?: {
    selectedVariables?: any[];
    selectedCovariates?: any[];
    selectedFilters?: any[];
  }): void {
    if (this.refreshColorsFn) {
      this.refreshColorsFn(newOptions ?? {
        selectedVariables: this.selectedVariables,
        selectedCovariates: this.selectedCovariates,
        selectedFilters: this.selectedFilters,
        colors: this.colors,
      });
    } else {
      console.warn('refreshColorsFn not ready yet.');
    }
  }

  onColorChange(): void {
    if (this.refreshColorsFn) {
      this.refreshColorsFn({
        selectedVariables: this.selectedVariables,
        selectedCovariates: this.selectedCovariates,
        selectedFilters: this.selectedFilters,
        colors: this.colors,
      });
    }
    this.saveSettings();
  }
}
