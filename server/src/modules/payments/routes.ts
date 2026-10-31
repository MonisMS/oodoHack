import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'get', path: '/', roles: ["ADMIN", "STAFF"], query: s.paymentQuery },
  { method: 'post', path: '/', roles: ["ADMIN", "STAFF"], body: s.paymentInput }
], controller);
