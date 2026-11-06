import type { User } from 'firebase/auth';
declare const __ALLOWED_GOOGLE_EMAIL_HASHES__: string[];
export const accessConfigured = __ALLOWED_GOOGLE_EMAIL_HASHES__.length > 0;
export async function isAllowedGoogleUser(user: User, hashes = __ALLOWED_GOOGLE_EMAIL_HASHES__) {
  if (
    !user.emailVerified ||
    !user.email ||
    !user.providerData.some((p) => p.providerId === 'google.com')
  )
    return false;
  const value = new TextEncoder().encode(user.email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', value);
  const hash = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
  return hashes.includes(hash);
}
