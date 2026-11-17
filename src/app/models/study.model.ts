/**
 * A named group of runs inside a study: the unit the compare workspace turns into a section.
 *
 * Strict partition — a run sits in at most one group per study, because groups drive section
 * grouping and a run in two sections breaks numbering, counts, and the mental model. Moving a
 * run into a group removes it from its previous one; deleting a group returns its runs to Ungrouped.
 */
export interface AnalysisGroup {
  id: string;
  name: string;
  analysisIds: string[];
}

/**
 * A user-curated set of analyses ("study").
 *
 * The rows live in PostgreSQL behind `/services/studies`; this is the shape the client
 * keeps them in. Both the study and its groups hold member ids only, never analysis copies, so the
 * only drift risk is an id the analysis API no longer resolves. Ids are plain UUIDs the backend
 * minted — nothing here is generated in the browser.
 */
export interface Study {
  id: string;
  name: string;
  analysisIds: string[];
  /** Named subsets of `analysisIds`. Members in no group render under an implicit Ungrouped group. */
  groups: AnalysisGroup[];
}
