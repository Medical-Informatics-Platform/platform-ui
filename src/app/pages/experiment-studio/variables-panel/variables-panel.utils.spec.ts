import { D3HierarchyNode } from '../../../models/data-model.interface';
import {
  buildGroupCensus,
  collectLeafNodes,
  describeGroup,
  enumerationLabel,
  findNodeByCode,
  isInsufficientDataResponse,
  labelHistogramBins,
  pathToNode,
  studyContextTitle,
} from './variables-panel.utils';

const age: D3HierarchyNode = { code: 'age', label: 'Age', type: 'real' };
const sex: D3HierarchyNode = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F', label: 'Female' }, { code: 'M', label: 'Male' }] };
const inr: D3HierarchyNode = { code: 'inr', label: 'INR', type: 'real' };
const demographics: D3HierarchyNode = { code: 'demo', label: 'Demographics', children: [age, sex] };
const labs: D3HierarchyNode = { code: 'labs', label: 'Labs', children: [inr] };
const root: D3HierarchyNode = { code: 'stroke', label: 'Stroke 3.7', children: [demographics, labs] };

describe('variables-panel utils', () => {
  describe('findNodeByCode', () => {
    it('finds nested nodes and the root, and returns null otherwise', () => {
      expect(findNodeByCode(root, 'sex')).toBe(sex);
      expect(findNodeByCode(root, 'stroke')).toBe(root);
      expect(findNodeByCode(root, 'missing')).toBeNull();
      expect(findNodeByCode(null, 'age')).toBeNull();
    });
  });

  describe('collectLeafNodes', () => {
    it('returns the variables under a group, in order', () => {
      expect(collectLeafNodes(root)).toEqual([age, sex, inr]);
    });

    it('returns a variable itself', () => {
      expect(collectLeafNodes(age)).toEqual([age]);
    });
  });

  describe('pathToNode', () => {
    it('walks from the root to the node', () => {
      expect(pathToNode(root, sex).map((step) => step.label)).toEqual(['Stroke 3.7', 'Demographics', 'Sex']);
    });

    it('collapses consecutive duplicate breadcrumb labels', () => {
      const tree: D3HierarchyNode = { code: 'stroke', label: 'Stroke 3.7', children: [{ code: 'g', label: 'Stroke 3.7', children: [inr] }] };
      expect(pathToNode(tree, inr).map((step) => step.label)).toEqual(['Stroke 3.7', 'INR']);
      expect(pathToNode(tree, { code: 'stroke', label: 'Stroke 3.7' }).map((step) => step.label)).toEqual(['Stroke 3.7']);
    });

    it('gives a node outside the tree a one-step path, and an empty path to nothing', () => {
      expect(pathToNode(root, { code: 'x', label: 'X' })).toEqual([{ code: 'x', label: 'X' }]);
      expect(pathToNode(root, null)).toEqual([]);
      expect(pathToNode(root, { label: 'Loose' } as D3HierarchyNode)).toEqual([{ code: '', label: 'Loose' }]);
    });
  });

  describe('group census', () => {
    it('censuses child groups by variable count, largest first', () => {
      const { hasGroups, items } = describeGroup(root);
      expect(hasGroups).toBe(true);
      expect(items).toEqual([demographics, labs]);
      expect(buildGroupCensus(root, items)).toEqual({
        bins: ['Demographics', 'Labs'],
        counts: [2, 1],
        variableName: 'Stroke 3.7',
      });
    });

    it('lists the variables of a group that holds no groups', () => {
      expect(describeGroup(demographics)).toEqual({ hasGroups: false, items: [age, sex] });
    });
  });

  describe('labelHistogramBins', () => {
    it('labels coded bins and stringifies the rest', () => {
      expect(labelHistogramBins(['F', 'M', 'X'], sex.enumerations)).toEqual(['Female', 'Male', 'X']);
      expect(labelHistogramBins([0, 10], undefined)).toEqual(['0', '10']);
    });
  });

  describe('enumerationLabel', () => {
    it('labels an enumerated value', () => {
      expect(enumerationLabel('M', sex.enumerations)).toBe('Male');
      expect(enumerationLabel('Z', sex.enumerations)).toBeNull();
      expect(enumerationLabel(null, sex.enumerations)).toBeNull();
      expect(enumerationLabel('M', [])).toBeNull();
    });
  });

  it('recognises the backend insufficient-data answer', () => {
    expect(isInsufficientDataResponse({ result: { data: 'insufficient data' } })).toBe(true);
    expect(isInsufficientDataResponse({ data: 'Error: insufficient data for age' })).toBe(true);
    expect(isInsufficientDataResponse({ result: { histogram: [] } })).toBe(false);
    expect(isInsufficientDataResponse(null)).toBe(false);
  });

  it('titles the study context chip', () => {
    expect(studyContextTitle(null, 2)).toBe('Select a pathology');
    expect(studyContextTitle('Stroke 3.7', 1)).toBe('Stroke 3.7 · 1 dataset');
    expect(studyContextTitle('Stroke 3.7', 2)).toBe('Stroke 3.7 · 2 datasets');
    expect(studyContextTitle('Stroke 3.7', 0)).toBe('Stroke 3.7 · Select datasets');
  });
});
