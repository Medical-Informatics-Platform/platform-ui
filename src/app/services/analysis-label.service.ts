import { inject, Injectable } from '@angular/core';
import { AnalysisStudioService } from './analysis-studio.service';
import { DataModel } from '../models/data-model.interface';
import { firstValueFrom } from 'rxjs';
import { EnumMaps } from '../core/algorithm-result-enum-mapper';
import { buildEnumMapForVariables, datasetLabelsOf, findDataModelByCodeVersion } from '../core/data-model.utils';

@Injectable({ providedIn: 'root' })
export class AnalysisLabelService {
  private cache = new Map<string, Record<string, string>>();
  private inflight = new Map<string, Promise<Record<string, string>>>();
  private enumCache = new Map<string, EnumMaps>();
  private enumInflight = new Map<string, Promise<EnumMaps>>();

  private analysisStudio = inject(AnalysisStudioService);

  async getLabelMap(domain: string | null | undefined): Promise<Record<string, string>> {
    return this.cached(domain, this.cache, this.inflight, {}, (model, converted) => {
      const map: Record<string, string> = { [domain!]: model.label || domain! };
      for (const v of converted.allVariables) {
        if (v?.code) map[v.code] = v.label || v.code;
      }
      // Dataset codes are numeric; the readable name is the dataset label.
      for (const [code, label] of datasetLabelsOf(model)) map[code] = label;
      return map;
    }, 'data models');
  }

  async getEnumMaps(domain: string | null | undefined): Promise<EnumMaps> {
    return this.cached(
      domain,
      this.enumCache,
      this.enumInflight,
      {},
      (_model, converted) => buildEnumMapForVariables(converted.allVariables),
      'enum maps',
    );
  }

  private async cached<T>(
    domain: string | null | undefined,
    cache: Map<string, T>,
    inflight: Map<string, Promise<T>>,
    empty: T,
    build: (model: DataModel, converted: ReturnType<AnalysisStudioService['convertToD3Hierarchy']>) => T,
    errorLabel: string,
  ): Promise<T> {
    if (!domain) return empty;
    const hit = cache.get(domain);
    if (hit) return hit;
    const pending = inflight.get(domain);
    if (pending) return pending;

    const p = (async () => {
      try {
        const models = await firstValueFrom(this.analysisStudio.loadAllDataModels()) as DataModel[];
        const model = findDataModelByCodeVersion(domain, models);
        if (!model) return empty;
        return build(model, this.analysisStudio.convertToD3Hierarchy(model));
      } catch (err) {
        console.error('[AnalysisLabelService] failed to load', errorLabel, err);
        return empty;
      } finally {
        inflight.delete(domain);
      }
    })();

    inflight.set(domain, p);
    const result = await p;
    cache.set(domain, result);
    return result;
  }
}
