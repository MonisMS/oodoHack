import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'get', path: '/summary', roles: ["ADMIN", "STAFF"], query: s.reportQuery }
], controller);
