import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'get', path: '/', roles: ["ADMIN", "STAFF"], query: s.listQuery },
  { method: 'post', path: '/', roles: ["ADMIN"], body: s.taxInput },
  { method: 'get', path: '/:id', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'put', path: '/:id', roles: ["ADMIN"], body: s.taxInput, params: s.idParams },
  { method: 'delete', path: '/:id', roles: ["ADMIN"], params: s.idParams }
], controller);
