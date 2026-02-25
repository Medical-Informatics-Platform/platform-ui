import {
  Component,
  Input,
  SimpleChanges,
  OnChanges,
  effect,
  inject
} from '@angular/core';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { ChartRendererComponent } from '../visualisations/charts/charts-renderer/charts-renderer.component';
import { EChartsOption } from 'echarts';
import { ViewChildren, QueryList } from '@angular/core';
import { PdfExportService } from '../../../services/pdf-export.service';
import { SpinnerComponent } from '../../shared/spinner/spinner.component';
import { buildGroupedBarChart } from '../visualisations/charts/renderers/grouped-bar-chart';


type TabKey = 'Variables' | 'Model' | 'Distributions';
type MetricKey =
  | 'num_dtps' | 'num_na' | 'num_total'
  | 'mean' | 'std' | 'min' | 'q1' | 'q2' | 'q3' | 'max';

interface ModelTableBlock {
  variableName: string;
  datasets: string[];
  rows: Array<{ metric: MetricKey; values: Record<string, number | string | null> }>;
}

@Component({
  selector: 'app-statistic-analysis-panel',
  imports: [ChartRendererComponent, SpinnerComponent],
  templateUrl: './statistic-analysis-panel.component.html',
  styleUrls: ['./statistic-analysis-panel.component.css']
})
export class StatisticAnalysisPanelComponent implements OnChanges {
  @Input() processedData: any[] = [];
  @Input() variables: any[] = [];
  @Input() covariates: any[] = [];
  @Input() filters: any[] = [];
  @ViewChildren(ChartRendererComponent)
  chartRenderers!: QueryList<ChartRendererComponent>;
  isExporting = false;
  readonly mipVersion = (window as any).__env?.MIP_VERSION || '9.0.0';

  private expStudioService = inject(ExperimentStudioService);
  private chartBuilder = inject(ChartBuilderService);
  private pdfExportService = inject(PdfExportService);

  openAccordions: Record<string, boolean> = {};
  isLoading = true;

  activeTab: TabKey = 'Variables';
  showBoxPlots = false;
  distributionSubTab: 'Numeric' | 'Nominal' = 'Numeric';

  nonNominalVariables: Array<{ code: string; name?: string; label?: string; type?: string; enumerations?: any[] }> = [];
  nominalVariables: Array<{ code: string; name?: string; label?: string; type?: string; enumerations?: any[] }> = [];
  chartsForBoxPlot: EChartsOption[][] = [];
  chartsForNominal: EChartsOption[][] = [];
  activeBoxPlotIndex = 0;
  activeNominalIndex = 0;
  modelTables: ModelTableBlock[] = [];
  emptyDatasetWarnings: string[] = [];

  modelData: Array<{
    name: string;
    columns: string[];
    rows: Array<{ metric: string; values: Record<string, string> }>;
  }> = [];

  constructor() {
    effect(() => {
      const variables = this.expStudioService.selectedVariables();
      const covariates = this.expStudioService.selectedCovariates();
      const filters = this.expStudioService.selectedFilters();

      if (!variables.length && !covariates.length && !filters.length) {
        this.processedData = [];
        this.modelData = [];
        this.showBoxPlots = false;
        this.isLoading = false;
        this.emptyDatasetWarnings = [];
        return;
      }

      this.fetchDescriptiveStatistics();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['processedData']) {
      this.isLoading = this.processedData.length === 0;
    }
  }

  setTab(tab: TabKey) {
    this.activeTab = tab;
  }

  private computeDistributionVariables(variable_based: any[] = []): void {
    const selectedVars = this.expStudioService.selectedVariables();
    const selectedCovars = this.expStudioService.selectedCovariates();
    const all = [...selectedVars, ...selectedCovars];
    const dedupMap = new Map(all.map(v => [v.code, v]));
    const unique = Array.from(dedupMap.values());

    // Identify variables that have counts in the response
    const varsWithCounts = new Set<string>();
    for (const item of variable_based) {
      if (item.data && item.data.counts && Object.keys(item.data.counts).length > 0) {
        varsWithCounts.add(item.variable);
      }
    }

    // Nominal variables: Explicitly nominal OR found to have counts
    this.nominalVariables = unique.filter(
      (v) => v?.type === 'nominal' || varsWithCounts.has(v.code)
    );

    // Non-nominal variables: everything else
    // We exclude those already identified as nominal to avoid duplication
    const nominalCodes = new Set(this.nominalVariables.map(v => v.code));
    this.nonNominalVariables = unique.filter(
      (v) => !nominalCodes.has(v.code) && v?.type !== 'text'
    );

    this.showBoxPlots = this.nonNominalVariables.length > 0 || this.nominalVariables.length > 0;

    // Auto-select the appropriate sub-tab based on available variable types
    if (this.nonNominalVariables.length > 0 && this.nominalVariables.length === 0) {
      this.distributionSubTab = 'Numeric';
    } else if (this.nominalVariables.length > 0 && this.nonNominalVariables.length === 0) {
      this.distributionSubTab = 'Nominal';
    } else if (this.nonNominalVariables.length > 0) {
      this.distributionSubTab = 'Numeric'; // Default to Numeric when both exist
    }
  }

  private buildBoxPlotCharts(response: any) {
    this.chartsForBoxPlot = this.nonNominalVariables.map((v) => {
      const perVarResp = {
        ...response,
        result: {
          ...response.result,
          variable_based: (response?.result?.variable_based ?? []).filter(
            (r: any) => r.variable === v.code && r.dataset !== 'all datasets'
          )
        }
      };
      return this.chartBuilder.getChartsForAlgorithm('describe', perVarResp);
    });
    this.activeBoxPlotIndex = 0;
  }

  private buildNominalCharts(response: any) {
    const variable_based = response?.result?.variable_based ?? [];

    this.chartsForNominal = this.nominalVariables.map((v) => {
      const varData = variable_based.filter((r: any) => r.variable === v.code);
      const varLabel = v.name || v.label || v.code;
      const enumMap = this.getEnumLabelMap(v);
      return buildGroupedBarChart(varData, varLabel, enumMap);
    });
    this.activeNominalIndex = 0;
  }

  fetchDescriptiveStatistics(): void {
    this.isLoading = true;
    this.emptyDatasetWarnings = [];

    const variables = this.expStudioService.selectedVariables();
    const covariates = this.expStudioService.selectedCovariates();
    const filters = this.expStudioService.selectedFilters();

    const filterCodes = new Set(filters.map(f => f.code));
    const uniqueVariables = Array.from(new Map(variables.map(v => [v.code, v])).values());
    const uniqueCovariates = Array.from(new Map(covariates.map(c => [c.code, c])).values());

    // merged variables + covariates
    const merged = [
      ...uniqueVariables,
      ...uniqueCovariates
    ];

    const items = Array.from(new Map(merged.map(v => [v.code, v])).values());
    if (!items.length) { this.isLoading = false; return; }

    const variableCodes = items.map(i => i.code);

    this.expStudioService.loadDescriptiveOverview(variableCodes).subscribe({
      next: (response) => {
        const res = response?.result ?? response ?? {};
        let variable_based = res.variable_based ?? [];
        let model_based = res.model_based ?? [];

        // Identify and collect completely empty datasets
        const emptyDatasetsForVar: Record<string, string[]> = {};

        variable_based.forEach((item: any) => {
          if (item.dataset && item.dataset !== 'all datasets') {
            const dataCounts = item.data?.num_dtps;
            if (!dataCounts) { // 0, null, or undefined
              if (!emptyDatasetsForVar[item.dataset]) {
                emptyDatasetsForVar[item.dataset] = [];
              }
              const matchedVar = items.find(v => v.code === item.variable);
              const varName = matchedVar ? (matchedVar.name ?? matchedVar.label ?? matchedVar.code) : item.variable;
              if (!emptyDatasetsForVar[item.dataset].includes(varName)) {
                emptyDatasetsForVar[item.dataset].push(varName);
              }
            }
          }
        });

        // Generate warnings and get the list of dataset names to exclude
        const excludedDatasets = Object.keys(emptyDatasetsForVar);

        for (const ds of excludedDatasets) {
          const varNames = emptyDatasetsForVar[ds].join(', ');
          this.emptyDatasetWarnings.push(
            `Dataset '${ds}' is empty for variable(s): ${varNames}. It has been excluded from the descriptive statistics.`
          );
        }

        // Filter out the excluded datasets
        if (excludedDatasets.length > 0) {
          variable_based = variable_based.filter((item: any) => !excludedDatasets.includes(item.dataset));
          model_based = model_based.filter((item: any) => !excludedDatasets.includes(item.dataset));
        }

        const dsFromPayload = Array.from(
          new Set((variable_based ?? []).map((x: any) => String(x.dataset)))
        ) as string[];

        const allLast: string[] = dsFromPayload
          .filter((d: string) => d && d !== 'all datasets')
          .concat('all datasets');

        const varList = items;

        // Variables tab
        this.processedData = this.pivotByDataset(variable_based, varList, allLast);

        // Model tab - filter out "Missing" row as model-based uses complete data only
        this.modelData = this.pivotByDataset(model_based, varList, allLast).map(v => ({
          ...v,
          rows: v.rows.filter(r => r.metric !== 'Missing')
        }));

        // Box Plots
        this.computeDistributionVariables(variable_based);
        if (this.nonNominalVariables.length > 0) this.buildBoxPlotCharts(response);
        if (this.nominalVariables.length > 0) this.buildNominalCharts(response);
        this.isLoading = false;
      },
      error: (err) => { console.error(err); this.isLoading = false; }
    });
  }

  processDescriptiveStatsResults(response: any) {
    if (!response?.result?.variable_based) {
      this.processedData = [];
      return;
    }

    const variableList = this.expStudioService.selectedVariables();

    const grouped = response.result.variable_based.reduce((acc: any, v: any) => {
      const match = variableList.find((vv) => vv.code === v.variable);
      const name = match ? (match.name ?? match.label ?? match.code) : v.variable;
      const d = v.data || {};

      if (!acc[name]) acc[name] = { name, data: [] };

      acc[name].data.push({
        dataset: v.dataset ?? 'all datasets',
        stats: {
          num_datapoints: d.num_dtps ?? 0,
          num_missing: d.num_na ?? 0,
          total: d.num_total ?? 0,
          mean: d.mean ?? null,
          std_dev: d.std ?? null,
          min: d.min ?? null,
          q1: d.q1 ?? null,
          median: d.q2 ?? null,
          q3: d.q3 ?? null,
          max: d.max ?? null,
        }
      });

      return acc;
    }, {});

    Object.values(grouped).forEach((g: any) => {
      g.data.sort((a: any, b: any) => {
        const A = a.dataset === 'all datasets' ? 'zzzz' : a.dataset.toLowerCase();
        const B = b.dataset === 'all datasets' ? 'zzzz' : b.dataset.toLowerCase();
        return A.localeCompare(B);
      });
    });

    this.processedData = Object.values(grouped);
  }

  METRIC_LABEL: Record<MetricKey, string> = {
    num_dtps: 'Datapoints',
    num_na: 'Missing',
    num_total: 'Total',
    mean: 'Mean',
    std: 'Standard Deviation',
    min: 'Min',
    q1: 'Q1',
    q2: 'Median',
    q3: 'Q3',
    max: 'Max',
  };

  // helper: metrics + label
  METRIC_ORDER: Array<{ key: string; label: string }> = [
    { key: 'num_datapoints', label: 'Datapoints' },
    { key: 'num_missing', label: 'Missing' },
    { key: 'num_total', label: 'Total' },
    { key: 'mean', label: 'Mean' },
    { key: 'std', label: 'Standard Deviation' },
    { key: 'min', label: 'Min' },
    { key: 'q1', label: 'Q1' },
    { key: 'q2', label: 'Median' },
    { key: 'q3', label: 'Q3' },
    { key: 'max', label: 'Max' },
  ];

  // 2-decimals formatter
  private fmt(v: any): string {
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'number') return v.toFixed(2);

    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : String(v);
  }

  private fmtCount(v: any): string {
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'number' && Number.isFinite(v)) return String(Math.round(v));
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n)) : String(v);
  }

  private getEnumLabelMap(variable: any): Map<string, string> {
    const enums = Array.isArray(variable?.enumerations) ? variable.enumerations : [];
    const map = new Map<string, string>();
    enums.forEach((e: any) => {
      const raw = e?.code ?? e?.label ?? e?.name;
      if (raw === null || raw === undefined) return;
      const key = String(raw);
      const label = String(e?.label ?? e?.name ?? raw);
      map.set(key, label);
    });
    return map;
  }

  // pivot variable_based or model_based
  private pivotByDataset(
    items: any[],
    variableList: any[],
    datasetOrder: string[]
  ) {
    // group per variable
    const byVar: Record<string, any[]> = {};
    for (const it of items || []) {
      const arr = byVar[it.variable] || (byVar[it.variable] = []);
      arr.push(it);
    }

    // Change -> [{ name, columns, rows:[{metric, values:Record<dataset,string>}] }]
    const result: Array<{
      name: string;
      columns: string[];
      rows: Array<{ metric: string; values: Record<string, string> }>;
    }> = [];

    for (const [varCode, arr] of Object.entries(byVar)) {
      const matched = variableList.find(v => v.code === varCode);
      const varName = matched?.name ?? matched?.label ?? varCode;
      const enumMap = this.getEnumLabelMap(matched);

      const byDataset: Record<string, any> = {};
      for (const entry of arr) byDataset[entry.dataset] = entry.data || {};

      const countsKeys = new Set<string>();
      for (const ds of datasetOrder) {
        const counts = byDataset[ds]?.counts ?? {};
        Object.keys(counts).forEach((key) => countsKeys.add(String(key)));
      }

      let rows: Array<{ metric: string; values: Record<string, string> }> = [];

      if (countsKeys.size > 0) {
        const baseMetrics = [
          { key: 'num_datapoints', label: 'Datapoints' },
          { key: 'num_missing', label: 'Missing' },
          { key: 'num_total', label: 'Total' },
        ];

        rows = baseMetrics.map((m) => {
          const values: Record<string, string> = {};
          for (const ds of datasetOrder) {
            const raw =
              m.key === 'num_datapoints' ? byDataset[ds]?.num_dtps :
                m.key === 'num_missing' ? byDataset[ds]?.num_na :
                  byDataset[ds]?.num_total;
            values[ds] = this.fmtCount(raw);
          }
          return { metric: m.label, values };
        });

        const orderedKeys = Array.from(enumMap.keys()).filter((key) => countsKeys.has(key));
        const remainingKeys = Array.from(countsKeys).filter((key) => !enumMap.has(key));
        const countOrder = orderedKeys.concat(remainingKeys);

        countOrder.forEach((key) => {
          const label = enumMap.get(key) ?? key;
          const values: Record<string, string> = {};
          for (const ds of datasetOrder) {
            const raw = byDataset[ds]?.counts?.[key];
            values[ds] = this.fmtCount(raw);
          }
          rows.push({ metric: label, values });
        });
      } else {
        const countKeys = new Set(['num_datapoints', 'num_missing', 'num_total']);
        rows = this.METRIC_ORDER.map(m => {
          const values: Record<string, string> = {};
          for (const ds of datasetOrder) {
            const raw =
              m.key === 'num_datapoints' ? byDataset[ds]?.num_dtps :
                m.key === 'num_missing' ? byDataset[ds]?.num_na :
                  m.key === 'num_total' ? byDataset[ds]?.num_total :
                    m.key === 'std' ? byDataset[ds]?.std :
                      m.key === 'q2' ? byDataset[ds]?.q2 :
                        byDataset[ds]?.[m.key];

            values[ds] = countKeys.has(m.key) ? this.fmtCount(raw) : this.fmt(raw);
          }
          return { metric: m.label, values };
        });
      }

      result.push({ name: varName, columns: datasetOrder, rows });
    }

    return result;
  }

  async exportAllDescriptiveToPDF(): Promise<void> {
    this.isExporting = true;
    try {
      const numericCharts = document.querySelectorAll(
        '.hidden-charts-for-export .numeric-charts-export app-chart-renderer'
      ) as NodeListOf<HTMLElement>;

      const nominalCharts = document.querySelectorAll(
        '.hidden-charts-for-export .nominal-charts-export app-chart-renderer'
      ) as NodeListOf<HTMLElement>;

      const dataModel = this.expStudioService.selectedDataModel();
      const pathologyName = dataModel?.label || dataModel?.code || '';

      await this.pdfExportService.exportDescriptiveStatisticsPdf({
        pathologyName,
        variables: this.processedData,
        models: this.modelData,
        charts: numericCharts,
        nonNominalVariables: this.nonNominalVariables,
        nominalCharts: nominalCharts,
        nominalVariables: this.nominalVariables,
        mipVersion: this.mipVersion
      });
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      this.isExporting = false;
    }
  }

  toggleAccordion(name: string): void {
    this.openAccordions[name] = !this.openAccordions[name];
  }

  isAccordionOpen(name: string): boolean {
    return !!this.openAccordions[name];
  }

  expandAll(): void {
    const data = this.activeTab === 'Variables' ? this.processedData : this.modelData;
    if (!data?.length) return;
    data.forEach((v: any) => (this.openAccordions[v.name] = true));
  }

  collapseAll(): void {
    const data = this.activeTab === 'Variables' ? this.processedData : this.modelData;
    if (!data?.length) return;
    data.forEach((v: any) => (this.openAccordions[v.name] = false));
  }

}
