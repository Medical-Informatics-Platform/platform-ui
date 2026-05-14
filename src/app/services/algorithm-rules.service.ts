
import { Injectable } from '@angular/core';
import { AlgorithmConfig } from '../models/algorithm-definition.model';
import { D3HierarchyNode } from '../models/data-model.interface';
import { VariableTypes, AlgorithmRoles } from '../core/constants/algorithm.constants';

type SelectionRole = 'y' | 'x' | 'filters';
type RoleSelections = Record<SelectionRole, D3HierarchyNode[]>;

interface AvailabilitySelections extends RoleSelections {
    hasActiveFilter?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class AlgorithmRulesService {

    constructor() { }

    isAlgorithmAvailable(
        algo: AlgorithmConfig,
        selections: AvailabilitySelections
    ): boolean {
        if (!algo?.inputdata) return false;
        const name = algo.name;

        const hasRole = (role: string) => Object.prototype.hasOwnProperty.call(algo.inputdata, role);

        const filterReq = hasRole(AlgorithmRoles.FILTERS)
            ? (algo.inputdata as any).filters
            : hasRole(AlgorithmRoles.FILTER)
                ? (algo.inputdata as any).filter
                : null;

        for (const [role, req] of Object.entries(algo.inputdata)) {
            if (![AlgorithmRoles.Y, AlgorithmRoles.X].includes(role)) continue;

            const sel: D3HierarchyNode[] = selections[role as SelectionRole] ?? [];
            const isRequired = this.isFieldRequired(req);
            const multiple = this.normalizeBool((req as any)?.multiple);

            if (isRequired && sel.length === 0) {
                console.warn(`✘ ${name}: role ${role} is required but selection is empty.`);
                return false;
            }

            if (multiple === false && sel.length > 1) {
                console.warn(`✘ ${name}: role ${role} only allows single selection but has ${sel.length}.`);
                return false;
            }

            if (sel.length === 0) continue;

            // type check
            if ((req as any).types?.length) {
                const reqTypes = ((req as any).types as string[]).map(t => this.normalizeType(t));
                const selTypes = sel
                    .map(v => this.normalizeType(v.type))
                    .filter((t): t is string => !!t);

                const badTypeIndex = selTypes.findIndex(t => !reqTypes.includes(t));
                if (badTypeIndex !== -1) {
                    console.warn(
                        `✘ ${name}: invalid type on role ${role}: "${selTypes[badTypeIndex]}" (from variable "${sel[badTypeIndex].label}") not in [${reqTypes.join(', ')}]`
                    );
                    return false;
                }
            }
        }

        const yConfigured = Object.prototype.hasOwnProperty.call(algo.inputdata, AlgorithmRoles.Y);
        const xConfigured = Object.prototype.hasOwnProperty.call(algo.inputdata, AlgorithmRoles.X);

        if (!yConfigured && selections.y.length > 0) return false;
        if (!xConfigured && selections.x.length > 0) return false;

        if (filterReq) {
            const isRequired = this.isFieldRequired(filterReq);
            const hasActiveFilter = selections.hasActiveFilter ?? false;

            // The studio always submits filters as a single rule tree object. Availability should
            // therefore be based on whether there is an active filter payload, not on how many
            // variables participate in that payload.
            if (isRequired && !hasActiveFilter) {
                console.warn(`✘ ${name}: filters are required but no active filter payload is configured.`);
                return false;
            }
        }

        return true;
    }

    // helper: normalize types from UI -> backend
    private normalizeType(t: string | undefined | null): string | undefined {
        if (!t) return undefined;
        switch (t) {
            case VariableTypes.NOMINAL: return VariableTypes.TEXT;
            case VariableTypes.INTEGER: return VariableTypes.INT;
            case 'polynominal': return VariableTypes.TEXT;
            case 'ordinal': return VariableTypes.TEXT;
            default: return t; // real, text, binary...
        }
    }

    private normalizeBool(value: boolean | string | undefined | null): boolean | null {
        if (value === undefined || value === null) return null;
        if (typeof value === 'boolean') return value;
        const normalized = String(value).trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
        return null;
    }

    private isFieldRequired(field: any): boolean {
        // Prefer canonical `required`, but keep legacy `notblank` compatibility.
        const required = this.normalizeBool(field?.required);
        if (required !== null) return required;
        return this.normalizeBool(field?.notblank) === true;
    }
}
