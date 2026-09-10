/**
 * A named group of runs inside a folder: the unit the compare workspace turns into a section.
 *
 * Strict partition — a run sits in at most one set per folder, because sets drive section
 * grouping and a run in two sections breaks numbering, counts, and the mental model. Moving a
 * run into a set removes it from its previous one; deleting a set returns its runs to Ungrouped.
 */
export interface ExperimentSet {
  id: string;
  name: string;
  experimentIds: string[];
}

/**
 * A user-curated set of experiments ("analysis set"). Frontend-only: folders live in
 * localStorage via ExperimentFoldersService and hold nothing but member ids, so they
 * never need a backend contract and never go stale by carrying a copy of an experiment.
 */
export interface ExperimentFolder {
  id: string;
  name: string;
  experimentIds: string[];
  /** Named subsets of `experimentIds`. Members in no set render under an implicit Ungrouped group. */
  sets: ExperimentSet[];
}
