import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'get', path: '/', roles: ["ADMIN", "STAFF"], query: s.invoiceQuery },
  { method: 'post', path: '/confirm', roles: ["ADMIN", "STAFF"], body: s.bulkInvoiceInput },
  { method: 'post', path: '/send', roles: ["ADMIN", "STAFF"], body: s.bulkInvoiceInput },
  { method: 'post', path: '/remind', roles: ["ADMIN", "STAFF"], body: s.bulkInvoiceInput },
  { method: 'get', path: '/:id', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'post', path: '/:id/confirm', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'post', path: '/:id/cancel', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'post', path: '/:id/send', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'post', path: '/:id/remind', roles: ["ADMIN", "STAFF"], params: s.idParams }
], controller);
