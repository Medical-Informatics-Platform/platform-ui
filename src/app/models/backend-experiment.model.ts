import { AnalysisRequest } from './backend-algorithms.model';

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
  analysis: AnalysisRequest;
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
