/**
 * Wire shapes of `/services/studies`.
 *
 * Identity is never sent: the session cookie picks the owner server-side, so every route below is
 * scoped to the signed-in user and a different session simply gets a different set of rows.
 * The service maps these onto the frontend study and group models.
 *
 * The contract the service speaks (servlet prefix `/services` omitted):
 *
 * | Call                                              | Body                     | Result                    |
 * |---------------------------------------------------|--------------------------|---------------------------|
 * | `GET /studies`                                    |                          | `{ studies: Study[] }`    |
 * | `POST /studies`                                   | `{ name, analysisId? }`  | the created study         |
 * | `PATCH /studies/{studyId}`                        | `{ name }`               | the renamed study         |
 * | `DELETE /studies/{studyId}`                       |                          | no content                |
 * | `POST /studies/{studyId}/members`                 | `{ analysisId }`         | the updated study         |
 * | `DELETE /studies/{studyId}/members/{analysisId}`  |                          | the updated study         |
 * | `POST /studies/{studyId}/groups`                  | `{ name, analysisId? }`  | the updated study         |
 * | `PATCH /studies/{studyId}/groups/{groupId}`       | `{ name }`               | the updated study         |
 * | `DELETE /studies/{studyId}/groups/{groupId}`      |                          | the updated study         |
 * | `PATCH /studies/{studyId}/members/{analysisId}/group` | `{ groupId }` (null = ungroup) | the updated study |
 *
 * A name a sibling already carries comes back as `409`, which the service maps to the `null`/`false`
 * the inline "that name is taken" messages already speak. Every other route that changes a study
 * returns the whole study, so the client takes its state from the server instead of guessing.
 */
export interface BackendAnalysisGroup {
  id: string;
  name: string;
  analysisIds: string[];
}

export interface BackendStudy {
  id: string;
  name: string;
  analysisIds: string[];
  groups: BackendAnalysisGroup[];
}

export interface BackendStudiesResponse {
  studies: BackendStudy[];
}
