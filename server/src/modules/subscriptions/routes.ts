import { moduleRouter } from '../../lib/module-router.js';
import { controller } from './controller.js';
import * as s from './schemas.js';
export default moduleRouter([
  { method: 'get', path: '/', roles: ["ADMIN", "STAFF"], query: s.subscriptionQuery },
  { method: 'post', path: '/', roles: ["ADMIN", "STAFF"], body: s.subscriptionInput },
  { method: 'post', path: '/from-template', roles: ["ADMIN", "STAFF"], body: s.fromTemplateInput },
  { method: 'get', path: '/:id', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'put', path: '/:id', roles: ["ADMIN", "STAFF"], body: s.subscriptionInput, params: s.idParams },
  { method: 'delete', path: '/:id', roles: ["ADMIN", "STAFF"], params: s.idParams },
  { method: 'post', path: '/:id/transition', roles: ["ADMIN", "STAFF"], body: s.transitionInput, params: s.idParams },
  { method: 'post', path: '/:id/schedule-cancellation', roles: ["ADMIN", "STAFF"], body: s.cancellationInput, params: s.idParams },
  { method: 'post', path: '/:id/unschedule-cancellation', roles: ["ADMIN", "STAFF"], body: s.cancellationInput, params: s.idParams },
  { method: 'post', path: '/:id/change-lines', roles: ["ADMIN", "STAFF"], body: s.changeLinesInput, params: s.idParams }
], controller);
