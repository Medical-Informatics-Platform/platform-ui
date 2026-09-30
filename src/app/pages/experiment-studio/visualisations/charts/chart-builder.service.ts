import { Injectable, inject, signal } from '@angular/core';
import { AlgorithmChartRegistry } from './chart-registry';
import { ALPHA, MipChart } from './chart-theme';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
// @ts-expect-error echarts-gl ships no types for its CommonJS dist bundle
import * as echartsGl from 'echarts-gl/dist/echarts-gl.js';

function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((o, key) => o?.[key], obj);
}

function ensureEchartsGlRegistered(): void {
  // echarts-gl omits dist/ from sideEffects; keep a live reference so the
  // CommonJS bundle is evaluated and scatter3D/grid3D types register.
  if (echartsGl == null) {
    throw new Error('echarts-gl failed to load');
  }
}

@Injectable({ providedIn: 'root' })
export class ChartBuilderService {
  private experimentService = inject(ExperimentStudioService);

  /** App-level significance level (0.05 / 0.01 / 0.001); charts rebuild when it changes. */
  readonly alpha = signal(ALPHA);


  getChartsForAlgorithm(algorithm: string, result: any, _fallbackTitle?: string | null): MipChart[] {
    ensureEchartsGlRegistered();
    const config = AlgorithmChartRegistry[algorithm] || AlgorithmChartRegistry['default'];

    // raw input
    const input = getByPath(result, config.inputPath);

    // enrich with display names
    const enrichedInput = this.enrichLabels(input);

    // PCA specific enrichment: inject actual variable names for the heatmap
    if (algorithm === 'pca' || algorithm === 'pca_with_transformation') {
      const allSelected = this.experimentService.algorithmAssignableVariables();

      if (allSelected.length > 0) {
        // We use a unique property name to avoid collisions
        (enrichedInput as any).variable_names = allSelected.map(v => v.label || v.name || v.code);
      }
    }

    // SVM weights carry no names; they line up with the x covariates when the counts match.
    if (algorithm === 'linear_svm' && enrichedInput && typeof enrichedInput === 'object') {
      (enrichedInput as any).variable_names = this.experimentService.algorithmX().map(v => v.label || v.name || v.code);
    }

    if (algorithm === 'describe') {
      this.attachDescribeDatasetLabels(enrichedInput);
    }

    // Keep chart titles chart-specific. Experiment-level title is rendered in the result header.
    return config.build(enrichedInput, this.alpha());
  }

  private attachDescribeDatasetLabels(target: any): void {
    const map = this.experimentService.getDatasetLabelMap();
    if (!Object.keys(map).length || !target || typeof target !== 'object') return;

    if (target.result && typeof target.result === 'object') {
      (target.result as Record<string, unknown>)['dataset_labels'] = map;
      return;
    }

    target['dataset_labels'] = map;
  }

  private enrichLabels(input: any): any {
    if (!input) return input;

    const variables = this.experimentService.algorithmAssignableVariables();
    const filters = this.experimentService.selectedFilters();

    const findCode = (raw: string) => variables.find(v => v.code === raw) || filters.find(f => f.code === raw);
    const replaceLabel = (raw: string) => {
      const match = findCode(raw);
      return match?.name || match?.label || raw;
    };

    // If it's a string, try to replace it if it's a variable code
    if (typeof input === 'string') {
      return replaceLabel(input);
    }

    // If it's an object (but not null/array), process its entries
    if (typeof input === 'object' && !Array.isArray(input)) {
      // Keys are mapped only where variable codes are expected: a matrix keyed by the codes in its
      // `variables` array (Pearson), or an object keyed by codes alone (K-Means centres). Field names
      // elsewhere stay untouched even if a variable code happens to match one.
      const keys = Object.keys(input);
      const mapKeys = Array.isArray(input.variables) || (keys.length > 0 && keys.every(k => !!findCode(k)));
      const newObj: any = {};
      for (const [k, v] of Object.entries(input)) {
        newObj[mapKeys ? replaceLabel(k) : k] = this.enrichLabels(v);
      }
      return newObj;
    }

    // If it's an array, process its elements
    if (Array.isArray(input)) {
      return input.map(v => this.enrichLabels(v));
    }

    return input;
  }
}
