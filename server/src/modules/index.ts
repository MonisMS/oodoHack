import type { Express } from 'express';
import module0 from './auth/routes.js';
import module1 from './users/routes.js';
import module2 from './products/routes.js';
import module3 from './plans/routes.js';
import module4 from './taxes/routes.js';
import module5 from './discounts/routes.js';
import module6 from './quotation-templates/routes.js';
import module7 from './subscriptions/routes.js';
import module8 from './invoices/routes.js';
import module9 from './billing-engine/routes.js';
import module10 from './payments/routes.js';
import module11 from './reports/routes.js';
import module12 from './portal/routes.js';
export function registerModules(app: Express) {
  app.use('/api/auth', module0);
  app.use('/api/users', module1);
  app.use('/api/products', module2);
  app.use('/api/plans', module3);
  app.use('/api/taxes', module4);
  app.use('/api/discounts', module5);
  app.use('/api/quotation-templates', module6);
  app.use('/api/subscriptions', module7);
  app.use('/api/invoices', module8);
  app.use('/api/billing', module9);
  app.use('/api/payments', module10);
  app.use('/api/reports', module11);
  app.use('/api/portal', module12);
}
