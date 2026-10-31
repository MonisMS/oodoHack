import type { ModuleRoute } from '../../lib/routes';
import PaymentsPage from './pages/PaymentsPage';
export const routes: ModuleRoute[] = [
  { path: 'payments', element: <PaymentsPage />, roles: ['ADMIN', 'STAFF'] },
];
