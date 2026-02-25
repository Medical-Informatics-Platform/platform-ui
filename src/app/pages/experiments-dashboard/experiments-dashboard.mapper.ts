import { BackendExperiment } from "../../models/backend-experiment.model";
import { BackendFilter } from "../../models/filters.model";
import { Experiment, AlgorithmDetails, UserDetails } from './../../models/experiments-dashboard.model';


function collectFilterVariableCodes(
  logic: BackendFilter | null | undefined
): string[] {
  if (!logic) return [];
  const codes = new Set<string>();

  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node.rules)) {
      node.rules.forEach(walk);
    } else if (node.field || node.id) {
      const c = node.field ?? node.id;
      if (typeof c === 'string') codes.add(c);
    }
  };

  walk(logic);
  return [...codes];
}

function normalizeToStringArray(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value === null || value === undefined || value === '') {
    return [];
  }
  return [String(value)];
}

// Map BackendExperiment to Experiment
export function mapBackendToFrontend(backend: BackendExperiment): Experiment {

  console.groupCollapsed('[Mapper] BackendExperiment → Experiment');
  console.groupEnd();

  const input = backend.algorithm?.inputdata || {};
  const filtersLogic = input.filters ?? null;

  return {
    id: backend.uuid,
    name: backend.name,
    dateCreated: new Date(backend.created),
    description: backend.description ?? '',
    status: backend.status,

    algorithmName: backend.algorithm?.name,
    author:
      backend.createdBy.fullname ||
      backend.createdBy.username ||
      backend.createdBy.email,
    authorEmail: backend.createdBy.email,
    isShared: backend.shared,

    domain: input.data_model ?? null,
    datasets: normalizeToStringArray(input.datasets),
    variables: normalizeToStringArray(input.y),
    covariates: normalizeToStringArray(input.x),
    filters: collectFilterVariableCodes(filtersLogic),
    mipVersion: backend.mipVersion ?? undefined,
  };
}


// Map BackendExperiment to AlgorithmDetails
export function mapBackendToAlgorithmDetails(backend: BackendExperiment): AlgorithmDetails {
  return {
    name: backend.algorithm.name,
    datasets: normalizeToStringArray(backend.algorithm.inputdata.datasets),
    parameters: backend.algorithm.parameters,
    dataModel: backend.algorithm.inputdata.data_model,
  };
}

// Map BackendExperiment to UserDetails
export function mapBackendToUserDetails(backend: BackendExperiment): UserDetails {
  return {
    username: backend.createdBy.username,
    fullname: backend.createdBy.fullname,
    email: backend.createdBy.email,
  };
}

// Map Experiment to BackendExperiment (Frontend to Backend)
export function mapFrontendToBackend(frontend: Experiment): Partial<BackendExperiment> {
  return {
    uuid: frontend.id,
    name: frontend.name,
    created: frontend.dateCreated.toISOString(),
    status: frontend.status,
  };
}
