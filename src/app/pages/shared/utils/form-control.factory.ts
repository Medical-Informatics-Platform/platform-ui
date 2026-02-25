import { FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';

// Normalise options to the primitive value for <option [value]="...">
function toAllowedValues(options: any[]): any[] {
  if (!Array.isArray(options)) return [];
  return options.map(opt => {
    if (opt && typeof opt === 'object') {
      // key hierarchy
      return opt.code ?? opt.value ?? opt.name ?? opt.label ?? String(opt);
    }
    return opt; // primitive (string/number/boolean)
  });
}

// Custom validator for select fields (ensures selected value exists in options)
function inOptionsValidator(options: any[]) {
  const allowed = new Set(toAllowedValues(options));
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;

    // If empty, it is validated by the "required" value
    if (v === null || v === undefined || v === '') return null;

    return allowed.has(v) ? null : { invalidOption: true };
  };
}

export function buildFormControl(field: any, initialValue: any = ''): FormControl {
  const validators = [];

  // Basic validators
  if (field.required) validators.push(Validators.required);
  if (field.min !== undefined && field.min !== null) validators.push(Validators.min(field.min));
  if (field.max !== undefined && field.max !== null) validators.push(Validators.max(field.max));
  if (field.pattern) validators.push(Validators.pattern(field.pattern));

  // Select validator (options as objects or primitives)
  if (field.type === 'select' && Array.isArray(field.options)) {
    validators.push(inOptionsValidator(field.options));
  }

  // Initial value for select with no value. null to show required
  const startValue =
    field.type === 'select' && (initialValue === undefined || initialValue === '')
      ? null
      : (initialValue ?? '');

  return new FormControl(startValue, {
    validators,
    updateOn: 'change',
  });
}
