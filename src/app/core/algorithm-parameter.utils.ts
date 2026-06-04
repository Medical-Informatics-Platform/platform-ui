type ParameterField = {
  type?: string;
  options?: unknown[];
  types?: string[];
  key?: string;
};

function normalizeOption(entry: unknown): { code: string; label: string } | null {
  if (entry === null || entry === undefined) return null;

  if (typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    const code = record['code'] ?? record['value'] ?? record['name'] ?? record['label'];
    if (code === null || code === undefined || String(code).trim() === '') {
      return null;
    }
    const normalizedCode = String(code);
    return {
      code: normalizedCode,
      label: String(record['label'] ?? record['name'] ?? normalizedCode),
    };
  }

  const primitive = String(entry);
  return { code: primitive, label: primitive };
}

function serializeSelectValue(value: unknown, options: Array<{ code: string; label: string }>): string {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const embedded = record['code'] ?? record['value'];
    if (embedded !== null && embedded !== undefined && String(embedded).trim() !== '') {
      return String(embedded);
    }
  }

  const raw = String(value);
  const byCode = options.find((option) => option.code === raw);
  if (byCode) return byCode.code;

  const byLabel = options.find((option) => option.label === raw);
  if (byLabel) return byLabel.code;

  return raw;
}

/** Ensures enum-backed parameter values are sent as string codes (not labels or numbers). */
export function serializeAlgorithmParameterValue(
  value: unknown,
  field: ParameterField | null | undefined
): unknown {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  if (!field) {
    return typeof value === 'number' ? String(value) : value;
  }

  if (field.type === 'multi-select') {
    const values = Array.isArray(value) ? value : [value];
    const options = (field.options ?? [])
      .map(normalizeOption)
      .filter((option): option is { code: string; label: string } => !!option);
    return values.map((entry) =>
      options.length ? serializeSelectValue(entry, options) : String(entry)
    );
  }

  if (field.type === 'select') {
    const options = (field.options ?? [])
      .map(normalizeOption)
      .filter((option): option is { code: string; label: string } => !!option);
    if (options.length) {
      return serializeSelectValue(value, options);
    }
  }

  if (field.key === 'positive_class' || field.key === 'event_var') {
    return String(
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)['code'] ??
            (value as Record<string, unknown>)['value'] ??
            value
        : value
    );
  }

  return value;
}

export function optionBindingValue(option: unknown): string {
  const normalized = normalizeOption(option);
  return normalized?.code ?? String(option);
}

export function isEmptyParameterValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/** Drops unset optional parameters so they are not sent to Exaflow. */
export function omitEmptyOptionalParameters(
  config: Record<string, unknown>,
  schema: Array<{ key?: string; required?: boolean }> = []
): Record<string, unknown> {
  const next = { ...config };

  schema.forEach((field) => {
    const key = field?.key;
    if (!key || field.required) return;
    if (isEmptyParameterValue(next[key])) {
      delete next[key];
    }
  });

  if (isEmptyParameterValue(next['positive_class'])) {
    delete next['positive_class'];
  }

  return next;
}
