import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { AlgorithmAvailabilityDetail, AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { AlgorithmCatalogService } from './algorithm-catalog.service';

const base: AlgorithmConfig = {
  name: 'anova_oneway',
  label: 'One-way ANOVA',
  description: '',
  category: 'Group comparison',
  requiredVariable: [],
  covariate: [],
  configSchema: [],
  isDisabled: false,
};

const detail = (messages: string[]): AlgorithmAvailabilityDetail => ({
  role: 'y',
  label: 'Outcome',
  selectedCount: 0,
  minCount: 1,
  maxCount: 1,
  required: true,
  types: [],
  stattypes: [],
  messages,
  satisfied: messages.length === 0,
});

describe('AlgorithmCatalogService', () => {
  let studio: {
    selectedAlgorithm: ReturnType<typeof signal<AlgorithmConfig | null>>;
    availableGroupedAlgorithms: ReturnType<typeof signal<Record<string, AlgorithmConfig[]>>>;
    isAlgorithmAvailable: ReturnType<typeof vi.fn>;
    getAlgorithmAvailability: ReturnType<typeof vi.fn>;
  };
  let service: AlgorithmCatalogService;

  beforeEach(() => {
    studio = {
      selectedAlgorithm: signal<AlgorithmConfig | null>(null),
      availableGroupedAlgorithms: signal<Record<string, AlgorithmConfig[]>>({
        'Group comparison': [base, { ...base, name: 'kruskal', label: 'Kruskal-Wallis' }],
        Association: [{ ...base, name: 'correlation', label: 'Correlation', isDisabled: true }],
      }),
      isAlgorithmAvailable: vi.fn().mockReturnValue(true),
      getAlgorithmAvailability: vi.fn().mockReturnValue({ available: true, summary: '', details: [] }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        AlgorithmCatalogService,
      ],
    });
    service = TestBed.inject(AlgorithmCatalogService);
  });

  it('counts and filters methods by the Runnable/All switch and search text', () => {
    expect(service.algoCounts()).toEqual({ all: 3, active: 2 });
    expect(service.filteredAlgorithmCategories().map((category) => category.name)).toEqual(['Group comparison']);

    service.toggleActiveOnly();
    expect(service.filteredAlgorithmCategories().map((category) => category.name)).toEqual(['Group comparison', 'Association']);

    service.algoSearchQuery.set('kruskal');
    expect(service.searchActive()).toBe(true);
    expect(service.filteredAlgorithmCategories().flatMap((category) => category.algorithms.map((a) => a.name))).toEqual(['kruskal']);

    service.clearSearch();
    expect(service.searchActive()).toBe(false);
  });

  it('keeps a group the user toggled as they left it when the selection moves', () => {
    service.toggleActiveOnly();
    expect(service.isCategoryOpen('Group comparison')).toBe(true);
    expect(service.isCategoryOpen('Association')).toBe(false);

    service.toggleCategory('Association');
    service.toggleCategory('Group comparison');
    expect(service.isCategoryOpen('Association')).toBe(true);
    expect(service.isCategoryOpen('Group comparison')).toBe(false);

    // Selecting a method opens its group, without closing the one the user opened.
    studio.selectedAlgorithm.set(base);
    expect(service.isCategoryOpen('Group comparison')).toBe(true);
    expect(service.isCategoryOpen('Association')).toBe(true);
  });

  it('words why a method is unavailable from its summary, else its first failed check', () => {
    studio.getAlgorithmAvailability.mockReturnValue({ available: false, summary: 'Outcome type must be one of text.', details: [] });
    expect(service.algorithmUnavailableReason(base)).toBe('Outcome type must be one of nominal.');

    studio.getAlgorithmAvailability.mockReturnValue({ available: false, summary: '', details: [] });
    const withDetails = { ...base, availability: { available: false, summary: '', details: [detail([]), detail(['Outcome needs at least 1, selected 0.'])] } };
    expect(service.algorithmUnavailableReason(withDetails)).toBe('Outcome needs at least 1, selected 0.');

    expect(service.algorithmUnavailableReason(base)).toBe('Unavailable');
  });

  it('reads availability checks from the method, else from the studio', () => {
    const own = [detail(['own'])];
    const studioDetails = [detail(['studio'])];
    studio.getAlgorithmAvailability.mockReturnValue({ available: false, summary: '', details: studioDetails });

    expect(service.availabilityDetails(null)).toEqual([]);
    expect(service.availabilityDetails({ ...base, availability: { available: false, summary: '', details: own } })).toBe(own);
    expect(service.availabilityDetails(base)).toBe(studioDetails);
  });

  it('marks the selected method unavailable from the studio availability', () => {
    expect(service.selectedAlgorithmUnavailable()).toBe(false);
    studio.selectedAlgorithm.set(base);
    studio.isAlgorithmAvailable.mockReturnValue(false);
    studio.selectedAlgorithm.set({ ...base });
    expect(service.selectedAlgorithmUnavailable()).toBe(true);
  });
});
