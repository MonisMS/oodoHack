import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'subscriptions', element: <IndexPage title="Subscriptions" />, roles: ["ADMIN", "STAFF"] },
  { path: 'subscriptions/new', element: <IndexPage title="New subscription" />, roles: ["ADMIN", "STAFF"] },
  { path: 'subscriptions/:id', element: <IndexPage title="Subscription details" />, roles: ["ADMIN", "STAFF"] }
];
