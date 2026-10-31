import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'discounts', element: <IndexPage title="Discounts" />, roles: ["ADMIN"] }
];
