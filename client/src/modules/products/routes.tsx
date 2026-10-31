import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'products', element: <IndexPage title="Products" />, roles: ["ADMIN", "STAFF"] },
  { path: 'products/new', element: <IndexPage title="New product" />, roles: ["ADMIN"] },
  { path: 'products/:id', element: <IndexPage title="Product details" />, roles: ["ADMIN", "STAFF"] }
];
