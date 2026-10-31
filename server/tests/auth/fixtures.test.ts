import { describe, expect, it } from 'vitest';
import { id, password } from '../../src/lib/contracts.js';
import { DEMO_PASSWORD, FIXTURE_IDS, FIXTURE_USERS } from '../../src/lib/fixtures.js';

describe('fixture identifiers', () => {
  const all = [...Object.values(FIXTURE_IDS.users), ...Object.values(FIXTURE_IDS.catalog)];
  it('are unique and valid UUIDs accepted by the API validators', () => {
    expect(new Set(all).size).toBe(all.length);
    for (const value of all) expect(id.safeParse(value).success, value).toBe(true);
  });
  it('never collide with the development identity', () => { expect(all).not.toContain('00000000-0000-4000-8000-000000000001'); });
  it('give fixture users valid emails, roles and the shared demo password policy', () => {
    expect(password.safeParse(DEMO_PASSWORD).success).toBe(true);
    expect(new Set(FIXTURE_USERS.map(u => u.email)).size).toBe(FIXTURE_USERS.length);
    expect(FIXTURE_USERS.filter(u => u.role === 'ADMIN')).toHaveLength(1);
    expect(FIXTURE_USERS.filter(u => u.role === 'STAFF')).toHaveLength(2);
    for (const u of FIXTURE_USERS) expect(u.email).toBe(u.email.toLowerCase());
  });
});
