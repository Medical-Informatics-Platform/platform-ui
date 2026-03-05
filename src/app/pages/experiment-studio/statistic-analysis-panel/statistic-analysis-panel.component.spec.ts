import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { of } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';

describe('StatisticAnalysisPanelComponent', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: jasmine.SpyObj<ExperimentStudioService>;
    let mockChartBuilder: jasmine.SpyObj<ChartBuilderService>;
    let mockPdfService: jasmine.SpyObj<PdfExportService>;

    beforeEach(async () => {
        mockExpService = jasmine.createSpyObj('ExperimentStudioService', [
            'loadDescriptiveOverview',
            'setDataExclusionWarnings',
            'clearDataExclusionWarnings'
        ], {
            selectedVariables: signal([]),
            selectedCovariates: signal([]),
            selectedFilters: signal([]),
            selectedDataModel: signal(null)
        });
        mockChartBuilder = jasmine.createSpyObj('ChartBuilderService', ['getChartsForAlgorithm']);
        mockPdfService = jasmine.createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']);

        await TestBed.configureTestingModule({
            imports: [StatisticAnalysisPanelComponent], // Standalone component
            providers: [
                provideZonelessChangeDetection(),
                { provide: ExperimentStudioService, useValue: mockExpService },
                { provide: ChartBuilderService, useValue: mockChartBuilder },
                { provide: PdfExportService, useValue: mockPdfService }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should treat variable as nominal if counts are present in response, even if metadata type is missing', () => {
        // 1. Setup metadata (variable without nominal type)
        const variable = { code: 'biol_sex', label: 'Biological Sex', type: 'unknown' };
        (mockExpService.selectedVariables as any).set([variable]);

        // 2. Setup response with counts
        const response = {
            result: {
                variable_based: [
                    {
                        variable: 'biol_sex',
                        data: {
                            counts: { 'Female': 10, 'Male': 15 }, // Presence of counts
                            num_dtps: 25,
                            num_na: 0,
                            num_total: 25
                        }
                    }
                ],
                model_based: []
            }
        };
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        // 3. Trigger fetch
        component.fetchDescriptiveStatistics();

        // 4. Verify categorization
        // Should be in nominalVariables
        expect(component.nominalVariables.find(v => v.code === 'biol_sex')).toBeTruthy();
        // Should NOT be in nonNominalVariables
        expect(component.nonNominalVariables.find(v => v.code === 'biol_sex')).toBeFalsy();
        // Charts should be built for nominal
        expect(component.chartsForNominal.length).toBe(1);
    });

    it('should treat variable as nominal if metadata type is nominal', () => {
        const variable = { code: 'var_nom', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([variable]);

        const response = { result: { variable_based: [], model_based: [] } }; // Empty data
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        component.fetchDescriptiveStatistics();

        expect(component.nominalVariables.find(v => v.code === 'var_nom')).toBeTruthy();
    });

    it('should treat variable as numeric if no counts and not nominal type', () => {
        const variable = { code: 'age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);

        const response = {
            result: {
                variable_based: [
                    { variable: 'age', data: { mean: 30, std: 5 } } // No counts
                ],
                model_based: []
            }
        };
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        component.fetchDescriptiveStatistics();

        expect(component.nonNominalVariables.find(v => v.code === 'age')).toBeTruthy();
        expect(component.nominalVariables.find(v => v.code === 'age')).toBeFalsy();
    });
});
