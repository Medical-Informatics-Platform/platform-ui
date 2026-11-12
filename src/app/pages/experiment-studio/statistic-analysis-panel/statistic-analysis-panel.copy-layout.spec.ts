import type { MockedObject } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { createPanelFixture } from './summary-workspace.testing';

describe('StatisticAnalysisPanelComponent copy and step layout', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: MockedObject<ExperimentStudioService>;

    beforeEach(async () => {
        ({ component, fixture, mockExpService } = await createPanelFixture());
    });

    function host(): HTMLElement {
        return fixture.nativeElement as HTMLElement;
    }

    function alphaOf(color: string): number {
        const match = color.match(/rgba?\(([^)]+)\)/);
        if (!match) return 1;
        const parts = match[1].split(',').map((part) => part.trim());
        return parts.length === 4 ? Number(parts[3]) : 1;
    }

    it('explains the pipeline in the new wording', () => {
        const intro = host().querySelector('.pipeline-header-title-group p')?.textContent ?? '';
        expect(intro).toContain('Get your selected data ready for analysis.');
        expect(intro).toContain('Raw data is shown first as the starting point, then the steps run top to bottom — filter (optional), preprocess, and transform (optional)');
        expect(intro).toContain('Updated descriptive statistics are shown at each step when you click Preview.');
        expect(intro).not.toContain('read-only preview');
    });

    it('puts the Data Handling Pipeline heading first, then raw data, then Step 1', () => {
        const firstHeading = host().querySelector('h1, h2, h3, h4');
        expect(firstHeading?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Data Handling Pipeline');
        const headings = Array.from(host().querySelectorAll('h1, h2, h3, h4'))
            .map((el) => el.textContent?.replace(/\s+/g, ' ').trim());
        expect(headings).not.toContain('Your data');

        const source = host().querySelector('[data-guide="analysis-source-data"]');
        const filters = host().querySelector('[data-guide="analysis-filtering"]');
        expect(source).not.toBeNull();
        expect(filters).not.toBeNull();
        expect(source!.compareDocumentPosition(filters!) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeGreaterThan(0);

        const between = document.createRange();
        between.setStartAfter(source!);
        between.setEndBefore(filters!);
        expect(between.cloneContents().querySelector('.pipeline-connector')).toBeNull();
    });

    it('captions Raw data as the data before any step', () => {
        const raw = host().querySelector('[data-guide="analysis-source-data"] .pipeline-source-band-caption')?.textContent?.trim();
        expect(raw).toBe('As loaded, before any step');
    });

    it('gives step title bars a tinted background and the step boxes a stronger border', () => {
        const node = host().querySelector<HTMLElement>('[data-guide="analysis-filtering"]')!;
        const header = node.querySelector<HTMLElement>('.pipeline-node-header')!;
        const background = getComputedStyle(header).backgroundColor;
        expect(background).toBe('rgb(238, 241, 253)');
        expect(alphaOf(getComputedStyle(node).borderTopColor)).toBeGreaterThanOrEqual(0.2);
    });

    it('lets the missing-values detail pane scroll when the window is short', () => {
        (mockExpService.selectedVariables as any).set([{ code: 'age', label: 'Age', type: 'real' }]);
        fixture.detectChanges();
        component.addStep('setup');
        fixture.detectChanges();

        const pane = host().querySelector<HTMLElement>('.preprocessing-workspace .preprocessing-detail-panel');
        expect(pane).not.toBeNull();
        // The workspace card clips at min(72vh, 760px); the pane must carry the same cap
        // so its own overflow-y: auto scrolls instead of the card cutting the coverage tiles.
        expect(getComputedStyle(pane!).overflowY).toBe('auto');
        expect(getComputedStyle(pane!).maxHeight).not.toBe('none');
    });
});
