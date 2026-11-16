import { Injectable } from '@angular/core';
import {
    AlgorithmAvailability,
    AlgorithmAvailabilityDetail,
    AlgorithmAvailabilityRole,
    AlgorithmConfig,
} from '../models/algorithm-definition.model';
import { D3HierarchyNode } from '../models/data-model.interface';
import { AlgorithmRoles } from '../core/constants/algorithm.constants';
import { resolveInputMaxCount, resolveInputMinCount } from '../core/algorithm-input-counts';
import {
    acceptedVariableTypes,
    describeVariableType,
    formatSlotStatTypes,
    isFreeTextCde,
    specificationAcceptsVariableType,
} from '../core/data-model.utils';

type SelectionRole = 'y' | 'x';
type AvailabilitySelections = Record<SelectionRole, D3HierarchyNode[]>;

@Injectable({
    providedIn: 'root'
})
export class AlgorithmRulesService {
    constructor() { }

    evaluateAlgorithmAvailability(
        algo: AlgorithmConfig,
        selections: AvailabilitySelections
    ): AlgorithmAvailability {
        if (!algo?.inputdata) {
            return {
                available: false,
                summary: 'Algorithm has no input data specification.',
                details: [],
            };
        }

        const details: AlgorithmAvailabilityDetail[] = [];
        const hasRole = (role: string) => Object.prototype.hasOwnProperty.call(algo.inputdata, role);

        if (hasRole(AlgorithmRoles.Y)) {
            details.push(this.evaluateRole('y', (algo.inputdata as any).y, selections.y ?? [], algo));
        } else if ((selections.y ?? []).length > 0) {
            details.push(this.evaluateUnsupportedRole('y', selections.y.length));
        }

        if (hasRole(AlgorithmRoles.X)) {
            details.push(this.evaluateRole('x', (algo.inputdata as any).x, selections.x ?? [], algo));
        } else if ((selections.x ?? []).length > 0) {
            details.push(this.evaluateUnsupportedRole('x', selections.x.length));
        }

        this.addOverlapMessages(details, selections.y ?? [], selections.x ?? []);

        const available = details.every((detail) => detail.messages.length === 0);
        return {
            available,
            summary: details.find((detail) => detail.messages.length > 0)?.messages[0] ?? null,
            details: details.map((detail) => ({
                ...detail,
                satisfied: detail.messages.length === 0,
            })),
        };
    }

    isAlgorithmAvailable(
        algo: AlgorithmConfig,
        selections: AvailabilitySelections
    ): boolean {
        return this.evaluateAlgorithmAvailability(algo, selections).available;
    }

    private evaluateRole(
        role: Extract<AlgorithmAvailabilityRole, 'y' | 'x'>,
        field: any,
        selected: D3HierarchyNode[],
        algo: AlgorithmConfig
    ): AlgorithmAvailabilityDetail {
        const label = this.roleLabel(role);
        const minCount = resolveInputMinCount(field, role, algo.name);
        const maxCount = resolveInputMaxCount(field, role, algo.name);
        const types = this.normalizeStringList(field?.types);
        const stattypes = this.normalizeStringList(field?.stattypes);
        const messages: string[] = [];

        if (selected.length < minCount) {
            if (selected.length === 0) {
                messages.push(label + ' needs at least ' + minCount + ' (none assigned).');
            } else {
                messages.push(label + ' needs at least ' + minCount + ', selected ' + selected.length + '.');
            }
        }

        if (maxCount !== null && selected.length > maxCount) {
            messages.push(label + ' allows at most ' + maxCount + ', selected ' + selected.length + '.');
        }

        if (this.hasDuplicateCodes(selected)) {
            messages.push(label + ' contains duplicate selections.');
        }

        // Slots match CDE types one-to-one: a nominal variable never fills a binary or ordinal slot.
        const acceptedTypes = acceptedVariableTypes(field);
        if (selected.length > 0 && acceptedTypes.length > 0) {
            const invalid = selected.find((node) => {
                const type = (node as any).type;
                return !!type && !specificationAcceptsVariableType(field, type);
            });
            if (invalid) {
                this.pushUnique(messages, this.typeRequirementMessage(label, acceptedTypes, invalid));
            }
        }

        // Derived columns get their categories from the creator config, not the CDE.
        if (selected.some((node) => !(node as any).isCreatedColumn && isFreeTextCde(node as any))) {
            messages.push(label + ' contains a free-text variable, which cannot be analysed.');
        }

        return {
            role,
            label,
            selectedCount: selected.length,
            minCount,
            maxCount,
            required: minCount > 0 || this.isFieldRequired(field),
            types,
            stattypes,
            acceptedTypes,
            messages,
            satisfied: messages.length === 0,
        };
    }

    private evaluateUnsupportedRole(
        role: Extract<AlgorithmAvailabilityRole, 'y' | 'x'>,
        selectedCount: number
    ): AlgorithmAvailabilityDetail {
        const label = this.roleLabel(role);
        return {
            role,
            label,
            selectedCount,
            minCount: 0,
            maxCount: 0,
            required: false,
            types: [],
            stattypes: [],
            acceptedTypes: [],
            messages: [label + ' is not accepted by this algorithm.'],
            satisfied: false,
        };
    }

    private addOverlapMessages(
        details: AlgorithmAvailabilityDetail[],
        y: D3HierarchyNode[],
        x: D3HierarchyNode[]
    ): void {
        if (!this.hasOverlap(y, x)) return;
        const yDetail = details.find((detail) => detail.role === 'y');
        const xDetail = details.find((detail) => detail.role === 'x');
        yDetail?.messages.push('Outcome is already selected as a predictor.');
        xDetail?.messages.push('Predictor is already selected as an outcome.');
    }

    private roleLabel(role: AlgorithmAvailabilityRole): string {
        return role === 'y' ? 'Outcome' : 'Predictor';
    }

    /** `Outcome must be binary (sex is nominal).` — the accepted CDE types, then what was selected. */
    private typeRequirementMessage(label: string, acceptedTypes: string[], offender: D3HierarchyNode): string {
        const name = String((offender as any).label ?? (offender as any).code ?? '').trim();
        const found = describeVariableType((offender as any).type);
        return label + ' must be ' + formatSlotStatTypes(acceptedTypes) + (name ? ' (' + name + ' is ' + found + ')' : '') + '.';
    }

    private pushUnique(messages: string[], message: string): void {
        if (!messages.includes(message)) {
            messages.push(message);
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

    private normalizeStringList(value: unknown): string[] {
        if (!Array.isArray(value)) return [];
        return Array.from(new Set(
            value
                .map((item) => String(item ?? '').trim())
                .filter((item) => item.length > 0)
        ));
    }

    private hasDuplicateCodes(selection: D3HierarchyNode[]): boolean {
        const codes = selection
            .map((item: any) => item?.code)
            .filter((code): code is string => code !== undefined && code !== null && String(code).trim() !== '')
            .map((code) => String(code));
        return new Set(codes).size !== codes.length;
    }

    private hasOverlap(left: D3HierarchyNode[], right: D3HierarchyNode[]): boolean {
        const leftCodes = new Set(
            left
                .map((item: any) => item?.code)
                .filter((code) => code !== undefined && code !== null && String(code).trim() !== '')
                .map((code) => String(code))
        );
        return right.some((item: any) => leftCodes.has(String(item?.code ?? '')));
    }

    private isFieldRequired(field: any): boolean {
        return this.normalizeBool(field?.required) === true;
    }
}
