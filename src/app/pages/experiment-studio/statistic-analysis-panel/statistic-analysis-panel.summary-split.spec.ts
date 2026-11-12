import type { MockedObject } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { of } from 'rxjs';
import { createPanelFixture } from './summary-workspace.testing';

describe('StatisticAnalysisPanelComponent summary chart splits', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: MockedObject<ExperimentStudioService>;
    let mockChartBuilder: MockedObject<ChartBuilderService>;

    beforeEach(async () => {
        ({ component, fixture, mockExpService, mockChartBuilder } = await createPanelFixture());
    });

    function configureRawSummary() {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = {
            code: 'sex', label: 'Sex', type: 'nominal',
            enumerations: [{ code: 'female', label: 'Female' }, { code: 'male', label: 'Male' }],
        };
        mockExpService.loadDescriptiveOverview.mockReturnValue(of({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 20, num_na: 0, num_total: 20, mean: 71, q1: 60, q2: 72, q3: 80, min: 20, max: 99, std: 11 } },
                    { dataset: 'dataset-a', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 70, q1: 59, q2: 71, q3: 79, min: 20, max: 98, std: 11 } },
                    { dataset: 'dataset-b', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 72, q1: 61, q2: 73, q3: 81, min: 25, max: 99, std: 12 } },
                    { dataset: 'all datasets', variable: 'sex', data: { counts: { female: 6, male: 4 }, num_dtps: 10, num_na: 1, num_total: 11 } },
                    { dataset: 'dataset-a', variable: 'sex', data: { counts: { female: 3, male: 2 }, num_dtps: 5, num_na: 0, num_total: 5 } },
                ],
            },
        }));
        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();
        component.goToSection('raw');
        fixture.detectChanges();
    }

    it('offers the histogram split for categorical variables too', () => {
        configureRawSummary();

        const nominal = component.statisticBlocks('raw', 'nominal');
        const numeric = component.statisticBlocks('raw', 'numeric');
        expect(nominal.length).toBeGreaterThan(0);
        expect(numeric.length).toBeGreaterThan(0);
        expect(component.canSplitSummaryHistogram(nominal[0])).toBe(true);
        expect(component.canSplitSummaryHistogram(numeric[0])).toBe(true);
    });

    it('plots the pooled "all datasets" box next to the per-dataset boxes', () => {
        configureRawSummary();

        const describeCalls = mockChartBuilder.getChartsForAlgorithm.mock.calls
            .filter(([algorithm]) => algorithm === 'describe');
        expect(describeCalls.length).toBeGreaterThan(0);
        const datasets = describeCalls.flatMap(([, response]) =>
            ((response as any)?.result?.featurewise ?? []).map((row: any) => row.dataset));
        expect(datasets).toContain('all datasets');
        expect(datasets).toContain('dataset-a');
    });
});
