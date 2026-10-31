import { SectionKey } from '../data-handling.models';
import { CLOSED_SECTIONS, STEP_SECTIONS, isStepShown, sectionLayout } from './section-layout.utils';

const SECTIONS = Object.keys(CLOSED_SECTIONS) as SectionKey[];

describe('section layout', () => {
  it('opens exactly the section it goes to', () => {
    for (const section of SECTIONS) {
      const open = sectionLayout(section).sectionOpen;
      expect(SECTIONS.filter((key) => open[key])).toEqual([section]);
    }
  });

  it('shows a stage\'s data preview in place of its editor, and only for the preview sections', () => {
    expect(sectionLayout('filters').summaryExpanded).toEqual({ filters: false, setup: false });
    expect(sectionLayout('raw').summaryExpanded).toEqual({ filters: true, setup: false });
    expect(sectionLayout('setup').summaryExpanded).toEqual({ filters: false, setup: false });
    expect(sectionLayout('processed').summaryExpanded).toEqual({ filters: false, setup: true });
    expect(sectionLayout('transformation').summaryExpanded).toEqual({ filters: false, setup: false });
    expect(sectionLayout('source').summaryExpanded).toEqual({ filters: false, setup: false });
  });

  it('adds the stage a section belongs to, and nothing for step 0', () => {
    expect(SECTIONS.map((section) => [section, sectionLayout(section).addsStep])).toEqual([
      ['source', null],
      ['raw', 'filters'],
      ['setup', 'setup'],
      ['filters', 'filters'],
      ['processed', 'setup'],
      ['transformation', 'transformation'],
    ]);
  });

  it('gives every section to exactly one step', () => {
    const owned = Object.values(STEP_SECTIONS).flat();
    expect([...owned].sort()).toEqual([...SECTIONS].sort());
  });

  it('counts a step as shown when its editor or its preview is open', () => {
    expect(isStepShown('filters', sectionLayout('filters').sectionOpen)).toBe(true);
    expect(isStepShown('filters', sectionLayout('raw').sectionOpen)).toBe(true);
    expect(isStepShown('setup', sectionLayout('processed').sectionOpen)).toBe(true);
    expect(isStepShown('setup', sectionLayout('raw').sectionOpen)).toBe(false);
    expect(isStepShown('source', sectionLayout('source').sectionOpen)).toBe(true);
    expect(isStepShown('transformation', CLOSED_SECTIONS)).toBe(false);
  });

  it('does not let a caller change the closed layout', () => {
    const layout = sectionLayout('source').sectionOpen;
    layout.raw = true;
    expect(CLOSED_SECTIONS.raw).toBe(false);
    expect(sectionLayout('source').sectionOpen.raw).toBe(false);
  });
});
