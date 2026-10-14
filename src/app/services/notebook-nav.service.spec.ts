import { TestBed } from '@angular/core/testing';

import { NotebookNavService } from './notebook-nav.service';

describe('NotebookNavService', () => {
  let service: NotebookNavService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotebookNavService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to not visited', () => {
    expect(service.hasVisited()).toBe(false);
  });

  it('marks visited and persists to localStorage', () => {
    service.markVisited();

    expect(service.hasVisited()).toBe(true);
    expect(localStorage.getItem('mip.notebook.nav.seen')).toBe('true');
  });

  it('does not throw when markVisited is called twice', () => {
    service.markVisited();
    service.markVisited();

    expect(service.hasVisited()).toBe(true);
  });

  it('reads visited state from localStorage on init', () => {
    localStorage.setItem('mip.notebook.nav.seen', 'true');
    const fresh = new NotebookNavService();

    expect(fresh.hasVisited()).toBe(true);
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(() => service.markVisited()).not.toThrow();
    expect(service.hasVisited()).toBe(false);
  });
});
