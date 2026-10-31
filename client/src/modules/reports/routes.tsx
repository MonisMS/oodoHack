import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'dashboard', element: <IndexPage title="Dashboard" />, roles: ["ADMIN", "STAFF"] }
];
