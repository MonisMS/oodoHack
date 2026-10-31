import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'get', path: '/customers', roles: ["ADMIN", "STAFF"], query: s.customerQuery },
  { method: 'get', path: '/staff', roles: ["ADMIN"], query: s.listQuery },
  { method: 'post', path: '/staff', roles: ["ADMIN"], body: s.staffInput },
  { method: 'put', path: '/:id', roles: ["ADMIN"], body: s.userUpdateInput, params: s.idParams }
], controller);
