import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'plans', element: <IndexPage title="Plans" />, roles: ["ADMIN", "STAFF"] },
  { path: 'plans/new', element: <IndexPage title="New plan" />, roles: ["ADMIN"] },
  { path: 'plans/:id', element: <IndexPage title="Plan details" />, roles: ["ADMIN", "STAFF"] }
];
