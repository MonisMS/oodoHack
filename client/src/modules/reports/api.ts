import { api,queryString } from '../../lib/api';
import type { Data,ReportQuery,ReportSummary } from '../../types/api';
export const reportsApi={summary:async(query:ReportQuery,signal?:AbortSignal)=>(await api<Data<ReportSummary>>('/reports/summary'+queryString(query),{signal})).data};
