import type { ModuleRoute } from '../../lib/routes';
import SubscriptionDetailPage from './pages/SubscriptionDetailPage';
import SubscriptionFormPage from './pages/SubscriptionFormPage';
import SubscriptionListPage from './pages/SubscriptionListPage';
const roles: ModuleRoute['roles'] = ['ADMIN', 'STAFF'];
export const routes: ModuleRoute[] = [
  { path: 'subscriptions', element: <SubscriptionListPage />, roles },
  { path: 'subscriptions/new', element: <SubscriptionFormPage />, roles },
  { path: 'subscriptions/:id', element: <SubscriptionDetailPage />, roles },
  { path: 'subscriptions/:id/edit', element: <SubscriptionFormPage />, roles },
];
