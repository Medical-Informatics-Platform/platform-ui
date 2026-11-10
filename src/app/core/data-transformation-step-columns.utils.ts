/**
 * Columns the schema-driven catalog steps add to, or remove from, the data. Their request
 * parameters name them (`suffix`, the encoder's levels), so the studio can offer them as
 * assignable variables and hide the ones a step drops.
 */

export interface CreatedStepColumn {
  code: string;
  label: string;
}

export interface StepColumnEffect {
  created: CreatedStepColumn[];
  /** Source variables the step removes from the data. */
  dropped: string[];
}

interface SourceVariable {
  code: string;
  label?: string;
  enumerations?: Array<{ code: string; label?: string }>;
}

const NO_EFFECT: StepColumnEffect = { created: [], dropped: [] };

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

/** The columns a step adds and the variables it drops, from its applied parameters. */
export function stepColumnEffect(
  name: string,
  parameters: Record<string, unknown>,
  sources: ReadonlyMap<string, SourceVariable>,
): StepColumnEffect {
  const labelOf = (code: string) => sources.get(code)?.label || code;

  if (name === 'missing_indicator') {
    const suffix = typeof parameters['suffix'] === 'string' ? parameters['suffix'] : '_missing';
    return {
      created: strings(parameters['variables']).map((code) => ({
        code: `${code}${suffix}`,
        label: `${labelOf(code)} (missing)`,
      })),
      dropped: [],
    };
  }

  if (name === 'outlier_detector') {
    // Only the default `flag` action adds columns; `drop` removes rows and `set_missing` edits values.
    if (parameters['action'] !== undefined && parameters['action'] !== 'flag') return NO_EFFECT;
    const suffix = typeof parameters['suffix'] === 'string' ? parameters['suffix'] : '_outlier';
    const strategies = (parameters['strategies'] ?? {}) as Record<string, unknown>;
    return {
      created: Object.keys(strategies).sort().map((code) => ({
        code: `${code}${suffix}`,
        label: `${labelOf(code)} (outlier)`,
      })),
      dropped: [],
    };
  }

  if (name === 'one_hot_encoder') {
    const dropFirst = parameters['drop_first'] !== false;
    const dropOriginal = parameters['drop_original'] !== false;
    const variables = strings(parameters['variables']);
    const created: CreatedStepColumn[] = [];
    for (const code of variables) {
      const levels = [...(sources.get(code)?.enumerations ?? [])].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
      for (const level of dropFirst ? levels.slice(1) : levels) {
        created.push({ code: `${code}_${level.code}`, label: `${labelOf(code)}: ${level.label || level.code}` });
      }
    }
    return { created, dropped: dropOriginal ? variables : [] };
  }

  return NO_EFFECT;
}
