import { BackendFilter } from './filters.model';

export interface BackendExperiment {
  uuid: string;
  name: string;
  created: string;
  finished: string;
  shared: boolean;
  viewed: boolean;
  status: string;
  description?: string;
  mipVersion?: string;
  algorithm: {
    name: string;
    inputdata: {
      data_model: string;
      datasets: string[] | string | null;
      y: string[] | string | null;
      x: string[] | string | null;
      filters: BackendFilter | null;
    };
    parameters: Record<string, unknown>;
    status: string;
  };
  createdBy: {
    username: string;
    fullname: string;
    email: string;
    subjectId: string;
    agreeNDA: boolean;
  };
}

export interface BackendExperimentWithResult extends BackendExperiment {
  result?: any;
}
