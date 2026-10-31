import type { ModuleRoute } from '../../lib/routes';
import TemplateDetailPage from './pages/TemplateDetailPage';
import TemplateFormPage from './pages/TemplateFormPage';
import TemplateListPage from './pages/TemplateListPage';
const roles: ModuleRoute['roles'] = ['ADMIN', 'STAFF'];
export const routes: ModuleRoute[] = [
  { path: 'quotation-templates', element: <TemplateListPage />, roles },
  { path: 'quotation-templates/new', element: <TemplateFormPage />, roles },
  { path: 'quotation-templates/:id', element: <TemplateDetailPage />, roles },
  { path: 'quotation-templates/:id/edit', element: <TemplateFormPage />, roles },
];
