import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'quotation-templates', element: <IndexPage title="Quotation templates" />, roles: ["ADMIN", "STAFF"] },
  { path: 'quotation-templates/new', element: <IndexPage title="New template" />, roles: ["ADMIN", "STAFF"] },
  { path: 'quotation-templates/:id', element: <IndexPage title="Template details" />, roles: ["ADMIN", "STAFF"] }
];
