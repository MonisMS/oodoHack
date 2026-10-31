import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'get', path: '/summary', roles: ["CUSTOMER"] },
  { method: 'get', path: '/subscriptions', roles: ["CUSTOMER"], query: s.portalSubscriptionQuery },
  { method: 'get', path: '/subscriptions/:id', roles: ["CUSTOMER"], params: s.idParams },
  { method: 'post', path: '/subscriptions/:id/cancel-at-period-end', roles: ["CUSTOMER"], body: s.cancellationInput, params: s.idParams },
  { method: 'post', path: '/subscriptions/:id/keep', roles: ["CUSTOMER"], body: s.cancellationInput, params: s.idParams },
  { method: 'get', path: '/invoices', roles: ["CUSTOMER"], query: s.portalInvoiceQuery },
  { method: 'get', path: '/invoices/:id', roles: ["CUSTOMER"], params: s.idParams }
], controller);
