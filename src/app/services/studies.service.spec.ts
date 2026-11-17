import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { Study } from '../models/study.model';
import { User } from '../models/user.interface';
import { StudiesService } from './studies.service';

/** The one surface the service speaks; see `backend-study.model.ts` for the table. */
const apiUrl = '/services/studies';

const user = (username: string): User => ({
  username,
  fullname: username,
  email: `${username}@chuv.ch`,
  subjectId: `orcid-${username}`,
});

/** Frontend-shaped fixture, returned as the study the server actually sends. */
const study = (overrides: Partial<Study> = {}) => {
  const row: Study = {
    id: 'study-1',
    name: 'Q3 meta',
    analysisIds: ['exp-1'],
    groups: [],
    ...overrides,
  };
  return {
    id: row.id,
    name: row.name,
    analysisIds: row.analysisIds,
    groups: row.groups.map((group) => ({ id: group.id, name: group.name, analysisIds: group.analysisIds })),
  };
};

describe('StudiesService', () => {
  let service: StudiesService;
  let httpMock: HttpTestingController;

  /** Signs in and hands back the GET the service owes us, so each test flushes its own answer. */
  const signIn = (username = 'mcurie') => {
    service.setActiveUser(user(username));
    return httpMock.expectOne(apiUrl);
  };

  /** Collects what a mutation answers, the way a component subscription would. */
  const record = <T>(request: Observable<T>) => {
    const values: T[] = [];
    const errors: unknown[] = [];
    request.subscribe({ next: (value) => values.push(value), error: (err) => errors.push(err) });
    return { values, errors };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StudiesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('reading the signed-in user', () => {
    it('reads the studies of whoever the session turns out to be', () => {
      service.setActiveUser(user('mcurie'));
      const read = httpMock.expectOne(apiUrl);

      expect(read.request.method).toBe('GET');
      expect(service.loading()).toBe(true);

      read.flush({
        studies: [study(), study({ id: 'study-2', name: 'PCA', analysisIds: ['exp-2', 'exp-3'] })],
      });

      expect(service.loading()).toBe(false);
      expect(service.studies().map((candidate) => candidate.id)).toEqual(['study-1', 'study-2']);
      expect(service.studyById('study-2')?.name).toBe('PCA');
      expect(service.isMember('study-2', 'exp-3')).toBe(true);
    });

    it('carries the groups across with the study that holds them', () => {
      signIn().flush({
        studies: [study({ groups: [{ id: 'group-1', name: 'T-tests', analysisIds: ['exp-1'] }] })],
      });

      expect(service.studies()[0].groups.map((group) => group.name)).toEqual(['T-tests']);
      expect(service.groupOf('study-1', 'exp-1')).toBe('group-1');
      expect(service.groupOf('study-1', 'exp-9')).toBeNull();
    });

    it('asks again for a different user, having forgotten the rows of the one before', () => {
      signIn('mcurie').flush({ studies: [study()] });

      service.setActiveUser(user('hermita'));
      expect(service.studies()).toEqual([]);

      const second = httpMock.expectOne(apiUrl);
      second.flush({ studies: [study({ id: 'study-9', name: 'Stroke' })] });

      expect(service.studies().map((candidate) => candidate.id)).toEqual(['study-9']);
    });

    it('does not read twice for the same user, however often the session is re-read', () => {
      signIn('mcurie').flush({ studies: [study()] });

      // The session object is replaced on every refresh; the username inside it is what matters.
      service.setActiveUser(user('mcurie'));
      service.setActiveUser(null);
      service.setActiveUser(null);

      expect(service.studies()).toEqual([]);
      httpMock.expectNone(apiUrl);
    });

    it('signing out empties the mirror without going looking for anything', () => {
      signIn('mcurie').flush({ studies: [study()] });

      service.setActiveUser(null);

      expect(service.studies()).toEqual([]);
      expect(service.loading()).toBe(false);
      httpMock.expectNone(apiUrl);
    });

    it('waits for a session instead of reading studies for nobody', () => {
      service.setActiveUser(null);

      expect(service.studies()).toEqual([]);
      httpMock.expectNone(apiUrl);
    });

    it('drops an answer that arrives after the user has already changed', () => {
      service.setActiveUser(user('mcurie'));
      const stale = httpMock.expectOne(apiUrl);

      service.setActiveUser(user('hermita'));
      const current = httpMock.expectOne(apiUrl);

      current.flush({ studies: [study({ id: 'b', name: 'Hers' })] });
      stale.flush({ studies: [study({ id: 'a', name: 'Mine' })] });

      expect(service.studies().map((candidate) => candidate.id)).toEqual(['b']);
    });

    it('says out loud when the read fails, rather than showing an empty list as if it were the truth', () => {
      vi.spyOn(console, 'error').mockReturnValue(undefined);
      signIn().flush('database down', { status: 500, statusText: 'Server Error' });

      expect(service.loading()).toBe(false);
      expect(service.loadError()).toContain('Could not load your studies');
    });

    it('keeps a payload that lost a field from taking the whole read with it', () => {
      signIn().flush({
        studies: [study({ analysisIds: ['exp-1', 7, null] as unknown as string[] }), { name: 'no id' }, null],
      });

      expect(service.studies().map((candidate) => candidate.id)).toEqual(['study-1']);
      expect(service.studies()[0].analysisIds).toEqual(['exp-1']);
    });
  });

  describe('studies', () => {
    beforeEach(() => {
      signIn().flush({ studies: [study()] });
    });

    it('creates a study with a normalised name and takes the signal from the answer', () => {
      const created = record(service.createStudy('  Q3   meta  two  '));
      expect(created.values).toEqual([]);

      const write = httpMock.expectOne(apiUrl);
      expect(write.request.method).toBe('POST');
      expect(write.request.body).toEqual({ name: 'Q3 meta two' });

      write.flush(study({ id: 'study-2', name: 'Q3 meta two', analysisIds: [] }));

      expect(created.values[0]).toEqual(expect.objectContaining({ id: 'study-2', name: 'Q3 meta two' }));
      expect(service.studies().map((candidate) => candidate.id)).toEqual(['study-1', 'study-2']);
    });

    it('brings a run with a study made from the row menu', () => {
      service.createStudy('ANOVA', 'exp-7').subscribe();

      const write = httpMock.expectOne(apiUrl);
      expect(write.request.body).toEqual({ name: 'ANOVA', analysisId: 'exp-7' });
      write.flush(study({ id: 'study-2', name: 'ANOVA', analysisIds: ['exp-7'] }));

      expect(service.studyById('study-2')?.analysisIds).toEqual(['exp-7']);
    });

    it('maps a name a sibling already took to null, and leaves the mirror alone', () => {
      const created = record(service.createStudy('q3 meta'));

      httpMock.expectOne(apiUrl).flush('taken', { status: 409, statusText: 'Conflict' });

      expect(created.values).toEqual([null]);
      expect(service.studies().map((candidate) => candidate.id)).toEqual(['study-1']);
    });

    it('never sends a blank name to the server', () => {
      const created = record(service.createStudy('   '));

      expect(created.values).toEqual([null]);
      httpMock.expectNone(apiUrl);
    });

    it('renames through PATCH, and is true only when the server agreed', () => {
      const renamed = record(service.renameStudy('study-1', '  ANOVA one  '));

      const write = httpMock.expectOne(`${apiUrl}/study-1`);
      expect(write.request.method).toBe('PATCH');
      expect(write.request.body).toEqual({ name: 'ANOVA one' });

      write.flush(study({ name: 'ANOVA one' }));

      expect(renamed.values).toEqual([true]);
      expect(service.studyById('study-1')?.name).toBe('ANOVA one');
    });

    it('a taken new name comes back false, so the inline line can say so', () => {
      const renamed = record(service.renameStudy('study-1', 'PCA'));

      httpMock.expectOne(`${apiUrl}/study-1`).flush('taken', { status: 409, statusText: 'Conflict' });

      expect(renamed.values).toEqual([false]);
      expect(service.studyById('study-1')?.name).toBe('Q3 meta');
    });

    it('deletes a study out of the mirror once the server has it', () => {
      const gone = record(service.deleteStudy('study-1'));

      const write = httpMock.expectOne(`${apiUrl}/study-1`);
      expect(write.request.method).toBe('DELETE');
      write.flush(null, { status: 204, statusText: 'No Content' });

      expect(gone.values.length).toBe(1);
      expect(service.studies()).toEqual([]);
    });

    it('propagates a failure that is not about the name, so the component can say something', () => {
      const renamed = record(service.renameStudy('study-1', 'ANOVA one'));

      httpMock.expectOne(`${apiUrl}/study-1`).flush('database down', { status: 500, statusText: 'Server Error' });

      expect(renamed.values).toEqual([]);
      expect(renamed.errors.length).toBe(1);
      expect(service.studyById('study-1')?.name).toBe('Q3 meta');
    });
  });

  describe('membership', () => {
    beforeEach(() => {
      signIn().flush({ studies: [study({ analysisIds: ['exp-1'], groups: [{ id: 'group-1', name: 'T-tests', analysisIds: ['exp-1'] }] })] });
    });

    it('adds a run to the study it was dropped on', () => {
      const added = record(service.addAnalysis('study-1', 'exp-2'));

      const write = httpMock.expectOne(`${apiUrl}/study-1/members`);
      expect(write.request.method).toBe('POST');
      expect(write.request.body).toEqual({ analysisId: 'exp-2' });

      write.flush(study({ analysisIds: ['exp-1', 'exp-2'] }));

      expect(added.values[0]).toEqual(expect.objectContaining({ id: 'study-1' }));
      expect(service.studyById('study-1')?.analysisIds).toEqual(['exp-1', 'exp-2']);
    });

    it('removes a run, and the server decides what its group loses', () => {
      service.removeAnalysis('study-1', 'exp-1').subscribe();

      const write = httpMock.expectOne(`${apiUrl}/study-1/members/exp-1`);
      expect(write.request.method).toBe('DELETE');
      write.flush(study({ analysisIds: [], groups: [{ id: 'group-1', name: 'T-tests', analysisIds: [] }] }));

      expect(service.studyById('study-1')?.analysisIds).toEqual([]);
      expect(service.studyById('study-1')?.groups[0].analysisIds).toEqual([]);
    });

    it('a row-menu tick goes whichever way the mirror says the run stands', () => {
      service.toggleAnalysis('study-1', 'exp-1').subscribe();
      httpMock.expectOne(`${apiUrl}/study-1/members/exp-1`).flush(study({ analysisIds: [] }));

      service.toggleAnalysis('study-1', 'exp-2').subscribe();
      const added = httpMock.expectOne(`${apiUrl}/study-1/members`);
      expect(added.request.method).toBe('POST');
      added.flush(study({ analysisIds: ['exp-2'] }));

      expect(service.isMember('study-1', 'exp-1')).toBe(false);
      expect(service.isMember('study-1', 'exp-2')).toBe(true);
    });

    it('a drop the server refused is an error the canvas hears, not a silent no-op', () => {
      const added = record(service.addAnalysis('study-1', 'exp-2'));

      httpMock.expectOne(`${apiUrl}/study-1/members`).flush('down', { status: 503, statusText: 'Unavailable' });

      expect(added.values).toEqual([]);
      expect(added.errors.length).toBe(1);
      expect(service.studyById('study-1')?.analysisIds).toEqual(['exp-1']);
    });
  });

  describe('groups', () => {
    beforeEach(() => {
      signIn().flush({ studies: [study({ analysisIds: ['exp-1', 'exp-2'], groups: [{ id: 'group-1', name: 'T-tests', analysisIds: ['exp-1'] }] })] });
    });

    it('creates a group with the run that asked for it', () => {
      const created = record(service.createGroup('study-1', '  Chi-squared  ', 'exp-2'));

      const write = httpMock.expectOne(`${apiUrl}/study-1/groups`);
      expect(write.request.method).toBe('POST');
      expect(write.request.body).toEqual({ name: 'Chi-squared', analysisId: 'exp-2' });

      write.flush(
        study({
          analysisIds: ['exp-1', 'exp-2'],
          groups: [
            { id: 'group-1', name: 'T-tests', analysisIds: ['exp-1'] },
            { id: 'group-2', name: 'Chi-squared', analysisIds: ['exp-2'] },
          ],
        }),
      );

      expect(created.values[0]?.groups.map((group) => group.name)).toEqual(['T-tests', 'Chi-squared']);
      expect(service.groupOf('study-1', 'exp-2')).toBe('group-2');
    });

    it('a group name a sibling took comes back null, with the partition untouched', () => {
      const created = record(service.createGroup('study-1', 't-TESTS', 'exp-2'));

      httpMock.expectOne(`${apiUrl}/study-1/groups`).flush('taken', { status: 409, statusText: 'Conflict' });

      expect(created.values).toEqual([null]);
      expect(service.studyById('study-1')?.groups.length).toBe(1);
    });

    it('never sends a blank group name either', () => {
      const created = record(service.createGroup('study-1', '  ', 'exp-2'));

      expect(created.values).toEqual([null]);
      httpMock.expectNone(apiUrl);
    });

    it('renames a group through PATCH on the group', () => {
      const renamed = record(service.renameGroup('study-1', 'group-1', ' Age tests '));

      const write = httpMock.expectOne(`${apiUrl}/study-1/groups/group-1`);
      expect(write.request.method).toBe('PATCH');
      expect(write.request.body).toEqual({ name: 'Age tests' });

      write.flush(study({ groups: [{ id: 'group-1', name: 'Age tests', analysisIds: ['exp-1'] }] }));

      expect(renamed.values).toEqual([true]);
      expect(service.studyById('study-1')?.groups[0].name).toBe('Age tests');
    });

    it('a sibling name on a rename is false', () => {
      const renamed = record(service.renameGroup('study-1', 'group-1', 'Chi-squared'));

      httpMock.expectOne(`${apiUrl}/study-1/groups/group-1`).flush('taken', { status: 409, statusText: 'Conflict' });

      expect(renamed.values).toEqual([false]);
    });

    it('deleting a group returns the study with its runs back ungrouped', () => {
      service.deleteGroup('study-1', 'group-1').subscribe();

      const write = httpMock.expectOne(`${apiUrl}/study-1/groups/group-1`);
      expect(write.request.method).toBe('DELETE');
      write.flush(study({ analysisIds: ['exp-1', 'exp-2'], groups: [] }));

      expect(service.studyById('study-1')?.groups).toEqual([]);
      expect(service.studyById('study-1')?.analysisIds).toEqual(['exp-1', 'exp-2']);
    });

    it('moves a run into a group by writing its group id', () => {
      const moved = record(service.moveToGroup('study-1', 'exp-2', 'group-1'));

      const write = httpMock.expectOne(`${apiUrl}/study-1/members/exp-2/group`);
      expect(write.request.method).toBe('PATCH');
      expect(write.request.body).toEqual({ groupId: 'group-1' });

      write.flush(study({ analysisIds: ['exp-1', 'exp-2'], groups: [{ id: 'group-1', name: 'T-tests', analysisIds: ['exp-1', 'exp-2'] }] }));

      expect(moved.values[0]?.groups[0].analysisIds).toEqual(['exp-1', 'exp-2']);
      expect(service.groupOf('study-1', 'exp-2')).toBe('group-1');
    });

    it('leaving a group is the same write with the group id cleared', () => {
      service.removeFromGroups('study-1', 'exp-1').subscribe();

      const write = httpMock.expectOne(`${apiUrl}/study-1/members/exp-1/group`);
      expect(write.request.method).toBe('PATCH');
      expect(write.request.body).toEqual({ groupId: null });

      write.flush(study({ analysisIds: ['exp-1', 'exp-2'], groups: [{ id: 'group-1', name: 'T-tests', analysisIds: [] }] }));

      expect(service.groupOf('study-1', 'exp-1')).toBeNull();
      expect(service.isMember('study-1', 'exp-1')).toBe(true);
    });
  });

  describe('pruning a run the analysis API has already lost', () => {
    it('clears the mirror without asking the study API to do it', () => {
      signIn().flush({
        studies: [
          study({ analysisIds: ['exp-1', 'exp-2'], groups: [{ id: 'group-1', name: 'T-tests', analysisIds: ['exp-1'] }] }),
          study({ id: 'study-2', name: 'PCA', analysisIds: ['exp-1'] }),
        ],
      });

      service.pruneAnalysis('exp-1');

      expect(service.studyById('study-1')?.analysisIds).toEqual(['exp-2']);
      expect(service.studyById('study-1')?.groups[0].analysisIds).toEqual([]);
      expect(service.studyById('study-2')?.analysisIds).toEqual([]);
      httpMock.expectNone(apiUrl);
    });
  });
});
