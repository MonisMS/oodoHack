// Immutable fixture identifiers (owner A). Seed data (D) and every module's tests use these exact IDs,
// so tests written by different people can refer to the same rows. Never change an existing value;
// add new ones only through A. All are valid RFC-4122 UUIDs (v4 shape) so they pass `z.string().uuid()`.
// Groups: 1xx users, 2xx catalog.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const FIXTURE_IDS = {
  users: {
    admin: uuid(101),
    staffPriya: uuid(201),
    staffRahul: uuid(202),
    customerAcme: uuid(301),
    customerNorthwind: uuid(302),
    customerGlobex: uuid(303),
  },
  catalog: {
    taxGst18: uuid(401),
    taxGst5: uuid(402),
    productCrm: uuid(411),
    variantCrmOdoo: uuid(412), // Brand = Odoo, +560.00
    variantCrmOther: uuid(413),
    planMonthly: uuid(421),
    planYearly: uuid(422),
    discountSeats: uuid(431), // 10% when quantity >= 5
  },
} as const;

/** Demo-only password for fixture logins. D's seed must refuse to run with it when NODE_ENV=production. */
export const DEMO_PASSWORD = 'Brightloop!2026';

export const FIXTURE_USERS = [
  { id: FIXTURE_IDS.users.admin, name: 'Asha Admin', email: 'admin@brightloop.local', role: 'ADMIN' },
  { id: FIXTURE_IDS.users.staffPriya, name: 'Priya Staff', email: 'priya@brightloop.local', role: 'STAFF' },
  { id: FIXTURE_IDS.users.staffRahul, name: 'Rahul Staff', email: 'rahul@brightloop.local', role: 'STAFF' },
  { id: FIXTURE_IDS.users.customerAcme, name: 'Acme Retail', email: 'billing@acme.example', role: 'CUSTOMER' },
  { id: FIXTURE_IDS.users.customerNorthwind, name: 'Northwind Traders', email: 'accounts@northwind.example', role: 'CUSTOMER' },
  { id: FIXTURE_IDS.users.customerGlobex, name: 'Globex Corporation', email: 'finance@globex.example', role: 'CUSTOMER' },
] as const;
