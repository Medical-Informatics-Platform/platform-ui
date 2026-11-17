import { AnalysisRequest } from './backend-algorithms.model';

export interface BackendAnalysis {
  uuid: string;
  name: string;
  created: string;
  finished: string;
  shared: boolean;
  viewed: boolean;
  status: string;
  description?: string;
  mipVersion?: string;
  analysisRequest: AnalysisRequest;
  createdBy: {
    username: string;
    fullname: string;
    email: string;
    subjectId: string;
    agreeNDA: boolean;
  };
}

export interface BackendAnalysisWithResult extends BackendAnalysis {
  result?: any;
}
