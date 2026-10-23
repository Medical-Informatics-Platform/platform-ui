import { Injectable } from '@angular/core';
import { OutlierRule, createDefaultOutlierRule, serializeOutlierRule } from '../../../../core/outlier-rules';
import { LongitudinalStrategy, PreprocessingRule } from '../data-handling.models';
import {
  defaultMissingRule,
  isDefaultMissingRule,
  pendingOrDefault,
  serializeMissingRule,
} from '../utils/preprocessing-state.utils';

/**
 * The preprocessing step's rules: for missing values, outliers and longitudinal
 * strategies, the user's pending edits and what the run uses (applied), keyed by
 * variable code, and the comparisons between the two. Provided by the Data Handling
 * panel; the panel keeps loading, applying and persisting them.
 */
@Injectable()
export class PreprocessingStateService {
  pendingMissing: Record<string, PreprocessingRule> = {};
  appliedMissing: Record<string, PreprocessingRule> = {};
  pendingOutlier: Record<string, OutlierRule> = {};
  appliedOutlier: Record<string, OutlierRule> = {};
  pendingLongitudinal: Record<string, LongitudinalStrategy> = {};
  appliedLongitudinal: Record<string, LongitudinalStrategy> = {};
  /** The applied rules came from the user's Apply in this session, not from a load. */
  userApplied = false;

  /** The variable's pending missing-values rule, created as the step default on first read. */
  missingRule(code: string): PreprocessingRule {
    if (!this.pendingMissing[code]) this.pendingMissing[code] = defaultMissingRule(code);
    return this.pendingMissing[code];
  }

  /** The variable's pending outlier rule, created (clipping off) on first read. */
  outlierRule(code: string): OutlierRule {
    if (!this.pendingOutlier[code]) {
      this.pendingOutlier = { ...this.pendingOutlier, [code]: createDefaultOutlierRule(code, false) };
    }
    return this.pendingOutlier[code];
  }

  /** The run handles the variable's missing values (an enabled rule other than "no action"). */
  hasAppliedMissing(code: string): boolean {
    const rule = this.appliedMissing[code];
    return !!rule?.enabled && rule.action !== 'no_action';
  }

  hasAppliedOutlier(code: string): boolean {
    return !!this.appliedOutlier[code]?.enabled;
  }

  /** Nothing applied and the edit (or its absence) is the step default. */
  isUsingDefaultMissing(code: string): boolean {
    if (this.hasAppliedMissing(code)) return false;
    return isDefaultMissingRule(this.pendingMissing[code] ?? defaultMissingRule(code));
  }

  /**
   * Whether a variable's missing-values edit differs from what the run uses. A variable
   * with nothing applied is compared through the step default (drop rows), and sitting
   * on that implicit default is not a change: no user action is required.
   */
  missingHasPendingChange(code: string): boolean {
    const applied = this.appliedMissing[code];
    const pending = pendingOrDefault(this.pendingMissing[code], applied, () => defaultMissingRule(code));
    if (isDefaultMissingRule(pending) && !this.hasAppliedMissing(code)) return false;
    return serializeMissingRule(pending) !== serializeMissingRule(applied);
  }

  /** Whether a variable's outlier edit differs from what the run uses (default: clipping off). */
  outlierHasPendingChange(code: string): boolean {
    const applied = this.appliedOutlier[code];
    const pending = pendingOrDefault(this.pendingOutlier[code], applied, () => createDefaultOutlierRule(code, false));
    return serializeOutlierRule(pending) !== serializeOutlierRule(applied);
  }
}
