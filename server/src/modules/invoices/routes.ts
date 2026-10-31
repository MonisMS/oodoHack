import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'get', path: '/', roles: ["ADMIN", "STAFF"], query: s.invoiceQuery },
  { method: 'get', path: '/:id', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'post', path: '/:id/confirm', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'post', path: '/:id/cancel', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'post', path: '/:id/send', roles: ["ADMIN", "STAFF"], params: s.idParams }
], controller);
