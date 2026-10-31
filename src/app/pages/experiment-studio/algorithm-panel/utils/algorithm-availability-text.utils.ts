import { VariableTypes } from '../../../../core/constants/algorithm.constants';
import { AlgorithmAvailabilityDetail } from '../../../../models/algorithm-definition.model';

/** "numerical" / "categorical" wording for the needs list; unknown types pass through lowercased. */
function needsTypeText(types: readonly string[] | undefined | null): string {
  if (!Array.isArray(types) || types.length === 0) return '';
  const labels = new Set<string>();
  types.forEach((type) => {
    const normalized = String(type ?? '').trim().toLowerCase();
    if (!normalized) return;
    if (['real', 'int', 'integer', 'numeric', 'numerical'].includes(normalized)) {
      labels.add('numerical');
    } else if (['text', 'nominal', 'categorical', 'polynominal', 'ordinal', 'string'].includes(normalized)) {
      labels.add('categorical');
    } else {
      labels.add(normalized);
    }
  });
  return Array.from(labels).join(' or ');
}

/** Title of one role line in the needs list, e.g. "Needs a numerical outcome" or "At least 2 predictors". */
export function needsRequirementText(detail: AlgorithmAvailabilityDetail): string {
  const typeText = needsTypeText(detail.types);

  if (detail.role === 'y') {
    if (detail.minCount <= 0 && !detail.required) {
      return 'No outcome needed';
    }
    const article = typeText
      ? `${/^[aeiou]/i.test(typeText) ? 'an' : 'a'} ${typeText} `
      : '';
    const noun = detail.minCount > 1 ? 'outcomes' : 'outcome';
    return detail.minCount > 1
      ? `Needs at least ${detail.minCount} ${noun}`
      : `Needs ${article}${noun}`;
  }

  const noun = detail.minCount > 1 ? 'predictors' : 'predictor';
  if (detail.minCount > 0) {
    return `At least ${detail.minCount}${typeText ? ` ${typeText}` : ''} ${noun}`;
  }
  if (detail.maxCount !== null) {
    return `Up to ${detail.maxCount} ${noun}`;
  }
  return 'Predictors optional';
}

/** Backend type names as the availability tips show them: text/polynominal/ordinal read "nominal", integer reads "int". */
function requirementDisplayType(type: unknown): string | null {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (!normalized) return null;

  switch (normalized) {
    case VariableTypes.TEXT:
    case 'polynominal':
    case 'ordinal':
      return VariableTypes.NOMINAL;
    case VariableTypes.INTEGER:
      return VariableTypes.INT;
    default:
      return normalized;
  }
}

function requirementDisplayTypes(types: unknown): string[] | null {
  if (!Array.isArray(types) || types.length === 0) {
    return null;
  }
  const normalized = types
    .map((type) => requirementDisplayType(type))
    .filter((type): type is string => !!type);
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : null;
}

/** Rewrites the type list of "Outcome/Predictor type must be one of …." with display type names. */
export function formatAvailabilityMessage(message: string): string {
  return message.replace(
    /((?:Outcome|Predictor) type must be one of )([^.]*)\./g,
    (_match, prefix: string, types: string) => {
      const displayTypes = requirementDisplayTypes(types.split(',').map((type) => type.trim()));
      return prefix + (displayTypes ?? []).join(', ') + '.';
    }
  );
}
