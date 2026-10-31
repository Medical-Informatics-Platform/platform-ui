import { InjectionToken } from '@angular/core';
import type { DataHandlingComponent } from './data-handling.component';

/**
 * The Data Handling component, as seen by the sections it renders.
 *
 * Section components are views over the pipeline's state, which stays on
 * DataHandlingComponent (its public API, the studio's calls into it and the specs all
 * go through it). Sections inject this token instead of taking dozens of inputs, and
 * use ChangeDetectionStrategy.Eager so they refresh whenever the pipeline does,
 * exactly as the inline template did.
 */
export const DATA_HANDLING = new InjectionToken<DataHandlingComponent>('DATA_HANDLING');
