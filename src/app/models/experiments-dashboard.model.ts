import { BackendFilter } from './filters.model';

export interface Experiment {
  id: string;
  name: string;
  dateCreated: Date;
  description?: string;
  status: string;
  algorithmName: string;
  author: string;
  authorEmail: string;
  isShared: boolean;

  domain?: string | null;
  datasets?: string[];
  variables?: string[];
  covariates?: string[];
  filters?: string[];
  filterLogic?: BackendFilter | null;
  preprocessing?: Record<string, unknown> | null;
  mipVersion?: string;
}

export interface AlgorithmDetails {
  name: string;
  datasets: string[];
  parameters: Record<string, unknown>;
  dataModel: string;
}

export interface UserDetails {
  username: string;
  fullname: string;
  email: string;
}
