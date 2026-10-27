/**
 * Preprocessing `outputs` contract and the generic column resolver.
 *
 * Ports `resolve_output_metadata` from exaflow
 * `exaflow/algorithms/utils/output_specifications.py`. Unlike the Python
 * worker, this returns `null` for incomplete parameters instead of raising.
 */

export interface PreprocessingOutputEnumerations {
  source_parameter_name: string;
  source_type: 'dict_keys' | 'prefixed_range';
  additional_value_parameter_name: string | null;
  prefix_parameter_name: string | null;
}

export interface PreprocessingOutputColumn {
  type: 'text' | 'int' | 'real';
  stattype: 'nominal' | 'numerical';
  column_count_param: string | null;
  enumerations: PreprocessingOutputEnumerations | null;
}

export interface PreprocessingOutputs {
  new_column_names_param: string;
  columns: PreprocessingOutputColumn[];
}

/** Resolved view of a single derived output column. */
export interface DerivedColumn {
  code: string;
  type: string;
  stattype: 'nominal' | 'numerical';
  enumerations: { code: string; label: string }[];
}

/** Positive integer count; accepts integer-valued floats, rejects bools/0/negatives. */
function positiveCount(source: unknown): number | null {
  if (typeof source !== 'number' || !Number.isInteger(source) || source < 1) {
    return null;
  }
  return source;
}

export function resolvePreprocessingOutputs(
  outputs: PreprocessingOutputs,
  parameters: Record<string, unknown>,
): DerivedColumn[] | null {
  if (outputs === null || outputs === undefined) {
    return null;
  }

  // Expand each column by its repeat count, validating counts in order.
  const widths: number[] = [];
  for (const column of outputs.columns) {
    if (column.column_count_param === null || column.column_count_param === undefined) {
      widths.push(1);
    } else {
      const count = positiveCount(parameters[column.column_count_param]);
      if (count === null) {
        return null;
      }
      widths.push(count);
    }
  }
  const outputCount = widths.reduce((sum, width) => sum + width, 0);

  const names = parameters[outputs.new_column_names_param];
  if (
    !Array.isArray(names) ||
    names.length !== outputCount ||
    names.some((name) => typeof name !== 'string' || !name.trim())
  ) {
    return null;
  }

  // Ported from Exaflow: new column names must be unique.
  if (new Set(names).size !== names.length) {
    return null;
  }

  const expanded: PreprocessingOutputColumn[] = [];
  for (let i = 0; i < outputs.columns.length; i++) {
    for (let w = 0; w < widths[i]; w++) {
      expanded.push(outputs.columns[i]);
    }
  }

  const resolved: DerivedColumn[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i] as string;
    const column = expanded[i];
    const derived: DerivedColumn = {
      code: name,
      type: column.type,
      stattype: column.stattype,
      enumerations: [],
    };

    if (column.stattype === 'nominal') {
      const enums = column.enumerations;
      if (enums === null || enums === undefined) {
        return null;
      }
      const source = parameters[enums.source_parameter_name];
      let categories: unknown[];

      if (enums.source_type === 'dict_keys') {
        if (
          typeof source !== 'object' ||
          source === null ||
          Array.isArray(source) ||
          Object.keys(source as Record<string, unknown>).length === 0
        ) {
          return null;
        }
        categories = Object.keys(source as Record<string, unknown>);
        if (enums.additional_value_parameter_name !== null && enums.additional_value_parameter_name !== undefined) {
          const additional = parameters[enums.additional_value_parameter_name];
          if (additional !== null && additional !== undefined) {
            categories.push(additional);
          }
        }
      } else {
        const prefixParam = enums.prefix_parameter_name;
        const prefix = prefixParam === null ? null : parameters[prefixParam];
        const count = positiveCount(source);
        if (count === null || typeof prefix !== 'string') {
          return null;
        }
        categories = [];
        for (let index = 1; index <= count; index++) {
          categories.push(`${prefix}${index}`);
        }
      }

      if (categories.some((category) => typeof category !== 'string' || !category.trim())) {
        return null;
      }
      derived.enumerations = categories.map((category) => {
        const code = String(category);
        return { code, label: code };
      });
    }

    resolved.push(derived);
  }

  return resolved;
}
