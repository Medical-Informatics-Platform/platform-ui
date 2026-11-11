/**
 * The "Add a step" menu of the Preprocessing and Data transformation stages.
 *
 * A stage used to list one dashed row per step it could still add. With every step of the engine's
 * catalog on offer that list grew to nine rows, so the stage now shows one add row that opens a
 * menu, and the menu sorts the steps by what the user wants to do with the data.
 */

/** One step of the menu. `id` is the engine's step name; the panel maps it to the station to open. */
export interface StepPickerOption {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
}

/** Steps that serve the same purpose, under one plain-language label. */
export interface StepPickerGroup {
  key: string;
  label: string;
  options: StepPickerOption[];
}

/**
 * A step the stage can still add. `label` and `desc` come from the engine's catalog and are used
 * for the steps this file has no copy for; `icon` overrides the icon of `stepIcon`.
 */
export interface StepCandidate {
  name: string;
  label?: string;
  desc?: string;
  icon?: string;
}

/** Font Awesome classes of a pipeline step, by engine name. Unlisted names get the branch icon. */
export function stepIcon(name: string): string {
  void name;
  throw new Error('not implemented');
}

/**
 * The menu for the given steps: one group per purpose, in a fixed order, each holding its steps in
 * the order they were given. A group without a step is left out.
 */
export function stepPickerGroups(candidates: StepCandidate[]): StepPickerGroup[] {
  void candidates;
  throw new Error('not implemented');
}
