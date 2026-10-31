import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { RouteAccess } from './lib/routes';
import { useSession } from './lib/session';
import { routes as module0 } from './modules/auth/routes';
import { routes as module1 } from './modules/users/routes';
import { routes as module2 } from './modules/products/routes';
import { routes as module3 } from './modules/plans/routes';
import { routes as module4 } from './modules/taxes/routes';
import { routes as module5 } from './modules/discounts/routes';
import { routes as module6 } from './modules/quotation-templates/routes';
import { routes as module7 } from './modules/subscriptions/routes';
import { routes as module8 } from './modules/invoices/routes';
import { routes as module9 } from './modules/billing-engine/routes';
import { routes as module10 } from './modules/payments/routes';
import { routes as module11 } from './modules/reports/routes';
import { routes as module12 } from './modules/portal/routes';
function Home() {
  const { role, status } = useSession();
  if (status === 'loading') return <p role="status">Loading...</p>; // do not bounce a signed-in user to /login while the session loads
  return <Navigate to={role === 'CUSTOMER' ? '/portal' : role ? '/dashboard' : '/login'} replace />;
}
export const router = createBrowserRouter([{ element: <AppLayout />, children: [
  { index: true, element: <Home /> },
  ...[...module0, ...module1, ...module2, ...module3, ...module4, ...module5, ...module6, ...module7, ...module8, ...module9, ...module10, ...module11, ...module12].map(route => ({ path: route.path, element: <RouteAccess roles={route.roles}>{route.element}</RouteAccess> })),
  { path: '*', element: <p>Page not found.</p> },
] }]);
