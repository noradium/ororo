import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  type Auth,
  type User,
  signInWithPopup,
  signInWithRedirect,
  linkWithPopup,
  getRedirectResult,
} from 'firebase/auth';
import { loginWithGoogle, finishGoogleRedirect } from './googleAuth';

vi.mock('firebase/auth', async (original) => ({
  ...(await original<typeof import('firebase/auth')>()),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  linkWithPopup: vi.fn(),
  linkWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
}));
const auth = {
  config: { authDomain: 'diary.firebaseapp.com' },
  emulatorConfig: null,
} as unknown as Auth;
let stored: Map<string, string>;
beforeEach(() => {
  vi.resetAllMocks();
  stored = new Map();
  vi.stubGlobal('location', { host: 'diary.firebaseapp.com' });
  vi.stubGlobal('sessionStorage', {
    setItem: (k: string, v: string) => stored.set(k, v),
    getItem: (k: string) => stored.get(k) ?? null,
    removeItem: (k: string) => stored.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('uses Google popup sign-in and does not redirect after success', async () => {
  await loginWithGoogle(auth);
  expect(vi.mocked(signInWithPopup).mock.calls[0][1].providerId).toBe('google.com');
  expect(signInWithRedirect).not.toHaveBeenCalled();
});
it('falls back to redirect after a blocked popup and restores the family panel on return', async () => {
  vi.mocked(signInWithPopup).mockRejectedValue({ code: 'auth/popup-blocked' });
  await loginWithGoogle(auth);
  expect(signInWithRedirect).toHaveBeenCalled();
  vi.mocked(getRedirectResult).mockResolvedValue(null);
  expect(await finishGoogleRedirect(auth)).toBe(true);
  expect(stored.size).toBe(0);
});
it('treats closing the Google chooser as cancellation without navigating away', async () => {
  vi.mocked(signInWithPopup).mockRejectedValue({ code: 'auth/popup-closed-by-user' });
  await expect(loginWithGoogle(auth)).rejects.toMatchObject({ code: 'auth/popup-closed-by-user' });
  expect(signInWithRedirect).not.toHaveBeenCalled();
});
it('refuses third-party redirect storage and keeps the user on the original site', async () => {
  vi.stubGlobal('location', { host: 'diary.web.app' });
  await expect(loginWithGoogle(auth, undefined, true)).rejects.toThrow('同じ認証ドメイン');
  expect(signInWithRedirect).not.toHaveBeenCalled();
});
it('links an already signed-in account rather than creating another identity', async () => {
  const user = { uid: 'existing' } as User;
  await loginWithGoogle(auth, user);
  expect(linkWithPopup).toHaveBeenCalledWith(
    user,
    expect.objectContaining({ providerId: 'google.com' }),
    expect.anything(),
  );
  expect(signInWithPopup).not.toHaveBeenCalled();
});
it('surfaces redirect errors and clears stale pending state', async () => {
  stored.set('ororo-google-redirect', 'pending');
  vi.mocked(getRedirectResult).mockRejectedValue({ code: 'auth/unauthorized-domain' });
  await expect(finishGoogleRedirect(auth)).rejects.toMatchObject({
    code: 'auth/unauthorized-domain',
  });
  expect(stored.size).toBe(0);
});
