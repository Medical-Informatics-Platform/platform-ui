import type { MockedObject } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { createPanelFixture } from './summary-workspace.testing';

describe('StatisticAnalysisPanelComponent transformation card open state', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: MockedObject<ExperimentStudioService>;

    beforeEach(async () => {
        ({ component, fixture, mockExpService } = await createPanelFixture());
    });

    /** What the real store does after any applied change: a new applied config re-runs hydration. */
    function echoAppliedConfig(marker: number): void {
        mockExpService.getAppliedDescriptivePreprocessing.mockReturnValue({});
        (mockExpService.appliedPreprocessingConfig as any).set({ marker });
        fixture.detectChanges();
    }

    function stepId(name: string): string {
        return (mockExpService.appliedTransformations() as any[]).find((step) => step.name === name)!.id;
    }

    it('keeps a folded nominal column folded when the applied config is re-read', () => {
        component.chooseTransformation('categorical');
        fixture.detectChanges();
        const id = stepId('categorical_column_creator');
        component.toggleTransformationDraft(component.draftForStep(id)!, false);
        expect(component.draftForStep(id)?.open).toBe(false);

        echoAppliedConfig(1);
        echoAppliedConfig(2);

        expect(component.draftForStep(id)?.open).toBe(false);
    });

    it('opens only the newly chosen transformation and folds the others', () => {
        component.chooseTransformation('categorical');
        fixture.detectChanges();
        const categoricalId = stepId('categorical_column_creator');

        component.chooseTransformation('kmeans');
        fixture.detectChanges();
        const kmeansId = stepId('kmeans_cluster_creator');

        expect(component.draftForStep(categoricalId)?.open).toBe(false);
        expect(component.isCardOpen(kmeansId)).toBe(true);

        component.chooseTransformation('categorical');
        fixture.detectChanges();
        expect(component.isCardOpen(kmeansId)).toBe(false);
        expect(component.draftForStep(categoricalId)?.open).toBe(false);
        const newest = component.transformationDrafts[component.transformationDrafts.length - 1];
        expect(newest.id).not.toBe(categoricalId);
        expect(newest.open).toBe(true);
    });

    it('restores stored nominal columns folded', () => {
        (mockExpService.appliedTransformations as any).set([{
            id: 'stored-1',
            name: 'categorical_column_creator',
            parameters: {
                new_column_names: ['age_band'],
                rules: { old: { condition: 'AND', rules: [{ id: 'age', field: 'age', type: 'real', input: 'number', operator: 'greater', value: 65 }] } },
                default_enumeration: null,
            },
        }]);
        echoAppliedConfig(3);

        expect(component.draftForStep('stored-1')).toBeDefined();
        expect(component.draftForStep('stored-1')?.open).toBe(false);
    });

    it('does not show the "Otherwise" fallback row in a nominal column card', () => {
        component.addStep('transformation');
        component.chooseTransformation('categorical');
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector('.transformation-rules')).not.toBeNull();
        expect(host.querySelector('.transformation-rule-fallback')).toBeNull();
        expect(host.textContent).not.toContain('Otherwise — records that match no rule');
        expect(host.textContent).not.toContain('+ fallback');
    });
});
