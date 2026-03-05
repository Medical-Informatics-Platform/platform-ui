import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, catchError, defaultIfEmpty, filter, map, of, switchMap, take, takeUntil, tap, timer } from 'rxjs';
import { SessionStorageService } from './session-storage.service';
import { D3HierarchyNode, DataModel, Group, Variable } from '../models/data-model.interface';
import { mapRawAlgorithmToAlgorithmConfig } from '../core/algorithm-mappers';
import { EnumMaps } from '../core/algorithm-result-enum-mapper';
import { RawAlgorithmDefinition } from '../models/backend-algorithms.model';
import { BackendFilter } from '../models/filters.model';
import { AlgorithmConfig } from '../models/algorithm-definition.model';
import { BackendExperiment } from '../models/backend-experiment.model';
import { ErrorService } from './error.service';
import { AlgorithmRulesService } from './algorithm-rules.service';
import { AlgorithmNames, VariableTypes } from '../core/constants/algorithm.constants';


@Injectable({ providedIn: 'root' })
export class ExperimentStudioService {
  private http = inject(HttpClient);
  private sessionStorage = inject(SessionStorageService);
  private errorService = inject(ErrorService);
  private algorithmRulesService = inject(AlgorithmRulesService);

  private apiUrl = '/services/data-models';
  private experimentUrl = '/services/experiments';
  private dataModels: any[] = [];
  private dataModelsLoaded = false;

  private selectedVariablesSignal = signal<any[]>(this.sessionStorage.getItem('selectedVariables') || []);
  private selectedCovariatesSignal = signal<any[]>(this.sessionStorage.getItem('selectedCovariates') || []);
  private selectedFiltersSignal = signal<any[]>(this.sessionStorage.getItem('selectedFilters') || []);

  readonly selectedVariables = computed(() => this.selectedVariablesSignal());
  readonly selectedCovariates = computed(() => this.selectedCovariatesSignal());
  readonly selectedFilters = computed(() => this.selectedFiltersSignal());

  getCategoricalEnumMaps(): EnumMaps {
    const items = [
      ...this.selectedVariables(),
      ...this.selectedCovariates(),
      ...this.selectedFilters(),
    ];

    const maps: EnumMaps = {};

    items.forEach((item) => {
      const enums = Array.isArray(item?.enumerations) ? item.enumerations : [];
      if (!enums.length) return;

      const code = String(item?.code ?? '');
      if (!code) return;

      const enumMap: Record<string, string> = {};
      enums.forEach((e: any) => {
        const raw = e?.code ?? e?.label ?? e?.name;
        if (raw === null || raw === undefined) return;
        const key = String(raw);
        const label = e?.label ?? e?.name ?? String(raw);
        enumMap[key] = label;
      });

      if (Object.keys(enumMap).length > 0) {
        maps[code] = enumMap;
      }
    });

    return maps;
  }

  private selectedDatasetsSignal = signal<string[]>(this.sessionStorage.getItem('selectedDatasets') || []);
  private transientUrl = '/services/experiments/transient';

  lastUsedAlgorithm = signal<string | null>(null);
  selectedDatasets = computed(() => this.selectedDatasetsSignal());
  backendAlgorithms = signal<Record<string, AlgorithmConfig>>({});
  selectedDataModel = signal<DataModel | null>(this.sessionStorage.getItem('selectedDataModel'));
  readonly crossSectionalModels = signal<DataModel[]>([]);
  readonly longitudinalModels = signal<DataModel[]>([]);
  readonly availableDatasets = signal<{ code: string; label: string }[]>([]);

  private currentExperimentUUIDSignal = signal<string | null>(null);
  readonly currentExperimentUUID = this.currentExperimentUUIDSignal.asReadonly();

  private editingExistingExperimentSignal = signal(false);
  readonly editingExistingExperiment = this.editingExistingExperimentSignal.asReadonly();

  readonly isShared = signal<boolean>(false);

  private readonly _isRunning = signal(false);
  readonly isRunning = this._isRunning.asReadonly();
  readonly isFilterConfigOpen = signal<boolean>(false);
  private dataExclusionWarningsSignal = signal<string[]>([]);
  readonly dataExclusionWarnings = this.dataExclusionWarningsSignal.asReadonly();
  private excludedDatasetsSignal = signal<string[]>([]);
  readonly excludedDatasets = this.excludedDatasetsSignal.asReadonly();

  // teardown for transient requests
  private destroy$ = new Subject<void>();

  private readonly crossValidationVariants: Record<string, string> = {
    linear_regression: 'linear_regression_cv',
    logistic_regression: 'logistic_regression_cv',
    naive_bayes_gaussian: 'naive_bayes_gaussian_cv',
    naive_bayes_categorical: 'naive_bayes_categorical_cv',
  };

  private readonly crossValidationBases: Record<string, string> = Object.entries(
    this.crossValidationVariants
  ).reduce((acc, [base, cv]) => {
    acc[cv] = base;
    return acc;
  }, {} as Record<string, string>);

  private readonly transformationVariants: Record<string, string> = {
    pca: 'pca_with_transformation',
  };

  private readonly transformationBases: Record<string, string> = Object.entries(
    this.transformationVariants
  ).reduce((acc, [base, variant]) => {
    acc[variant] = base;
    return acc;
  }, {} as Record<string, string>);


  constructor() {
    this.loadBackendAlgorithms().subscribe();

    // Reset filters when no filter variables OR no rules
    effect(() => {
      const vars = this.selectedFiltersSignal();
      const logic = this._filterLogic();

      const noVars = !vars || vars.length === 0;
      const noRules = !logic || !Array.isArray(logic.rules) || logic.rules.length === 0;

      if (noVars || noRules) {
        if (this._filterLogic()) {
          this._filterLogic.set(null);
        }
      }
    });

    effect(() => {
      const selected = this.selectedDatasetsSignal();
      if (!selected) return;

      if (selected.length === 0) {
        console.warn('No datasets selected — resetting state');
        this.setVariables([]);
        this.setCovariates([]);
        this.setFilters([]);
      } else {
        this.refreshDataModel();
      }
    });

    // Auto-deselect algorithm when it becomes unavailable due to variable/covariate changes
    effect(() => {
      const currentAlgo = this.selectedAlgorithm();
      if (!currentAlgo) return;

      // Read these to establish reactive dependencies
      const _variables = this.selectedVariables();
      const _covariates = this.selectedCovariates();

      // Check if the currently selected algorithm is still available
      const isStillAvailable = this.isAlgorithmAvailable(currentAlgo.name);

      if (!isStillAvailable) {
        console.log(
          `[ExperimentStudioService] Algorithm "${currentAlgo.name}" is no longer available — deselecting.`
        );
        this.clearSelectedAlgorithm();
      }
    });

    // --- State Persistence ---
    effect(() => {
      this.sessionStorage.setItem('selectedVariables', this.selectedVariablesSignal());
    });

    effect(() => {
      this.sessionStorage.setItem('selectedCovariates', this.selectedCovariatesSignal());
    });

    effect(() => {
      this.sessionStorage.setItem('selectedFilters', this.selectedFiltersSignal());
    });

    effect(() => {
      this.sessionStorage.setItem('selectedDatasets', this.selectedDatasetsSignal());
    });

    effect(() => {
      this.sessionStorage.setItem('selectedDataModel', this.selectedDataModel());
    });
  }

  setSelectedDataModel(model: DataModel | null): void {
    this.selectedDataModel.set(model);
    this.clearDataExclusionWarnings();
  }

  getActiveDataModelCode(): string {
    const model = this.selectedDataModel();
    if (!model?.code || !model?.version) {
      console.warn('No active data model found.');
      return 'unknown';
    }
    return `${model.code}:${model.version}`;
  }

  refreshDataModel() {
    const selected = this.selectedDatasetsSignal();
    if (!selected || selected.length === 0) return;

    this.loadAllDataModels()
      .pipe(takeUntil(this.destroy$))
      .subscribe(models => {
        const active = models.filter(m => selected.includes(m.code));
        if (!active.length) return;

        const model = active[0];
        this.selectedDataModel.set(model);

        const converted = this.convertToD3Hierarchy(model);

        // enrich variables
        const enrichedVariables = converted.allVariables.map(v => ({
          ...v,
          supportedAlgos: this.algorithmEnabled(v.type ?? 'unknown')
        }));

        this.selectedDataModel.set(model);
      });
  }


  setSelectedDatasets(datasets: string[]) {
    this.selectedDatasetsSignal.set(datasets);
    this.clearDataExclusionWarnings();
  }

  algorithmEnabled(variableType: string): string[] {
    // Normalize to array because incoming variable metadata may be scalar or array.
    const varTypes = Array.isArray(variableType) ? variableType : [variableType];
    const allAlgos = Object.values(this.backendAlgorithms());

    // filter inputdata.y and add at least one of the varTypes in types list
    const result = allAlgos
      .filter(algo => {
        const yReq = algo.inputdata?.y;
        const xReq = algo.inputdata?.x;

        if (!yReq || !Array.isArray(yReq.types)) {
          return false;
        }

        const varIsNominal = varTypes.includes(VariableTypes.NOMINAL);

        if (varIsNominal && yReq.stattypes?.includes(VariableTypes.NOMINAL)) {
          return true;
        }

        const yExists = varTypes.some(t => yReq.types.includes(t));

        if (!yExists) {
          return false;
        }

        if (xReq && Array.isArray(xReq.types)) {
          if (varTypes.length === 0) {
            return false;
          }

          const xExists = varTypes.some(t => xReq.types.includes(t));
          if (!xExists) {
            return false;
          }
        }

        if (varIsNominal && xReq?.stattypes?.includes(VariableTypes.NOMINAL)) {
          return true;
        }
        return true;
      })
      .map(algo => algo.name);
    return result;

  }

  // adds variables and adds enumerations for the algorithm panel
  addVariableAndEnrich(node: any): void {
    const currentVars = this.selectedVariables();
    if (currentVars.some(v => v.code === node.code)) {
      return;
    }

    const enabledAlgos = this.algorithmEnabled(node.type);

    const enrichedNode = {
      ...node,
      code: node.code,
      label: node.label,
      name: node.name,
      enumerations: node.enumerations,
      supportedAlgos: enabledAlgos,
    };

    // update signal
    this.selectedVariablesSignal.set([...currentVars, enrichedNode]);
  }

  setVariables(vars: D3HierarchyNode[]) {
    this.selectedVariablesSignal.set(vars);
    this.clearDataExclusionWarnings();
  }


  setCovariates(covs: D3HierarchyNode[]): void {
    this.selectedCovariatesSignal.set(covs);
    this.clearDataExclusionWarnings();
  }

  setFilters(filters: D3HierarchyNode[]): void {
    this.selectedFiltersSignal.set(filters);
    this.clearDataExclusionWarnings();
  }

  setDataExclusionWarnings(warnings: string[], excludedDatasets: string[] = []): void {
    const sanitized = Array.from(
      new Set((warnings ?? [])
        .map((warning) => String(warning ?? '').trim())
        .filter((warning) => warning.length > 0))
    );
    this.dataExclusionWarningsSignal.set(sanitized);
    this.excludedDatasetsSignal.set(excludedDatasets);
  }

  clearDataExclusionWarnings(): void {
    this.dataExclusionWarningsSignal.set([]);
    this.excludedDatasetsSignal.set([]);
  }

  selectedAlgorithm = signal<AlgorithmConfig | null>(
    this.sessionStorage.getItem<AlgorithmConfig>('selectedAlgorithm') ?? null
  );

  algorithmConfigurations = signal<Record<string, Record<string, any>>>(
    this.sessionStorage.getItem('algorithmConfigurations') || {}
  );

  async setAlgorithm(algorithm: AlgorithmConfig) {
    const algo = this.backendAlgorithms()[algorithm.name];
    if (!algo) {
      console.error("Algorithm not found:", algorithm.name);
      return;
    }

    const selectedVariables = this.selectedVariables();
    if (selectedVariables.length !== 1) {
      console.warn("Enrichment skipped: need exactly 1 selected variable for enums.");
      this.selectedAlgorithm.set(algo);
      this.sessionStorage.setItem('selectedAlgorithm', algo);
      return;
    }

    const selectedY = selectedVariables[0];
    let enums = selectedY.enumerations ?? [];

    const enrichedConfig = algo.configSchema.map((field) => {
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        return { ...field, options: [...enums] }; // avoid shared reference
      }
      return field;
    });

    const enrichedAlgo = { ...algo, configSchema: enrichedConfig };
    this.selectedAlgorithm.set(enrichedAlgo);
    this.sessionStorage.setItem('selectedAlgorithm', enrichedAlgo);
  }

  loadBackendAlgorithms(): Observable<Record<string, AlgorithmConfig>> {
    return this.http.get<RawAlgorithmDefinition[]>('/services/algorithms').pipe(
      map((rawAlgorithms) => {
        const mapped: Record<string, AlgorithmConfig> = {};

        rawAlgorithms.forEach((raw) => {
          const algo = mapRawAlgorithmToAlgorithmConfig(raw);
          mapped[algo.name] = algo;
        });

        this.backendAlgorithms.set(mapped);
        return mapped;
      }),
      catchError((error) => {
        console.error('Failed to fetch backend algorithms:', error);
        return of({});
      })
    );
  }

  getCrossValidationVariant(baseName: string): string | null {
    return this.crossValidationVariants[baseName] ?? null;
  }

  getCrossValidationBase(name: string): string | null {
    if (this.crossValidationBases[name]) return this.crossValidationBases[name];
    if (name.endsWith('_cv_fedaverage')) {
      return name.replace('_cv_fedaverage', '');
    }
    if (name.endsWith('_cv')) {
      return name.slice(0, -3);
    }
    return null;
  }

  isCrossValidationAlgorithm(name: string): boolean {
    return (
      name in this.crossValidationBases ||
      name.endsWith('_cv') ||
      name.endsWith('_cv_fedaverage')
    );
  }

  isCrossValidationOnly(name: string): boolean {
    if (!this.isCrossValidationAlgorithm(name)) return false;
    const base = this.getCrossValidationBase(name);
    return !!base && !this.backendAlgorithms()[base];
  }

  getTransformationVariant(baseName: string): string | null {
    return this.transformationVariants[baseName] ?? null;
  }

  getTransformationBase(name: string): string | null {
    if (this.transformationBases[name]) return this.transformationBases[name];
    if (name.endsWith('_with_transformation')) {
      return name.replace('_with_transformation', '');
    }
    return null;
  }

  isTransformationAlgorithm(name: string): boolean {
    return (
      name in this.transformationBases ||
      name.endsWith('_with_transformation')
    );
  }

  availableGroupedAlgorithms = computed(() => {
    // Explicitly read selection signals to establish reactive dependencies.
    // Without this, the computed only re-runs when backendAlgorithms() changes,
    // not when variable/covariate selections change.
    const _variables = this.selectedVariables();
    const _covariates = this.selectedCovariates();
    const _filters = this.selectedFilters();

    // Hide quick-preview algorithms from the selection list.
    const hidden = new Set([
      AlgorithmNames.HISTOGRAM,
      AlgorithmNames.DESCRIBE,
      AlgorithmNames.LOGISTIC_REGRESSION_FEDAVERAGE_FLOWER
    ]);

    return Object.values(this.backendAlgorithms())
      .filter(algo => !hidden.has(algo.name))
      .filter(algo => {
        if (!this.isCrossValidationAlgorithm(algo.name)) return true;
        const base = this.getCrossValidationBase(algo.name);
        return !base || !this.backendAlgorithms()[base];
      })
      .filter(algo => !this.isTransformationAlgorithm(algo.name))
      .reduce((acc, algo) => {
        const cat = algo.category || 'Other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push({
          ...algo,
          isDisabled: !this.isAlgorithmAvailable(algo.name)
        });
        return acc;
      }, {} as Record<string, AlgorithmConfig[]>);
  });

  isAlgorithmAvailable(name: string): boolean {
    const algo = this.backendAlgorithms()[name];
    if (!algo?.inputdata) return false;

    return this.algorithmRulesService.isAlgorithmAvailable(algo, {
      y: this.selectedVariables(),
      x: this.selectedCovariates(),
      filters: this.selectedFilters(),
    });
  }

  getAlgorithmRequirementOverrides(algo: { name?: string; inputdata?: any } | null | undefined): { y?: string; x?: string; filters?: string } | null {
    return this.algorithmRulesService.getAlgorithmRequirementOverrides(algo);
  }

  private rolePayload(
    algo: AlgorithmConfig,
    role: 'y' | 'x',
    codes: string[]
  ): string[] | string | null {
    const req = algo.inputdata?.[role];
    if (!req) return null;

    if (!codes || codes.length === 0) return null;

    // multiple=false => scalar
    if (req.multiple === false) return codes[0];

    // multiple=true (undefined) => array
    return codes;
  }

  buildRequestBody(
    algorithmName: string | null = null,
    yVariables: string[] | null = null,
    xVariables: string[] | null = null,
    effectiveAlgorithmName: string | null = null,
    customName: string | null = null,
    bins: number | null = null
  ): any {
    let algoConfig: AlgorithmConfig | undefined;

    if (algorithmName) {
      algoConfig = this.backendAlgorithms()[algorithmName];
    } else {
      algoConfig = this.selectedAlgorithm() ?? undefined;
    }

    if (!algoConfig) {
      throw new Error('No algorithm config found for ' + algorithmName);
    }

    const requestAlgorithmName = effectiveAlgorithmName ?? algoConfig.name;
    const expName = customName ?? `experiment_${requestAlgorithmName.replace(/\s+/g, '_')}`;

    // unified signals
    const variables = yVariables?.length
      ? yVariables
      : this.selectedVariables().map((v) => v.code);

    const covariates =
      xVariables ?? this.selectedCovariates().map((c) => c.code);

    const allConfigs = this.algorithmConfigurations();
    const config = { ...(allConfigs[algoConfig.name ?? ''] || {}) };
    const isCvRequest = this.isCrossValidationAlgorithm(requestAlgorithmName);
    if (isCvRequest && config['n_splits'] === undefined) {
      config['n_splits'] = 5;
    }
    if (!isCvRequest && config['n_splits'] !== undefined) {
      delete config['n_splits'];
    }


    // filters logic
    const filterLogic = this._filterLogic();
    const hasFilters =
      !!(
        filterLogic &&
        Array.isArray(filterLogic.rules) &&
        filterLogic.rules.length > 0
      );

    // special case for histogram (no filters, transient)
    if (algorithmName === AlgorithmNames.HISTOGRAM) {
      return {
        name: expName,
        algorithm: {
          name: requestAlgorithmName,
          inputdata: {
            data_model: this.getActiveDataModelCode(),
            y: yVariables ?? null,
            datasets: this.selectedDatasetsSignal().filter(ds => !this.excludedDatasetsSignal().includes(ds)),
            filters: null,
          },
          parameters: bins ? { bins } : {},
          preprocessing: null,
        },
      };
    }
    const yPayload = this.rolePayload(algoConfig, 'y', variables);
    const xPayload = this.rolePayload(algoConfig, 'x', covariates);
    // generic build
    const body = {
      name: expName,
      algorithm: {
        name: requestAlgorithmName,
        inputdata: {
          data_model: this.getActiveDataModelCode(),
          y: yPayload,
          x: xPayload,
          datasets: this.selectedDatasetsSignal().filter(ds => !this.excludedDatasetsSignal().includes(ds)),
          filters: hasFilters ? filterLogic : null,
        },
        parameters: config,
        preprocessing: null,
      },
      mipVersion: (window as any).__env?.MIP_VERSION || '9.0.0'
    };
    return body;
  }

  loadAllDataModels(): Observable<any[]> {
    if (!this.dataModelsLoaded) {
      return this.http.get<any[]>(this.apiUrl).pipe(
        tap((models) => {
          this.dataModels = models;
          this.dataModelsLoaded = true;
        }),
        catchError((err) => {
          console.error('Error fetching data models:', err);
          this.errorService.setError('Failed to load data models. Please try again.');
          return of([]);
        })
      );
    }
    return of(this.dataModels);
  }

  getAllDataModels(): Observable<any[]> {
    return this.loadAllDataModels();
  }

  convertToD3Hierarchy(data: DataModel): {
    hierarchy: D3HierarchyNode;
    allVariables: D3HierarchyNode[];
    allDatasets: any[];
  } {
    const convertVariables = (vars: Variable[] = []): D3HierarchyNode[] =>
      vars.map((v) => ({
        label: v.label,
        code: v.code ?? '',
        value: 1,
        type: v.type ?? 'unknown',
        description: v.description ?? '',
        enumerations: v.enumerations ?? []
      }));

    const convertGroups = (groups: Group[] = []): D3HierarchyNode[] =>
      groups.map((g) => ({
        label: g.label,
        code: g.code ?? '',
        children: [
          ...convertVariables(g.variables ?? []),
          ...convertGroups(g.groups ?? []),
        ],
      }));

    const extractFlat = (node: any, list: D3HierarchyNode[] = []): D3HierarchyNode[] => {
      if (node.children) node.children.forEach((child: any) => extractFlat(child, list));
      else if (node.label) list.push(node);
      return list;
    };

    const hierarchy: D3HierarchyNode = {
      label: data.label,
      code: data.code ?? '',
      children: [
        ...convertVariables(data.variables ?? []),
        ...convertGroups(data.groups ?? []),
      ],
    };

    const allVariables = extractFlat(hierarchy);

    const datasetSource: any = (data as any).datasets;
    let allDatasets: any[] = [];
    if (Array.isArray(datasetSource)) {
      allDatasets = datasetSource;
    } else if (datasetSource && typeof datasetSource === 'object') {
      if (Array.isArray(datasetSource.enumerations)) {
        allDatasets = datasetSource.enumerations;
      } else if (Array.isArray(datasetSource.values)) {
        allDatasets = datasetSource.values;
      } else if (Array.isArray(datasetSource.items)) {
        allDatasets = datasetSource.items;
      }
    }

    return {
      hierarchy,
      allVariables,
      allDatasets,
    };
  }

  submitRequest(requestBody: any, cacheHandler?: (response: any) => void): Observable<any> {
    return this.http.post<any>(this.experimentUrl, requestBody).pipe(
      switchMap((res) => {
        const uuid = res?.uuid || res?.algorithm?.execution_id;
        if (!uuid) {
          throw new Error('UUID not found in response');
        }
        this.currentExperimentUUIDSignal.set(uuid);
        return this.pollForResults(`${this.experimentUrl}/${uuid}`);
      }),
      tap((response) => {
        if (cacheHandler && response?.result) {
          cacheHandler(response.result);
        }
      }),
      catchError(() => {
        this.errorService.setError('Failed to run experiment. Please try again.');
        this.setRunning(false);
        return of({ status: 'error', result: { message: 'Experiment request failed.' } });
      })
    );
  }


  private isTransientAlgorithm(name: string): boolean {
    return ['histogram', 'describe'].includes(name);
  }

  private normalizeResponse(algoName: string, resp: any): any {
    if (this.isTransientAlgorithm(algoName) && resp && !resp.result) {
      return { result: resp };
    }
    return resp;
  }

  private normalizeTransientResponse(resp: any): any {
    if (!resp) return null;
    if (resp.result !== undefined || resp.status !== undefined) return resp;
    return { result: resp };
  }

  private submitTransientRequest(requestBody: any, cacheHandler?: (result: any) => void): Observable<any> {
    return this.http.post<any>(this.transientUrl, requestBody).pipe(
      tap((resp) => {
        if (cacheHandler && resp) cacheHandler(resp);
      }),
      catchError(() => {
        this.errorService.setError('Quick preview failed. Please retry.');
        return of(null);
      })
    );
  }

  //Runs transient or standard algorithm calls.
  //Used for fetching quick results like histograms or descriptive stats.
  getAlgorithmResults(algorithmName: string, nodeCodes: string[] | null = null, bins: number | null = null): Observable<any> {
    if (algorithmName === 'histogram') {
      const requestBody = this.buildRequestBody(algorithmName, nodeCodes, null, null, null, bins);
      return this.submitTransientRequest(requestBody).pipe(
        map(resp => this.normalizeResponse(algorithmName, resp))
      );
    }

    // non-transient: ignore nodeCodes
    const requestBody = this.buildRequestBody(algorithmName);
    return this.submitRequest(requestBody);
  }

  private buildDescriptiveRequestBody(variableCodes: string[]): any {
    const filters = this.filterLogic();
    const hasFilters = !!(filters && Array.isArray(filters.rules) && filters.rules.length > 0);

    return {
      name: `experiment_describe_${variableCodes.join('_')}`,
      algorithm: {
        name: "describe",
        inputdata: {
          data_model: this.getActiveDataModelCode(),
          y: variableCodes,
          x: null,
          datasets: this.selectedDatasetsSignal(),
          filters: hasFilters ? filters : null,
        },
        parameters: {},
        preprocessing: null,
      },
    };
  }

  loadDescriptiveOverview(variableCodes: string[]): Observable<any> {
    const requestBody = this.buildDescriptiveRequestBody(variableCodes);

    return this.submitTransientRequest(requestBody).pipe(
      tap((response) => {
        console.log("Raw descriptive overview response:", response);
      }),
      map(resp => this.normalizeResponse("describe", resp)),
      catchError((error) => {
        console.error("Error fetching descriptive overview:", error);
        this.errorService.setError('Failed to load descriptive statistics.');
        return of(null);
      })
    );
  }

  runSelectedAlgorithm(
    algorithmNameOverride: string | null = null,
    effectiveAlgorithmName: string | null = null,
    customName: string | null = null
  ): Observable<any> | null {
    const selectedAlgo = this.selectedAlgorithm();
    if (!selectedAlgo) {
      console.error('No algorithm selected.');
      return null;
    }

    const baseAlgorithmName = algorithmNameOverride ?? selectedAlgo.name;
    const requestAlgorithmName = effectiveAlgorithmName ?? baseAlgorithmName;

    if (baseAlgorithmName === 'describe') {
      const variableCodes = this.selectedVariables().map((v) => v.code);
      if (!variableCodes.length) {
        console.warn('Descriptive stats: no variables selected.');
        return null;
      }
      return this.loadDescriptiveOverview(variableCodes);
    }

    const requestBody = this.buildRequestBody(baseAlgorithmName, null, null, requestAlgorithmName, customName);

    return this.submitRequest(requestBody);
  }

  runSelectedAlgorithmTransient(
    algorithmNameOverride: string | null = null,
    effectiveAlgorithmName: string | null = null
  ): Observable<any> | null {
    const selectedAlgo = this.selectedAlgorithm();
    if (!selectedAlgo) {
      console.error('No algorithm selected.');
      return null;
    }

    const baseAlgorithmName = algorithmNameOverride ?? selectedAlgo.name;
    const requestAlgorithmName = effectiveAlgorithmName ?? baseAlgorithmName;

    if (baseAlgorithmName === 'describe') {
      const variableCodes = this.selectedVariables().map((v) => v.code);
      if (!variableCodes.length) {
        console.warn('Descriptive stats: no variables selected.');
        return null;
      }
      return this.loadDescriptiveOverview(variableCodes).pipe(
        map(resp => this.normalizeTransientResponse(resp))
      );
    }

    const requestBody = this.buildRequestBody(
      baseAlgorithmName,
      null,
      null,
      requestAlgorithmName
    );

    return this.submitTransientRequest(requestBody).pipe(
      map(resp => this.normalizeTransientResponse(resp))
    );
  }

  getCurrentExperimentUUID() {
    return this.currentExperimentUUID();
  }

  pollForResults(url: string): Observable<any> {
    const pollingInterval = 5000;
    const maxRetries = 60;
    return timer(0, pollingInterval).pipe(
      take(maxRetries),
      switchMap(() =>
        this.http.get<any>(url).pipe(
          map((response) => {
            if (response.status === 'success' || response.status === 'error') {
              return response;
            }
            return null;
          }),
          catchError(() =>
            of({
              status: 'error',
              result: { message: 'Network or server error while polling results.' }
            })
          )
        )
      ),
      filter((result) => result !== null),
      take(1),
      defaultIfEmpty({
        status: 'error',
        result: { message: 'Experiment run timed out before completion.' }
      })
    );
  }

  categorizeDataModels(dataModels: DataModel[]): {
    crossSectional: DataModel[];
    longitudinal: DataModel[];
  } {
    return {
      crossSectional: dataModels.filter((m) => !m.longitudinal),
      longitudinal: dataModels.filter((m) => m.longitudinal)
    };
  }

  updateExperimentName(uuid: string, newName: string) {
    return this.http.patch(`/services/experiments/${uuid}`, { name: newName });
  }

  // Filters and rules
  private _filterLogic = signal<BackendFilter | null>(null);

  get filterLogic() {
    return this._filterLogic.asReadonly();
  }

  setFilterLogic(logic: BackendFilter | null) {
    this._filterLogic.set(logic);
  }

  private toArray = (v: any): string[] => v == null ? [] : Array.isArray(v) ? v : [v];

  loadAndCategorizeModels(): Observable<any[]> {
    return this.getAllDataModels().pipe(
      tap((models) => {
        const { crossSectional, longitudinal } = this.categorizeDataModels(models);
        this.crossSectionalModels.set(crossSectional);
        this.longitudinalModels.set(longitudinal);
      })
    );
  }

  updateAvailableDatasets(model: DataModel | null): void {
    if (!model) {
      this.availableDatasets.set([]);
      return;
    }
    const { hierarchy, allVariables } = this.convertToD3Hierarchy(model);
    const datasetVariable = allVariables.find(
      (variable: any) => String(variable?.code ?? '').toLowerCase() === 'dataset'
    );
    const datasetEnums = datasetVariable?.enumerations ?? [];
    const datasetSource: any = (model as any).datasets;
    const allowedCodes = new Set<string>(
      Array.isArray(datasetSource)
        ? datasetSource
          .map((item: any) => String(item?.code ?? item ?? ''))
          .filter((code: string) => code)
        : []
    );
    const available = datasetEnums
      .filter((dataset: any) => {
        const code = String(dataset?.code ?? '');
        return allowedCodes.size === 0 || allowedCodes.has(code);
      })
      .map((dataset: any) => ({
        code: String(dataset?.code ?? ''),
        label: String(dataset?.label ?? dataset?.name ?? dataset?.code ?? ''),
      }));
    this.availableDatasets.set(available);
  }

  hydrateFromBackendExperiment(exp: BackendExperiment): void {
    if (!exp || !exp.algorithm) {
      console.warn('hydrateFromBackendExperiment called with invalid exp:', exp);
      return;
    }

    this.isShared.set(!!exp.shared);
    // flag as editing mode
    this.setEditingExistingExperiment(true);

    // Basic metadata
    this.currentExperimentUUIDSignal.set(exp.uuid ?? null);

    const algoName = exp.algorithm.name;
    const input = exp.algorithm.inputdata || {};
    const params = exp.algorithm.parameters || {};

    const filters = input.filters ?? null;

    // Selected datasets
    this.setSelectedDatasets(this.toArray(input.datasets));

    // Filters
    this.setFilterLogic(filters);

    this.loadAllDataModels()
      .pipe(takeUntil(this.destroy$))
      .subscribe((models) => {
        if (!models || !models.length) {
          console.warn('No data models available for hydration.');
          return;
        }

        const model = this.findDataModelByCodeVersion(input.data_model, models);
        if (!model) {
          console.warn(
            'No matching data model found for',
            input.data_model,
            'in',
            models
          );
          return;
        }

        this.selectedDataModel.set(model);

        const converted = this.convertToD3Hierarchy(model);
        const allVariables = converted.allVariables;

        const yCodes = this.toArray(input.y);
        const xCodes = this.toArray(input.x);
        const filterCodes = this.collectFilterVariableCodes(filters);

        const yNodes = allVariables
          .filter((v: any) => yCodes.includes(v.code))
          .map((n) => this.enrichVariableNode(n));

        const xNodes = allVariables
          .filter((v: any) => xCodes.includes(v.code))
          .map((n) => this.enrichVariableNode(n));

        const filterNodes = allVariables.filter((v: any) =>
          filterCodes.includes(v.code)
        );

        this.setVariables(yNodes);
        this.setCovariates(xNodes);
        this.setFilters(filterNodes);

        const algoConfig = this.backendAlgorithms()[algoName];

        if (!algoConfig) {
          console.warn('Algorithm config not found for', algoName);
          return;
        }

        const existingConfigs = this.algorithmConfigurations();
        this.algorithmConfigurations.set({
          ...existingConfigs,
          [algoName]: params,
        });

        this.setAlgorithm(algoConfig);
      });
  }

  onToggleShare(): void {
    const nextShared = !this.isShared();
    const uuid = this.currentExperimentUUID();

    if (!uuid) {
      console.warn('Cannot toggle share: missing experiment UUID');
      return;
    }

    this.http
      .patch<BackendExperiment>(`${this.experimentUrl}/${uuid}`, { shared: nextShared })
      .subscribe({
        next: (updated) => this.isShared.set(!!updated.shared),
        error: (err) => console.error('Failed to toggle share', err),
      });
  }

  // helpers for edit experiment
  private findDataModelByCodeVersion(
    codeVersion: string,
    models: DataModel[]
  ): DataModel | null {
    if (!codeVersion) return null;
    const [code, version] = codeVersion.split(':');
    return (
      models.find(
        (m) => m.code === code && String(m.version) === String(version)
      ) ?? null
    );
  }

  private enrichVariableNode(node: D3HierarchyNode): any {
    const supported = this.algorithmEnabled(node.type ?? 'unknown');
    return { ...node, supportedAlgos: supported };
  }

  private collectFilterVariableCodes(logic: BackendFilter | null): string[] {
    if (!logic) return [];
    const codes = new Set<string>();

    const walk = (node: any) => {
      if (!node) return;
      if (Array.isArray(node.rules)) {
        node.rules.forEach(walk);
      } else if (node.field || node.id) {
        const c = node.field ?? node.id;
        if (typeof c === 'string') codes.add(c);
      }
    };

    walk(logic);
    return [...codes];
  }

  setEditingExistingExperiment(isEditing: boolean) {
    this.editingExistingExperimentSignal.set(isEditing);
  }

  resetStudioState(): void {
    // basic signals
    this.selectedDatasetsSignal.set([]);
    this.selectedDataModel.set(null);

    this.setVariables([]);
    this.setCovariates([]);
    this.setFilters([]);

    this._filterLogic.set(null);
    this.errorService.clearError();
    this.clearDataExclusionWarnings();

    // algorithm state
    this.selectedAlgorithm.set(null);
    this.algorithmConfigurations.set({});
    this.lastUsedAlgorithm.set(null);

    // meta info
    this.currentExperimentUUIDSignal.set(null);
    this.setEditingExistingExperiment(false);

    // share flag for safety
    this.isShared.set(false);

    // Clear session storage
    this.sessionStorage.removeItem('selectedVariables');
    this.sessionStorage.removeItem('selectedCovariates');
    this.sessionStorage.removeItem('selectedFilters');
    this.sessionStorage.removeItem('selectedDatasets');
    this.sessionStorage.removeItem('selectedDataModel');
    this.sessionStorage.removeItem('selectedAlgorithm');
    this.sessionStorage.removeItem('algorithmConfigurations');

    // cancel any in-flight transient requests
    this.destroy$.next();
  }

  setRunning(isRunning: boolean): void {
    this._isRunning.set(isRunning);
  }

  clearSelectedAlgorithm(): void {
    this.selectedAlgorithm.set(null);
    this.sessionStorage.removeItem('selectedAlgorithm');
  }

  toggleFilterConfigModal(open: boolean): void {
    this.isFilterConfigOpen.set(open);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
