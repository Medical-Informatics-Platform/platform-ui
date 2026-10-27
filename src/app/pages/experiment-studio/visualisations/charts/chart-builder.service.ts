import { Injectable, inject } from '@angular/core';
import { EChartsOption } from 'echarts';
import { AlgorithmChartRegistry } from './chart-registry';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

@Injectable({ providedIn: 'root' })
export class ChartBuilderService {
  private experimentService = inject(ExperimentStudioService);


  getChartsForAlgorithm(algorithm: string, result: any, _fallbackTitle?: string | null): EChartsOption[] {
    const config = AlgorithmChartRegistry[algorithm];
    if (!config) return [];

    // enrich with display names
    const enrichedInput = this.enrichLabels(result);

    // PCA: heatmap columns come from the result's own variable codes (request y order),
    // labelled through the studio label map — never the current studio selection. Labels a
    // saved experiment already supplied (`variable_names`) are kept.
    if (algorithm === 'pca' && !enrichedInput?.variable_names?.length) {
      const variables = Array.isArray(enrichedInput?.variables) ? enrichedInput.variables : [];
      if (variables.length > 0) {
        (enrichedInput as any).variable_names = variables;
      }
    }

    if (algorithm === 'describe') {
      this.attachDescribeDatasetLabels(enrichedInput);
    }

    // Keep chart titles chart-specific. Experiment-level title is rendered in the result header.
    return config.build(enrichedInput);
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

    const replaceLabel = (raw: string) => {
      const match =
        variables.find(v => v.code === raw) ||
        filters.find(f => f.code === raw);

      return match?.name || match?.label || raw;
    };

    // If it's a string, try to replace it if it's a variable code
    if (typeof input === 'string') {
      return replaceLabel(input);
    }

    // If it's an object (but not null/array), process its entries
    if (typeof input === 'object' && !Array.isArray(input)) {
      // Special case: if we are in anova_table, we specifically want to replace x_label and y_label
      // but we should also check other fields. The recursive approach below handles this 
      // by checking if keys or values match codes.

      const newObj: any = {};
      for (const [k, v] of Object.entries(input)) {
        // If the key is 'variable' or ends with '_label', its value is likely a code
        if (k === 'variable' || k.endsWith('_label')) {
          newObj[k] = typeof v === 'string' ? replaceLabel(v) : this.enrichLabels(v);
        } else {
          newObj[k] = this.enrichLabels(v);
        }
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
