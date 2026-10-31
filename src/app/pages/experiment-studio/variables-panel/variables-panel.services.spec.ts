import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { D3HierarchyNode, DataModel } from '../../../models/data-model.interface';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { VariableCatalogService } from './variable-catalog.service';
import { VariableHistogramService } from './variable-histogram.service';
import { VariableSelectionService } from './variable-selection.service';

type StudioStub = {
  selectedDataModel: ReturnType<typeof signal<DataModel | null>>;
  selectedVariables: ReturnType<typeof signal<D3HierarchyNode[]>>;
  selectedDatasets: ReturnType<typeof signal<string[]>>;
  availableDatasets: ReturnType<typeof signal<{ code: string; label: string }[]>>;
  unavailableVariables: ReturnType<typeof signal<ReadonlyMap<string, readonly string[]>>>;
  getAllDataModels: Mock;
  categorizeDataModels: Mock;
  convertToD3Hierarchy: Mock;
  updateAvailableDatasets: Mock;
  getAlgorithmResults: Mock;
  getDatasetLabelMap: Mock;
  setVariables: Mock;
  setSelectedDatasets: Mock;
  addVariableAndEnrich: Mock;
  clearSelectionsForDataModelChange: Mock;
  editingExistingExperiment: () => boolean;
};

const age: D3HierarchyNode = { code: 'age_value', label: 'Age', type: 'real' };
const sex: D3HierarchyNode = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F' }, { code: 'M' }] };
const flushRequests = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('variables panel services', () => {
  let studio: StudioStub;
  let guideState: { setSelectedHierarchyNode: Mock };
  let catalog: VariableCatalogService;
  let histogram: VariableHistogramService;
  let selection: VariableSelectionService;

  beforeEach(() => {
    studio = {
      selectedDataModel: signal<DataModel | null>(null),
      selectedVariables: signal<D3HierarchyNode[]>([]),
      selectedDatasets: signal<string[]>(['dataset-a']),
      availableDatasets: signal<{ code: string; label: string }[]>([]),
      unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
      getAllDataModels: vi.fn().mockReturnValue(of([])),
      categorizeDataModels: vi.fn((models: DataModel[]) => ({
        crossSectional: models.filter((model) => !model.longitudinal),
        longitudinal: models.filter((model) => model.longitudinal),
      })),
      convertToD3Hierarchy: vi.fn((model: DataModel) => ({
        hierarchy: { code: model.code, label: model.label, children: [age, sex] },
        allVariables: [age, sex],
        allDatasets: [],
      })),
      updateAvailableDatasets: vi.fn(() => studio.availableDatasets.set([{ code: 'dataset-a', label: 'Dataset A' }])),
      getAlgorithmResults: vi.fn().mockReturnValue(of({ result: { histogram: [] } })),
      getDatasetLabelMap: vi.fn().mockReturnValue({ 'dataset-a': 'Dataset A' }),
      setVariables: vi.fn(),
      setSelectedDatasets: vi.fn(),
      addVariableAndEnrich: vi.fn(),
      clearSelectionsForDataModelChange: vi.fn(),
      editingExistingExperiment: () => false,
    };
    guideState = { setSelectedHierarchyNode: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        VariableCatalogService,
        VariableHistogramService,
        VariableSelectionService,
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ExperimentStudioGuideStateService, useValue: guideState },
      ],
    });
    catalog = TestBed.inject(VariableCatalogService);
    histogram = TestBed.inject(VariableHistogramService);
    selection = TestBed.inject(VariableSelectionService);
  });

  describe('VariableCatalogService', () => {
    const stroke = { uuid: '1', code: 'stroke', label: 'Stroke', version: '3.7', released: true } as DataModel;
    const dementia = { uuid: '2', code: 'dementia', label: 'Dementia', version: '1', released: true } as DataModel;

    it('auto-selects all available datasets on a fresh session with no valid selection', () => {
      studio.selectedDatasets.set([]);
      catalog.availableDatasets.set([{ code: 'ds-a', label: 'Dataset A' }, { code: 'ds-b', label: 'Dataset B' }]);

      catalog.ensureDatasetsSelected();

      expect(studio.setSelectedDatasets).toHaveBeenCalledWith(['ds-a', 'ds-b']);
    });

    it('keeps a valid existing selection instead of re-selecting all', () => {
      studio.selectedDatasets.set(['ds-b']);
      catalog.availableDatasets.set([{ code: 'ds-a', label: 'Dataset A' }, { code: 'ds-b', label: 'Dataset B' }]);

      catalog.ensureDatasetsSelected();

      expect(studio.setSelectedDatasets).not.toHaveBeenCalled();
    });

    it('does not auto-select datasets when editing an existing experiment', () => {
      studio.selectedDatasets.set([]);
      studio.editingExistingExperiment = () => true;
      catalog.availableDatasets.set([{ code: 'ds-a', label: 'Dataset A' }]);

      catalog.ensureDatasetsSelected();

      expect(studio.setSelectedDatasets).not.toHaveBeenCalled();
    });

    it('keeps the selected pathology when it is still offered, else picks the first', () => {
      studio.selectedDataModel.set({ ...stroke });
      catalog.setDataModels([dementia, stroke]);
      expect(studio.selectedDataModel()).toBe(stroke);

      studio.selectedDataModel.set({ ...stroke, version: '4.0' });
      catalog.setDataModels([dementia, stroke]);
      expect(studio.selectedDataModel()).toBe(dementia);
      expect(catalog.crossSectionalModels()).toEqual([dementia, stroke]);
    });

    it('does not swap the pathology of an experiment being edited', () => {
      studio.editingExistingExperiment = () => true;
      studio.selectedDataModel.set({ ...stroke, version: '4.0' });
      catalog.setDataModels([dementia]);
      expect(studio.selectedDataModel()).toBeNull();
    });

    it('builds the tree and dataset options of the selected pathology', () => {
      studio.selectedDataModel.set(stroke);
      studio.selectedDatasets.set([]);

      catalog.loadHierarchy();

      expect(catalog.hierarchy()?.children).toEqual([age, sex]);
      expect(catalog.availableDatasets()).toEqual([{ code: 'dataset-a', label: 'Dataset A' }]);
      expect(studio.setSelectedDatasets).toHaveBeenCalledWith(['dataset-a']);
    });

    it('reports the selected dataset count from the studio service', () => {
      expect(catalog.selectedDatasetCount()).toBe(1);
      studio.selectedDatasets.set(['dataset-a', 'dataset-b']);
      expect(catalog.selectedDatasetCount()).toBe(2);
    });
  });

  describe('VariableSelectionService', () => {
    it('does not move the highlight or add on a single map click', () => {
      selection.pickInMap(age);

      expect(selection.selectedNode()).toEqual(age);
      expect(selection.highlightNode()).toBeNull();
      expect(studio.addVariableAndEnrich).not.toHaveBeenCalled();
    });

    it('keeps double click as the explicit add action', () => {
      selection.pickAndAdd(age);

      expect(selection.selectedNode()).toEqual(age);
      expect(studio.addVariableAndEnrich).toHaveBeenCalledWith(age);
    });

    it('adds the selected node when it is not in the pool', () => {
      selection.selectedNode.set(age);

      selection.togglePool();

      expect(studio.addVariableAndEnrich).toHaveBeenCalledWith(age);
      expect(studio.setVariables).not.toHaveBeenCalled();
    });

    it('removes the selected node when it is already in the pool', () => {
      studio.selectedVariables.set([age, { code: 'sex_value', label: 'Sex', type: 'string' }]);
      selection.selectedNode.set(age);

      selection.togglePool();

      expect(studio.setVariables).toHaveBeenCalledWith([{ code: 'sex_value', label: 'Sex', type: 'string' }]);
      expect(studio.addVariableAndEnrich).not.toHaveBeenCalled();
    });

    it('ignores clicks, double clicks and search picks on an unavailable variable', () => {
      studio.unavailableVariables.set(new Map([['age_value', ['Dataset A']]]));

      selection.pickInMap(age);
      selection.pickInBrowser(age);
      selection.pickAndAdd(age);

      expect(selection.selectedNode()).toBeNull();
      expect(selection.highlightNode()).toBeNull();
      expect(studio.addVariableAndEnrich).not.toHaveBeenCalled();
    });

    it('adds only the available variables of a group', () => {
      studio.unavailableVariables.set(new Map([['sex_value', ['Dataset A']]]));
      const sexValue = { code: 'sex_value', label: 'Sex', type: 'string' };
      selection.selectedNode.set({ code: 'demo', label: 'Demographics', children: [age, sexValue] });

      selection.togglePool();

      expect(studio.addVariableAndEnrich).toHaveBeenCalledTimes(1);
      expect(studio.addVariableAndEnrich).toHaveBeenCalledWith(age);
    });

    it('disables Add when every variable of the selection is unavailable', () => {
      studio.unavailableVariables.set(new Map([['age_value', ['Dataset A']]]));
      selection.selectedNode.set(age);

      expect(selection.poolToggleDisabled()).toBe(true);
      expect(selection.poolToggleTitle()).toBe('Not available in the selected datasets');
      selection.togglePool();
      expect(studio.addVariableAndEnrich).not.toHaveBeenCalled();
    });

    it('still removes a pooled variable that became unavailable', () => {
      studio.selectedVariables.set([age]);
      studio.unavailableVariables.set(new Map([['age_value', ['Dataset A']]]));
      selection.selectedNode.set(age);

      expect(selection.poolToggleDisabled()).toBe(false);
      selection.togglePool();
      expect(studio.setVariables).toHaveBeenCalledWith([]);
    });

    it('ignores the pool toggle when no datasets are selected', () => {
      studio.selectedDatasets.set([]);
      selection.selectedNode.set(age);

      selection.togglePool();

      expect(selection.poolToggleTitle()).toBe('Select datasets first');
      expect(studio.addVariableAndEnrich).not.toHaveBeenCalled();
      expect(studio.setVariables).not.toHaveBeenCalled();
    });

    it('resets the details panel to the Chart tab on every new selection', () => {
      selection.activeDetailsTab.set('info');
      selection.select(age);
      expect(selection.activeDetailsTab()).toBe('histogram');

      selection.activeDetailsTab.set('info');
      selection.select({ code: 'acute_treatment', label: 'Acute treatment', children: [age] });
      expect(selection.activeDetailsTab()).toBe('histogram');
    });

    it('ignores a repeat pick of the selected node', () => {
      selection.select(age);
      studio.getAlgorithmResults.mockClear();

      selection.select({ ...age });

      expect(studio.getAlgorithmResults).not.toHaveBeenCalled();
    });

    it('selects a pool chip with its highlight, and ignores a chip without a code', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      selection.pickPoolVariable({ label: 'Broken' } as D3HierarchyNode);
      expect(selection.selectedNode()).toBeNull();
      expect(warn).toHaveBeenCalled();

      selection.pickPoolVariable(age);
      expect(selection.highlightNode()).toBe(age);
      expect(selection.selectedNode()).toEqual(age);
    });

    it('shares the Add / Remove state with the pool', () => {
      selection.selectedNode.set(age);
      expect(selection.isSelectedNodeInPool()).toBe(false);
      studio.selectedVariables.set([age]);
      expect(selection.isSelectedNodeInPool()).toBe(true);
      expect(selection.poolToggleTitle()).toBe('Remove the selected variable from this experiment');
    });

    it('shows a pathology once and selects its root', () => {
      const stroke = { uuid: '1', code: 'stroke', label: 'Stroke', version: '3.7', released: true } as DataModel;
      studio.selectedDataModel.set(stroke);

      selection.showDataModel(stroke);
      selection.showDataModel({ ...stroke });

      expect(studio.convertToD3Hierarchy).toHaveBeenCalledTimes(1);
      expect(selection.selectedNode()?.code).toBe('stroke');
      expect(guideState.setSelectedHierarchyNode).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'stroke' }));
    });

    it('clears the view when the shown pathology goes away', () => {
      const stroke = { uuid: '1', code: 'stroke', label: 'Stroke', version: '3.7', released: true } as DataModel;
      studio.selectedDataModel.set(stroke);
      selection.showDataModel(stroke);

      selection.showDataModel(null);

      expect(catalog.hierarchy()).toBeNull();
      expect(selection.selectedNode()).toBeNull();
      expect(guideState.setSelectedHierarchyNode).toHaveBeenLastCalledWith(null);
    });

    it('switches pathology only for a different one', () => {
      const stroke = { uuid: '1', code: 'stroke', label: 'Stroke', version: '3.7', released: true } as DataModel;
      studio.selectedDataModel.set(stroke);

      expect(selection.changeDataModel({ ...stroke })).toBe(false);
      expect(selection.changeDataModel(null)).toBe(false);
      expect(studio.clearSelectionsForDataModelChange).not.toHaveBeenCalled();

      const dementia = { uuid: '2', code: 'dementia', label: 'Dementia', version: '1', released: true } as DataModel;
      expect(selection.changeDataModel(dementia)).toBe(true);
      expect(studio.selectedDataModel()).toBe(dementia);
      expect(studio.clearSelectionsForDataModelChange).toHaveBeenCalled();
      expect(catalog.hierarchy()?.code).toBe('dementia');
    });

    it('clears the view when the backend offers no pathology', () => {
      catalog.hierarchy.set({ code: 'stroke', label: 'Stroke' });
      selection.selectedNode.set(age);

      selection.loadDataModels();

      expect(studio.selectedDataModel()).toBeNull();
      expect(catalog.hierarchy()).toBeNull();
      expect(selection.selectedNode()).toBeNull();
    });
  });

  describe('VariableHistogramService', () => {
    it('offers Dataset plus selected nominal variables as splits and hides them for nominal plots', () => {
      studio.selectedVariables.set([{ code: 'age', label: 'Age', type: 'real' }, sex]);

      histogram.show({ code: 'age', label: 'Age', type: 'real' });
      expect(histogram.canSplitHistogram()).toBe(true);
      expect(histogram.histogramSplitOptions().map((option) => option.code)).toEqual(['dataset', 'sex']);

      histogram.show(sex);
      expect(histogram.canSplitHistogram()).toBe(false);
    });

    it('offers an unavailable split grayed out and disabled, and keeps an active one', () => {
      studio.selectedVariables.set([{ code: 'age', label: 'Age', type: 'real' }, sex]);
      histogram.show({ code: 'age', label: 'Age', type: 'real' });
      histogram.histogramSplit.set('sex');
      TestBed.tick();

      studio.unavailableVariables.set(new Map([['sex', ['Dataset B']]]));
      TestBed.tick();

      const option = histogram.histogramSplitOptions().find((item) => item.code === 'sex');
      expect(option).toEqual(expect.objectContaining({ disabled: true, unavailable: true, title: 'Not available in: Dataset B' }));
      expect(histogram.histogramSplit()).toBe('sex');

      const requests = studio.getAlgorithmResults.mock.calls.length;
      histogram.histogramSplit.set('');
      histogram.selectSplit('sex');
      expect(histogram.histogramSplit()).toBe('');
      expect(studio.getAlgorithmResults.mock.calls.length).toBe(requests + 1);
      expect(studio.getAlgorithmResults.mock.calls.at(-1)?.[5]).toBeUndefined();
    });

    it('caps Dataset split by the selected dataset count, not the enumeration map', () => {
      studio.getDatasetLabelMap.mockReturnValue(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`ds${i}`, `D${i}`])));
      studio.selectedDatasets.set(['ds0', 'ds1']);
      histogram.show({ code: 'age', label: 'Age', type: 'real' });
      expect(histogram.histogramSplitOptions().find((option) => option.code === 'dataset')?.disabled).toBe(false);

      studio.selectedDatasets.set(Array.from({ length: 9 }, (_, i) => `ds${i}`));
      expect(histogram.histogramSplitOptions().find((option) => option.code === 'dataset')?.disabled).toBe(true);
    });

    it('re-requests the histogram with grouping when split by dataset', async () => {
      studio.getAlgorithmResults.mockImplementation(() => of({
        result: {
          histogram: [
            { var: 'age_value', grouping_var: null, grouping_enum: null, bins: ['0', '10'], counts: [12, 8] },
            { var: 'age_value', grouping_var: 'dataset', grouping_enum: 'dataset-a', bins: ['0', '10'], counts: [7, 5] },
          ],
        },
      }));
      catalog.hierarchy.set({ code: 'stroke', label: 'Stroke 3.7' });
      histogram.show(age);
      await flushRequests();
      histogram.selectSplit('dataset');
      await flushRequests();

      expect(studio.getAlgorithmResults).toHaveBeenLastCalledWith('histogram', ['age_value'], null, undefined, undefined, ['dataset']);
      expect(histogram.histogramData()).toEqual(expect.objectContaining({
        counts: [12, 8],
        splitLabel: 'Dataset',
        groups: [expect.objectContaining({ key: 'dataset-a', label: 'Dataset A', counts: [7, 5] })],
      }));
    });

    it('labels nominal bins with their enumeration labels', async () => {
      const sexNode = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F', label: 'Female' }, { code: 'M', label: 'Male' }] };
      catalog.hierarchy.set({ code: 'stroke', label: 'Stroke', children: [sexNode] });
      studio.getAlgorithmResults.mockReturnValue(of({ result: { histogram: [{ var: 'sex', bins: ['F', 'M'], counts: [3, 4] }] } }));

      histogram.show(sexNode);
      await flushRequests();

      expect(histogram.histogramData()).toEqual(expect.objectContaining({ bins: ['Female', 'Male'], variableName: 'Sex', variableType: 'nominal' }));
    });

    it('drops a split whose variable leaves the pool and re-requests the unsplit histogram', async () => {
      studio.selectedVariables.set([sex]);
      histogram.show(age);
      histogram.selectSplit('sex');
      expect(histogram.histogramSplit()).toBe('sex');

      studio.selectedVariables.set([]);
      TestBed.tick();

      expect(histogram.histogramSplit()).toBe('');
      expect(studio.getAlgorithmResults).toHaveBeenLastCalledWith('histogram', ['age_value'], null, undefined, undefined, undefined);
    });

    it('warns when privacy-null edge bins were trimmed on a numeric histogram', () => {
      histogram.plottedVariable.set(age);
      histogram.histogramData.set({ bins: ['0', '10', '20', '30'], counts: [null, 8, 12, null], variableName: 'Age' });

      expect(histogram.histogramPrivacyTrimNote()).toContain('Values below 10 / above 30 hidden');
    });

    it('does not warn about trimmed edges on a nominal histogram', () => {
      histogram.plottedVariable.set(sex);
      histogram.histogramData.set({ bins: ['F', 'M'], counts: [null, 8], variableName: 'Sex' });

      expect(histogram.histogramPrivacyTrimNote()).toBeNull();
    });

    it('builds a group census chart for the pathology root', () => {
      const root = {
        code: 'stroke',
        label: 'Stroke 3.7',
        children: [
          { code: 'g1', label: 'Acute treatment', children: [{ code: 'a', label: 'A', value: 1 }] },
          { code: 'g2', label: 'Hospitalization', children: [{ code: 'b', label: 'B', value: 1 }, { code: 'c', label: 'C', value: 1 }] },
        ],
      };
      catalog.hierarchy.set(root);
      histogram.show(root);

      expect(histogram.groupHistogramData()).toEqual({ bins: ['Hospitalization', 'Acute treatment'], counts: [2, 1], variableName: 'Stroke 3.7' });
      expect(histogram.groupHistogramMeta()).toEqual({ pathNodes: [{ code: 'stroke', label: 'Stroke 3.7' }], groupCount: 2, hasGroups: true });
      expect(studio.getAlgorithmResults).not.toHaveBeenCalled();
    });

    it('prompts to pick a variable when a group holds only variables', () => {
      const group = { code: 'g1', label: 'Acute treatment', children: [{ code: 'a', label: 'A', type: 'real' }, { code: 'b', label: 'B', type: 'real' }] };
      catalog.hierarchy.set({ code: 'stroke', label: 'Stroke 3.7', children: [group] });

      histogram.show(group);

      expect(histogram.groupHistogramData()).toBeNull();
      expect(histogram.emptyChartMessage()).toBe(
        'Please select one of the variables in the representation on the left to see its histogram in the selected centers.',
      );
      expect(histogram.errorMessage()).toBeNull();
      expect(histogram.isLoadingHistogram()).toBe(false);
      expect(histogram.groupHistogramMeta()).toEqual(expect.objectContaining({ groupCount: 2, hasGroups: false }));
    });

    it('says so when nothing is selected', () => {
      histogram.show(age);
      histogram.showNothingSelected();

      expect(histogram.plottedVariable()).toBeNull();
      expect(histogram.errorMessage()).toBe('No variable selected.');
      expect(histogram.isLoadingHistogram()).toBe(false);
    });

    it('shows a neutral empty message when a leaf has no distribution data', async () => {
      histogram.show(age);
      await flushRequests();

      expect(histogram.emptyChartMessage()).toBe('No distribution for this selection.');
      expect(histogram.errorMessage()).toBeNull();
      expect(histogram.isLoadingHistogram()).toBe(false);
    });

    it('shows the backend insufficient-data message neutrally instead of as an error', async () => {
      studio.getAlgorithmResults.mockReturnValue(of({ result: { data: 'insufficient data' } }));

      histogram.show(age);
      await flushRequests();

      expect(histogram.emptyChartMessage()).toBe('This variable does not have sufficient data.');
      expect(histogram.errorMessage()).toBeNull();
    });

    it('keeps a red error message when the histogram request fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      studio.getAlgorithmResults.mockReturnValue(throwError(() => new Error('network')));

      histogram.show(age);
      await flushRequests();

      expect(histogram.errorMessage()).toBe('Error loading histogram. Please try again.');
      expect(histogram.emptyChartMessage()).toBeNull();
    });
  });
});
