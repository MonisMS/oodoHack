import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'post', path: '/signup', body: s.signupInput },
  { method: 'post', path: '/login', body: s.loginInput },
  { method: 'post', path: '/logout', roles: ["ADMIN", "STAFF", "CUSTOMER"] },
  { method: 'get', path: '/me', roles: ["ADMIN", "STAFF", "CUSTOMER"] },
  { method: 'post', path: '/forgot-password', body: s.forgotPasswordInput },
  { method: 'post', path: '/reset-password', body: s.resetPasswordInput }
], controller);
