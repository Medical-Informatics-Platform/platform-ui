import { PipelineStep, SectionKey } from '../data-handling.models';

/** The stages a pipeline can add, folded away by default. Step 0 (source) is a read, never a stage. */
export type StageStep = Exclude<PipelineStep, 'source'>;

/** Every section folded. */
export const CLOSED_SECTIONS: Readonly<Record<SectionKey, boolean>> = {
  source: false,
  raw: false,
  setup: false,
  filters: false,
  processed: false,
  transformation: false,
};

/** The sections each step shows: its editor first, then its data preview. */
export const STEP_SECTIONS: Readonly<Record<PipelineStep, readonly SectionKey[]>> = {
  source: ['source'],
  filters: ['filters', 'raw'],
  setup: ['setup', 'processed'],
  transformation: ['transformation'],
};

export interface SectionLayout {
  /** Exactly this section's flags are open; going to a section closes every other. */
  sectionOpen: Record<SectionKey, boolean>;
  /** Which stage's data preview is showing in place of its editor. */
  summaryExpanded: { filters: boolean; setup: boolean };
  /** The stage the section belongs to, which opening it adds to the pipeline; null for step 0. */
  addsStep: StageStep | null;
}

/**
 * What the page looks like with `section` in view: a stage opens as its editor, or as its
 * data preview when the section is the preview (`raw`, `processed`).
 */
export function sectionLayout(section: SectionKey): SectionLayout {
  const step = (Object.keys(STEP_SECTIONS) as PipelineStep[]).find((candidate) => STEP_SECTIONS[candidate].includes(section));
  const previewFilters = section === 'raw';
  const previewSetup = section === 'processed';
  return {
    sectionOpen: {
      source: section === 'source',
      filters: section === 'filters',
      raw: previewFilters,
      setup: section === 'setup',
      processed: previewSetup,
      transformation: section === 'transformation',
    },
    summaryExpanded: { filters: previewFilters, setup: previewSetup },
    addsStep: step && step !== 'source' ? step : null,
  };
}

/** Whether any section of the step is open. */
export function isStepShown(step: PipelineStep, open: Readonly<Record<SectionKey, boolean>>): boolean {
  return STEP_SECTIONS[step].some((section) => open[section]);
}
