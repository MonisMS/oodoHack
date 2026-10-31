import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'login', element: <IndexPage title="Sign in" /> },
  { path: 'signup', element: <IndexPage title="Create an account" /> },
  { path: 'forgot-password', element: <IndexPage title="Reset your password" /> },
  { path: 'reset-password', element: <IndexPage title="Choose a new password" /> }
];
