import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  input,
  NgZone,
  OnDestroy,
  signal,
} from '@angular/core';
import { observeSize } from '../../../../core/observe-resize.util';
import { createHistogram, HistogramChartData, hasMaskedRemainder } from './histogram-chart';
import {
  DATASET_VARIABLE_CODE,
  HISTOGRAM_RESIDUAL_LABEL,
  HISTOGRAM_RESIDUAL_LEGEND_LABEL,
  histogramSeriesColor,
  histogramSeriesEdgeColor,
} from './histogram-data';

/** One split group as a show/hide chip above the chart. */
export interface HistogramGroupChip {
  key: string;
  /** Short visible text; dataset splits use the dataset code. */
  label: string;
  /** Full group name: accessible name and tooltip. */
  fullLabel: string;
  color: string;
  edge: string | null;
  hidden: boolean;
  /** The only group still shown; it cannot be hidden. */
  locked: boolean;
}

export interface HistogramGroupLegend {
  splitLabel: string;
  /** Plural noun for the status line: "datasets" or "groups". */
  noun: string;
  chips: HistogramGroupChip[];
  shownCount: number;
  masked: boolean;
}

export interface HistogramChartConfig {
  color?: string;
  orientation?: 'vertical' | 'horizontal';
  /** When false, keep privacy-null edge bins (Data Handling). Default trims them. */
  clipNullEdges?: boolean;
}

/** Matches the sibling D3 charts: redraw once the resizing has settled. */
const RESIZE_DEBOUNCE_MS = 150;

/** ResizeObserver floors a fractional width; clientWidth rounds it. */
const WIDTH_TOLERANCE_PX = 1;

@Component({
  selector: 'app-histogram',
  templateUrl: './histogram.component.html',
  styleUrl: './histogram.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistogramComponent implements OnDestroy {
  private elementRef = inject(ElementRef);
  private ngZone = inject(NgZone);
  private viewReady = false;

  readonly data = input<HistogramChartData | null>(null);
  readonly config = input<HistogramChartConfig>({});
  isLoading = false;

  /** Split groups switched off in the legend; cleared when the set of groups changes. */
  private readonly hiddenGroups = signal<ReadonlySet<string>>(new Set());
  private groupKeysSignature = '';

  readonly maskedLabel = HISTOGRAM_RESIDUAL_LEGEND_LABEL;
  readonly maskedTitle = HISTOGRAM_RESIDUAL_LABEL;

  /** Chips for a split vertical chart; null when there is nothing to filter. */
  readonly legend = computed<HistogramGroupLegend | null>(() => {
    const data = this.data();
    const groups = data?.groups;
    if (!data || !groups?.length || this.config().orientation === 'horizontal') return null;
    const hidden = this.hiddenGroups();
    const shownCount = groups.filter((group) => !hidden.has(group.key)).length;
    const byDataset = data.splitCode === DATASET_VARIABLE_CODE;
    return {
      splitLabel: data.splitLabel ?? 'Groups',
      noun: byDataset ? 'datasets' : 'groups',
      shownCount,
      masked: hasMaskedRemainder(data),
      chips: groups.map((group, index) => {
        const color = histogramSeriesColor(index);
        const isHidden = hidden.has(group.key);
        return {
          key: group.key,
          label: byDataset ? group.key : group.label,
          fullLabel: group.label,
          color,
          edge: histogramSeriesEdgeColor(color),
          hidden: isHidden,
          locked: !isHidden && shownCount <= 1,
        };
      }),
    };
  });

  /** What the drawing in the DOM was built from, and the width it was measured at. */
  private renderedData: HistogramChartData | null = null;
  private renderedConfigKey = '';
  private renderedWidth = 0;

  private stopObservingSize: (() => void) | undefined;

  constructor() {
    afterNextRender(() => {
      this.viewReady = true;
      this.renderHistogram();
      const container = this.chartContainer();
      if (container) {
        // Width only: the render writes an inline height, which would otherwise feed
        // this callback back to itself.
        this.stopObservingSize = observeSize(container, this.ngZone, RESIZE_DEBOUNCE_MS, (width) => {
          if (width === 0 || Math.abs(width - this.renderedWidth) <= WIDTH_TOLERANCE_PX) {
            return;
          }
          this.renderHistogram();
        });
      }
    });

    effect(() => {
      const signature = (this.data()?.groups ?? []).map((group) => group.key).join('\u0000');
      if (signature !== this.groupKeysSignature) {
        this.groupKeysSignature = signature;
        if (this.hiddenGroups().size) this.hiddenGroups.set(new Set());
      }
    });

    effect(() => {
      this.data();
      this.config();
      this.hiddenGroups();
      if (this.viewReady) {
        this.renderHistogram();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopObservingSize?.();
  }

  renderHistogram(): void {
    const data = this.data();
    if (!data || !data.bins || !data.counts) {
      return;
    }

    const container = this.chartContainer();
    if (!container) {
      console.error('Histogram container not found.');
      return;
    }

    const config = this.config();
    const hiddenGroups = this.hiddenGroups();
    const configKey = `${this.describeConfig(config)}|${[...hiddenGroups].join(',')}`;
    const isStale = data !== this.renderedData || configKey !== this.renderedConfigKey;
    // Layout width, not getBoundingClientRect: the tab-enter animation scales the
    // panel, and a scaled measurement disagrees with the observer's and redraws.
    const measuredWidth = container.clientWidth;

    // A Studio step hidden with `display: none` measures 0x0 and reports zeroed
    // getBBox() sizes, so drawing here would collapse the chart to a few pixels.
    // Keep the existing drawing; the observer redraws once the step is visible,
    // and forgetting the rendered width is what makes that redraw happen.
    if (measuredWidth === 0) {
      if (isStale) {
        this.renderedWidth = 0;
      }
      return;
    }

    if (!isStale && Math.abs(measuredWidth - this.renderedWidth) <= WIDTH_TOLERANCE_PX) {
      return;
    }

    createHistogram(data, container, { ...config, hiddenGroups });
    this.renderedData = data;
    this.renderedConfigKey = configKey;
    this.renderedWidth = measuredWidth;
  }

  /** Show or hide one split group; the last visible group cannot be hidden. */
  toggleGroup(key: string): void {
    const groups = this.data()?.groups ?? [];
    const next = new Set(this.hiddenGroups());
    if (next.has(key)) {
      next.delete(key);
    } else {
      if (groups.filter((group) => !next.has(group.key)).length <= 1) return;
      next.add(key);
    }
    this.hiddenGroups.set(next);
  }

  showAllGroups(): void {
    this.hiddenGroups.set(new Set());
  }

  chipTitle(chip: HistogramGroupChip, noun: string): string {
    if (chip.locked) return `${chip.fullLabel}: at least one of the ${noun} stays shown`;
    return chip.hidden ? `Show ${chip.fullLabel}` : `Hide ${chip.fullLabel} to compare the others`;
  }

  private chartContainer(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector('.histogram-plot');
  }

  private describeConfig(config: HistogramChartConfig): string {
    return [config.color, config.orientation, config.clipNullEdges === false ? 'full' : 'clip'].join('|');
  }
}
