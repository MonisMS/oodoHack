import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'taxes', element: <IndexPage />, roles: ["ADMIN"] }
];
