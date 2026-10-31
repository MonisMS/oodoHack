import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'post', path: '/run', roles: ["ADMIN", "STAFF"], body: s.billingInput }
], controller);
