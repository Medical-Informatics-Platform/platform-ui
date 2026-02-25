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
