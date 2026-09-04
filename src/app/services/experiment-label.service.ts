import { inject, Injectable } from '@angular/core';
import { ExperimentStudioService } from './experiment-studio.service';
import { DataModel } from '../models/data-model.interface';
import { firstValueFrom } from 'rxjs';
import { EnumMaps } from '../core/algorithm-result-enum-mapper';
import { buildEnumMapForVariables, findDataModelByCodeVersion } from '../core/data-model.utils';

@Injectable({ providedIn: 'root' })
export class ExperimentLabelService {
  private cache = new Map<string, Record<string, string>>();
  private inflight = new Map<string, Promise<Record<string, string>>>();
  private enumCache = new Map<string, EnumMaps>();
  private enumInflight = new Map<string, Promise<EnumMaps>>();

  private expStudio = inject(ExperimentStudioService);

  constructor() { }


  async getLabelMap(domain: string | null | undefined): Promise<Record<string, string>> {
    if (!domain) return {};

    const cached = this.cache.get(domain);
    if (cached) return cached;

    const inflight = this.inflight.get(domain);
    if (inflight) return inflight;

    const p = (async () => {
      try {
        const models = await firstValueFrom(this.expStudio.loadAllDataModels()) as DataModel[];
        const model = findDataModelByCodeVersion(domain, models);

        if (!model) return {};

        const converted = this.expStudio.convertToD3Hierarchy(model);
        const map: Record<string, string> = {
          [domain]: model.label || domain
        };

        converted.allVariables.forEach((v: any) => {
          if (v?.code) {
            map[v.code] = v.label || v.code;

            // Also add enumerations to the flat map (especially useful for datasets)
            if (v.code.toLowerCase() === 'dataset' && Array.isArray(v.enumerations)) {
              v.enumerations.forEach((e: any) => {
                const eCode = e?.code ?? e?.label ?? e?.name;
                if (eCode) map[eCode] = e.label || e.name || eCode;
              });
            }
          }
        });

        return map;
      } catch (err) {
        console.error('[ExperimentLabelService] failed to load data models', err);
        return {};
      } finally {
        this.inflight.delete(domain);
      }
    })();

    this.inflight.set(domain, p);

    const result = await p;
    this.cache.set(domain, result);
    return result;
  }

  async getEnumMaps(domain: string | null | undefined): Promise<EnumMaps> {
    if (!domain) return {};

    const cached = this.enumCache.get(domain);
    if (cached) return cached;

    const inflight = this.enumInflight.get(domain);
    if (inflight) return inflight;

    const p = (async () => {
      try {
        const models = await firstValueFrom(this.expStudio.loadAllDataModels()) as DataModel[];
        const model = findDataModelByCodeVersion(domain, models);

        if (!model) return {};

        const converted = this.expStudio.convertToD3Hierarchy(model);
        return buildEnumMapForVariables(converted.allVariables);
      } catch (err) {
        console.error('[ExperimentLabelService] failed to load enum maps', err);
        return {};
      } finally {
        this.enumInflight.delete(domain);
      }
    })();

    this.enumInflight.set(domain, p);

    const result = await p;
    this.enumCache.set(domain, result);
    return result;
  }

}
