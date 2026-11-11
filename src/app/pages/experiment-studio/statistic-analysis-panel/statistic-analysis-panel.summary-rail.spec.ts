import { SummaryPanelHarness, createSummaryPanel } from './summary-workspace.testing';

/**
 * Contract: the variable rail of the shared data summary is a triage tool. It says how many
 * variables it lists, sorts them by missing share on request, can be walked with the arrow
 * keys, and a search that matches nothing never removes the search field.
 */
describe('StatisticAnalysisPanelComponent summary rail', () => {
  let harness: SummaryPanelHarness;

  const variables = [
    { code: 'age', label: 'Age', type: 'real' },
    { code: 'bmi', label: 'BMI', type: 'real' },
    { code: 'mmse', label: 'MMSE', type: 'real' },
    { code: 'sex', label: 'Sex', type: 'nominal' },
  ];

  // Missing share: Age 0%, BMI 60%, MMSE 20%, Sex 10%.
  const featurewise = ['all datasets', 'dataset-a'].flatMap((dataset) => [
    { dataset, variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
    { dataset, variable: 'bmi', data: { num_dtps: 4, num_na: 6, num_total: 10, mean: 24 } },
    { dataset, variable: 'mmse', data: { num_dtps: 8, num_na: 2, num_total: 10, mean: 27 } },
    { dataset, variable: 'sex', data: { counts: { female: 5, male: 4 }, num_dtps: 9, num_na: 1, num_total: 10 } },
  ]);

  const rail = () => harness.workspace().querySelector('.statistics-browser') as HTMLElement;
  const rows = () => Array.from(rail().querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[];
  const names = () => rows().map((row) => (row.querySelector('span')?.textContent ?? '').trim());
  const row = (name: string) => rows()[names().indexOf(name)];
  const heading = () => (harness.workspace().querySelector('.summary-detail-toolbar h4')?.textContent ?? '').trim();
  const searchInput = () => rail().querySelector('input[type="search"]') as HTMLInputElement;

  function search(text: string): void {
    const input = searchInput();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    harness.fixture.detectChanges();
  }

  function press(target: HTMLElement, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    harness.fixture.detectChanges();
    return event;
  }

  beforeEach(async () => {
    harness = await createSummaryPanel({ featurewise, variables });
  });

  it('renders the fixture: numerical rows, then categorical rows', () => {
    expect(names()).toEqual(['Age', 'BMI', 'MMSE', 'Sex']);
    expect(heading()).toContain('Age');
  });

  describe('header', () => {
    it('says how many variables the rail lists', () => {
      const header = rail().querySelector('.statistics-browser-header') as HTMLElement;
      expect(header.textContent).toContain('4 variables');
      expect(header.textContent).not.toContain('shown');
    });

    it('says how many of the total a search leaves', () => {
      search('mm');
      expect(names()).toEqual(['MMSE']);
      expect(rail().querySelector('.statistics-browser-header')?.textContent).toContain('1 of 4 variables');
    });
  });

  describe('search that matches nothing', () => {
    it('keeps the search field on screen and names the search text', () => {
      const input = searchInput();
      search('zzz');

      expect(rows().length).toBe(0);
      expect(input.isConnected).toBe(true);
      expect(searchInput()).toBe(input);
      expect(rail().querySelector('.statistics-browser-header')?.textContent).toContain('0 of 4 variables');
      const noMatch = harness.workspace().querySelector('.statistics-no-match') as HTMLElement;
      expect(noMatch).toBeTruthy();
      expect(noMatch.textContent).toContain('No variable matches');
      expect(noMatch.textContent).toContain('zzz');
    });

    it('offers one button that clears the search and brings every variable back', () => {
      search('zzz');
      const clear = harness.workspace().querySelector('.statistics-no-match .statistics-search-clear') as HTMLButtonElement;
      expect(clear).toBeTruthy();
      expect(clear.textContent).toContain('Clear search');

      clear.click();
      harness.fixture.detectChanges();

      expect(harness.component.statisticsSearch['source']).toBe('');
      expect(names()).toEqual(['Age', 'BMI', 'MMSE', 'Sex']);
      expect(harness.workspace().querySelector('.statistics-no-match')).toBeNull();
    });
  });

  describe('order by missing values', () => {
    const sortButton = () => rail().querySelector('.statistics-browser-header .statistics-sort-btn') as HTMLButtonElement;

    it('starts in selection order with the sort button not pressed', () => {
      expect(sortButton()).toBeTruthy();
      expect(sortButton().textContent).toContain('Missing');
      expect(sortButton().getAttribute('aria-pressed')).toBe('false');
    });

    it('puts the most missing variable first inside each group, and toggles back', () => {
      sortButton().click();
      harness.fixture.detectChanges();

      expect(sortButton().getAttribute('aria-pressed')).toBe('true');
      expect(names()).toEqual(['BMI', 'MMSE', 'Age', 'Sex']);

      sortButton().click();
      harness.fixture.detectChanges();

      expect(sortButton().getAttribute('aria-pressed')).toBe('false');
      expect(names()).toEqual(['Age', 'BMI', 'MMSE', 'Sex']);
    });

    it('keeps the selected variable selected when the order changes', () => {
      row('MMSE').click();
      harness.fixture.detectChanges();
      sortButton().click();
      harness.fixture.detectChanges();

      expect(heading()).toContain('MMSE');
      expect(row('MMSE').classList.contains('active')).toBe(true);
    });
  });

  describe('keyboard', () => {
    it('marks the selected row for assistive technology', () => {
      expect(row('Age').getAttribute('aria-current')).toBe('true');
      expect(row('BMI').getAttribute('aria-current')).toBeNull();
    });

    it('ArrowDown selects the next row, shows it and moves focus to it', () => {
      row('Age').focus();
      const event = press(row('Age'), 'ArrowDown');

      expect(event.defaultPrevented).toBe(true);
      expect(heading()).toContain('BMI');
      expect(row('BMI').classList.contains('active')).toBe(true);
      expect(document.activeElement).toBe(row('BMI'));
    });

    it('walks from the numerical group into the categorical group and back', () => {
      row('MMSE').click();
      harness.fixture.detectChanges();

      press(row('MMSE'), 'ArrowDown');
      expect(heading()).toContain('Sex');
      expect(document.activeElement).toBe(row('Sex'));

      press(row('Sex'), 'ArrowUp');
      expect(heading()).toContain('MMSE');
    });

    it('stops at the ends, and Home and End jump to them', () => {
      press(row('Age'), 'ArrowUp');
      expect(heading()).toContain('Age');

      press(row('Age'), 'End');
      expect(heading()).toContain('Sex');

      press(row('Sex'), 'ArrowDown');
      expect(heading()).toContain('Sex');

      press(row('Sex'), 'Home');
      expect(heading()).toContain('Age');
    });

    it('follows the order on screen after sorting', () => {
      (rail().querySelector('.statistics-sort-btn') as HTMLButtonElement).click();
      harness.fixture.detectChanges();
      // Sorted numerical rows: BMI, MMSE, Age. In selection order MMSE is followed by Sex.
      row('MMSE').click();
      harness.fixture.detectChanges();

      press(row('MMSE'), 'ArrowDown');
      expect(heading()).toContain('Age');
    });

    it('leaves other keys alone', () => {
      const event = press(row('Age'), 'a');
      expect(event.defaultPrevented).toBe(false);
      expect(heading()).toContain('Age');
    });
  });
});
