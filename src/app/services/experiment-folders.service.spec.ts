import { ExperimentFoldersService } from './experiment-folders.service';

const ANON_KEY = 'mip.experiments.folders.v1';

describe('ExperimentFoldersService', () => {
  let service: ExperimentFoldersService;

  beforeEach(() => {
    localStorage.clear();
    service = new ExperimentFoldersService();
    service.useUserScope(null);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('CRUD', () => {
    it('creates a folder with trimmed whitespace and no members', () => {
      const folder = service.createFolder('  Q3  meta  ');

      expect(folder).toBeTruthy();
      expect(folder!.name).toBe('Q3 meta');
      expect(folder!.experimentIds).toEqual([]);
      expect(service.folders().length).toBe(1);
    });

    it('creates a folder that already holds a run', () => {
      const folder = service.createFolder('ANOVA', 'exp-1');

      expect(service.folderById(folder!.id)?.experimentIds).toEqual(['exp-1']);
    });

    it('rejects blank and duplicate names', () => {
      service.createFolder('ANOVA');

      expect(service.createFolder('   ')).toBeNull();
      expect(service.createFolder('anova')).toBeNull();
      expect(service.folders().length).toBe(1);
    });

    it('renames a folder but not onto an existing name', () => {
      const a = service.createFolder('ANOVA')!;
      service.createFolder('PCA');

      expect(service.renameFolder(a.id, '  ANOVA one  ')).toBeTrue();
      expect(service.folderById(a.id)?.name).toBe('ANOVA one');
      expect(service.renameFolder(a.id, 'pca')).toBeFalse();
      expect(service.renameFolder(a.id, '   ')).toBeFalse();
      expect(service.renameFolder('missing', 'Whatever')).toBeFalse();
    });

    it('deletes only the selected folder', () => {
      const a = service.createFolder('ANOVA')!;
      const b = service.createFolder('PCA')!;

      service.deleteFolder(a.id);

      expect(service.folders().map((folder) => folder.id)).toEqual([b.id]);
    });
  });

  describe('membership', () => {
    it('adds a member once and drops it again', () => {
      const folder = service.createFolder('ANOVA')!;

      service.toggleExperiment(folder.id, 'exp-1');
      service.addExperiment(folder.id, 'exp-1');
      expect(service.isMember(folder.id, 'exp-1')).toBeTrue();
      expect(service.folderById(folder.id)?.experimentIds).toEqual(['exp-1']);

      service.toggleExperiment(folder.id, 'exp-1');
      expect(service.isMember(folder.id, 'exp-1')).toBeFalse();
    });

    it('prunes a deleted experiment from every folder', () => {
      const a = service.createFolder('ANOVA', 'exp-1')!;
      const b = service.createFolder('PCA', 'exp-1')!;
      service.addExperiment(b.id, 'exp-2');

      service.pruneExperiment('exp-1');

      expect(service.folderById(a.id)?.experimentIds).toEqual([]);
      expect(service.folderById(b.id)?.experimentIds).toEqual(['exp-2']);
    });
  });

  describe('persistence', () => {
    it('writes folders to localStorage and reads them back on the next instance', () => {
      service.createFolder('ANOVA', 'exp-1');

      expect(JSON.parse(localStorage.getItem(ANON_KEY)!).length).toBe(1);

      const reloaded = new ExperimentFoldersService();
      reloaded.useUserScope(null);

      expect(reloaded.folders().map((folder) => folder.name)).toEqual(['ANOVA']);
      expect(reloaded.folders()[0].experimentIds).toEqual(['exp-1']);
    });

    it('adopts folders made before the email resolved', () => {
      service.createFolder('ANOVA', 'exp-1');

      service.useUserScope('curie@chuv.ch');

      expect(service.folders().map((folder) => folder.name)).toEqual(['ANOVA']);
      expect(localStorage.getItem(ANON_KEY)).toBeNull();
    });

    it('keeps one folder set per email', () => {
      service.useUserScope('curie@chuv.ch');
      service.createFolder('Curie set');

      service.useUserScope('hermita@chuv.ch');
      expect(service.folders()).toEqual([]);
      service.createFolder('Hermita set');

      service.useUserScope('curie@chuv.ch');
      expect(service.folders().map((folder) => folder.name)).toEqual(['Curie set']);
    });

    it('carries sets through a reload', () => {
      const folder = service.createFolder('Stroke', 'exp-1')!;
      service.createSet(folder.id, 'T-tests', 'exp-1');

      const reloaded = new ExperimentFoldersService();
      reloaded.useUserScope(null);

      expect(reloaded.folders()[0].sets.map((set) => set.name)).toEqual(['T-tests']);
      expect(reloaded.folders()[0].sets[0].experimentIds).toEqual(['exp-1']);
    });

    it('survives unreadable payloads and an unavailable storage', () => {
      localStorage.setItem(ANON_KEY, '{not json');

      const recovered = new ExperimentFoldersService();
      recovered.useUserScope(null);

      expect(recovered.folders()).toEqual([]);
      expect(localStorage.getItem(ANON_KEY)).toBeNull();

      localStorage.setItem(
        ANON_KEY,
        JSON.stringify([{ name: 'no id' }, { id: 'f1', name: 'Kept', experimentIds: ['x', 7, null] }]),
      );
      const partial = new ExperimentFoldersService();
      partial.useUserScope(null);

      expect(partial.folders().length).toBe(1);
      expect(partial.folders()[0].experimentIds).toEqual(['x']);

      // A payload from an earlier build carries no sets: the members survive, ungrouped.
      localStorage.setItem(ANON_KEY, JSON.stringify([{ id: 'f2', name: 'Stroke', experimentIds: ['exp-1'] }]));
      const older = new ExperimentFoldersService();
      older.useUserScope(null);

      expect(older.folders()[0].sets).toEqual([]);

      spyOn(localStorage, 'setItem').and.throwError('quota');
      expect(() => older.createFolder('Later')).not.toThrow();
      expect(older.folders().length).toBe(2);
    });
  });

  describe('sets', () => {
    let folder: NonNullable<ReturnType<ExperimentFoldersService['createFolder']>>;

    beforeEach(() => {
      folder = service.createFolder('Stroke', 'exp-1')!;
      service.addExperiment(folder.id, 'exp-2');
    });

    it('creates a named subset that also holds a run', () => {
      const created = service.createSet(folder.id, '  T-tests  one  ', 'exp-2');

      expect(created!.name).toBe('T-tests one');
      const stored = service.folderById(folder.id)!;
      expect(stored.sets.map((set) => set.id)).toEqual([created!.id]);
      expect(stored.sets[0].experimentIds).toEqual(['exp-2']);
      expect(stored.experimentIds).toEqual(['exp-1', 'exp-2']);
    });

    it('rejects blank and duplicate set names, but not the folder own name', () => {
      service.createSet(folder.id, 'T-tests');

      expect(service.createSet(folder.id, '   ')).toBeNull();
      expect(service.createSet(folder.id, 't-TESTS')).toBeNull();
      // Sets are named inside their folder, so one may be called after it.
      expect(service.createSet(folder.id, 'Stroke')).toBeTruthy();
      expect(service.folderById(folder.id)!.sets.length).toBe(2);

      expect(service.createSet('missing', 'Anything')).toBeNull();
    });

    it('renames a set without colliding with a sibling', () => {
      const a = service.createSet(folder.id, 'T-tests')!;
      service.createSet(folder.id, 'Chi-square');

      expect(service.renameSet(folder.id, a.id, '  T-tests  ')).toBeTrue();
      expect(service.folderById(folder.id)!.sets[0].name).toBe('T-tests');
      expect(service.renameSet(folder.id, a.id, 'chi-square')).toBeFalse();
      expect(service.renameSet(folder.id, a.id, '  ')).toBeFalse();
      expect(service.renameSet(folder.id, 'missing', 'Whatever')).toBeFalse();
      expect(service.renameSet('missing-folder', a.id, 'Whatever')).toBeFalse();
    });

    it('moves a run out of the set that had it, because a run has one home', () => {
      const ttests = service.createSet(folder.id, 'T-tests', 'exp-1')!;
      const chi2 = service.createSet(folder.id, 'Chi-squared', 'exp-2')!;

      service.moveToSet(folder.id, 'exp-1', chi2.id);

      const stored = service.folderById(folder.id)!;
      expect(stored.sets.find((set) => set.id === ttests.id)!.experimentIds).toEqual([]);
      expect(stored.sets.find((set) => set.id === chi2.id)!.experimentIds).toEqual(['exp-2', 'exp-1']);
      expect(stored.experimentIds).toEqual(['exp-1', 'exp-2']);
    });

    it('makes a run a member when it moves into a set', () => {
      const set = service.createSet(folder.id, 'T-tests')!;

      service.moveToSet(folder.id, 'exp-9', set.id);

      const stored = service.folderById(folder.id)!;
      expect(stored.experimentIds).toEqual(['exp-1', 'exp-2', 'exp-9']);
      expect(stored.sets[0].experimentIds).toEqual(['exp-9']);
    });

    it('ignores a move that has no destination', () => {
      const set = service.createSet(folder.id, 'T-tests', 'exp-1')!;

      service.moveToSet(folder.id, 'exp-1', 'missing-set');

      expect(service.setOf(folder.id, 'exp-1')).toBe(set.id);
      expect(service.setOf(folder.id, 'exp-2')).toBeNull();
    });

    it('returns a run to ungrouped without touching its membership', () => {
      service.createSet(folder.id, 'T-tests', 'exp-1');

      service.removeFromSets(folder.id, 'exp-1');

      const stored = service.folderById(folder.id)!;
      expect(stored.sets[0].experimentIds).toEqual([]);
      expect(stored.experimentIds).toEqual(['exp-1', 'exp-2']);
      expect(service.setOf(folder.id, 'exp-1')).toBeNull();
    });

    it('deletes the set and keeps every run', () => {
      const set = service.createSet(folder.id, 'T-tests', 'exp-1')!;

      service.deleteSet(folder.id, set.id);

      const stored = service.folderById(folder.id)!;
      expect(stored.sets).toEqual([]);
      expect(stored.experimentIds).toEqual(['exp-1', 'exp-2']);

      service.deleteSet(folder.id, set.id);
      expect(service.folderById(folder.id)!.sets).toEqual([]);
    });

    it('frees a set name again after a delete', () => {
      const set = service.createSet(folder.id, 'T-tests')!;
      service.deleteSet(folder.id, set.id);

      expect(service.createSet(folder.id, 'T-tests')).toBeTruthy();
    });

    it('drops a run from every set when it leaves the folder', () => {
      const set = service.createSet(folder.id, 'T-tests', 'exp-1')!;

      service.removeExperiment(folder.id, 'exp-1');

      const stored = service.folderById(folder.id)!;
      expect(stored.experimentIds).toEqual(['exp-2']);
      expect(stored.sets.find((candidate) => candidate.id === set.id)!.experimentIds).toEqual([]);
    });

    it('prunes a deleted experiment out of the sets as well', () => {
      const set = service.createSet(folder.id, 'T-tests', 'exp-1')!;
      const other = service.createFolder('PCA', 'exp-1')!;

      service.pruneExperiment('exp-1');

      expect(service.folderById(folder.id)!.experimentIds).toEqual(['exp-2']);
      expect(service.folderById(folder.id)!.sets[0].id).toBe(set.id);
      expect(service.folderById(folder.id)!.sets[0].experimentIds).toEqual([]);
      expect(service.folderById(other.id)!.experimentIds).toEqual([]);
    });

    it('persists moves, so a reload keeps the partition', () => {
      service.createSet(folder.id, 'T-tests', 'exp-1');
      const chi2 = service.createSet(folder.id, 'Chi-squared')!;
      service.moveToSet(folder.id, 'exp-1', chi2.id);

      const reloaded = new ExperimentFoldersService();
      reloaded.useUserScope(null);

      expect(reloaded.folderById(folder.id)!.sets.map((set) => set.experimentIds)).toEqual([[], ['exp-1']]);
    });
  });

});
