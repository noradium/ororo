import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { User } from 'firebase/auth';
import { isAllowedGoogleUser } from './access';
import { parseAllowedEmails, renderAccessRules } from '../scripts/access-config.mjs';

const user = {
  email: 'Owner@Gmail.com',
  emailVerified: true,
  providerData: [{ providerId: 'google.com' }],
} as User;
const hashes = [createHash('sha256').update('owner@gmail.com').digest('hex')];
it('only accepts the verified Google identity in the configured list', async () => {
  expect(await isAllowedGoogleUser(user, hashes)).toBe(true);
  expect(await isAllowedGoogleUser({ ...user, email: 'other@gmail.com' } as User, hashes)).toBe(
    false,
  );
  expect(await isAllowedGoogleUser({ ...user, emailVerified: false } as User, hashes)).toBe(false);
  expect(
    await isAllowedGoogleUser(
      { ...user, providerData: [{ providerId: 'password' }] } as User,
      hashes,
    ),
  ).toBe(false);
  expect(await isAllowedGoogleUser(user, [])).toBe(false);
});
it('normalizes multiple addresses and fails closed when unset', () => {
  expect(parseAllowedEmails(' A@Gmail.com, b@gmail.com\nA@gmail.com ')).toEqual([
    'a@gmail.com',
    'b@gmail.com',
  ]);
  expect(parseAllowedEmails('')).toEqual([]);
  expect(() => parseAllowedEmails('not-an-email')).toThrow();
});
it('generates backend rules from the same normalized list without replacement interpolation', () => {
  expect(renderAccessRules('email in [] /* ALLOWED_GOOGLE_EMAILS */;', ['OWNER@gmail.com'])).toBe(
    'email in ["owner@gmail.com"];',
  );
  expect(renderAccessRules('email in [] /* ALLOWED_GOOGLE_EMAILS */;', [])).toBe('email in [];');
  expect(
    renderAccessRules('email in [] /* ALLOWED_GOOGLE_EMAILS */;', ['a$&@example.com']),
  ).toContain('a$&@example.com');
});
