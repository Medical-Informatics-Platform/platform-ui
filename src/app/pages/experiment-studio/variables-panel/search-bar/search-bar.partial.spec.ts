import { provideZonelessChangeDetection, SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SearchBarComponent } from './search-bar.component';
import { MetadataSearchResult } from '../../visualisations/metadata-browser/metadata-browser.model';

describe('SearchBarComponent partially available variables', () => {
  const mockHierarchy = {
    code: 'root',
    label: 'Stroke 3.7',
    children: [
      {
        code: 'demographics',
        label: 'Demographics',
        children: [
          {
            code: 'age',
            label: 'Age at onset',
            type: 'integer',
          },
          {
            code: 'gender',
            label: 'Gender',
            type: 'nominal',
          },
        ],
      },
      {
        code: 'vitals',
        label: 'Vitals',
        children: [
          {
            code: 'blood_pressure',
            label: 'Blood Pressure',
            type: 'real',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SearchBarComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  function setupComponent(): {
    fixture: ReturnType<typeof TestBed.createComponent<SearchBarComponent>>;
    component: SearchBarComponent;
  } {
    const fixture = TestBed.createComponent(SearchBarComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('dataModelHierarchy', mockHierarchy);
    component.ngOnChanges({
      dataModelHierarchy: new SimpleChange(null, mockHierarchy, true),
    });
    fixture.detectChanges();
    return { fixture, component };
  }

  it('marks a result missing in some dataset, explains why, and still lets the user pick it', () => {
    const { fixture, component } = setupComponent();
    fixture.componentRef.setInput('unavailableVariables', new Map([['gender', ['Dataset B']]]));
    const selected: MetadataSearchResult[] = [];
    component.searchResultSelected.subscribe((item) => selected.push(item));

    component.onSearchFocus();
    component.handleSearch('Gender');
    fixture.detectChanges();

    const item = component.filteredItems[0];
    expect(component.generateTooltip(item)).toContain('Not available in: Dataset B');
    const row = fixture.nativeElement.querySelector('.search-result-item') as HTMLElement;
    expect(row.classList).toContain('is-partial');
    expect(row.getAttribute('aria-disabled')).toBeNull();

    row.click();
    expect(selected).toEqual([item]);
  });
});
