import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  signInWithPopup,
  signInWithRedirect,
  linkWithPopup,
  linkWithRedirect,
  getRedirectResult,
  type Auth,
  type User,
} from 'firebase/auth';

const REDIRECT_KEY = 'ororo-google-redirect';
const provider = () => {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: 'select_account' });
  return google;
};

async function redirect(auth: Auth, user?: User) {
  // Same-origin Firebase Hosting auth helpers avoid Safari's third-party storage restrictions.
  if (!auth.emulatorConfig && auth.config.authDomain !== location.host) {
    throw new Error(
      '画面切り替えログインには配信先と同じ認証ドメインの設定が必要です。ポップアップを許可して再度お試しください。',
    );
  }
  try {
    sessionStorage.setItem(REDIRECT_KEY, 'pending');
  } catch {
    throw new Error('ログインを続けるために、このサイトのストレージを許可してください。');
  }
  try {
    if (user) await linkWithRedirect(user, provider(), browserPopupRedirectResolver);
    else await signInWithRedirect(auth, provider(), browserPopupRedirectResolver);
  } catch (error) {
    sessionStorage.removeItem(REDIRECT_KEY);
    throw error;
  }
}

export async function loginWithGoogle(auth: Auth, user?: User, useRedirect = false): Promise<void> {
  if (useRedirect) return redirect(auth, user);
  try {
    if (user) await linkWithPopup(user, provider(), browserPopupRedirectResolver);
    else await signInWithPopup(auth, provider(), browserPopupRedirectResolver);
  } catch (error) {
    const code = (error as { code?: string }).code;
    // Closing the chooser is cancellation, not consent to another navigation.
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    )
      await redirect(auth, user);
    else throw error;
  }
}

export async function finishGoogleRedirect(auth: Auth): Promise<boolean> {
  let pending = false;
  try {
    pending = sessionStorage.getItem(REDIRECT_KEY) === 'pending';
  } catch {
    /* SDK may still recover its own state. */
  }
  try {
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    return pending || result !== null;
  } catch (error) {
    if (pending) throw error;
    return false;
  } finally {
    try {
      sessionStorage.removeItem(REDIRECT_KEY);
    } catch {
      /* Optional UI state. */
    }
  }
}

export function hasGoogleAccount(user: User) {
  return user.providerData.some((entry) => entry.providerId === GoogleAuthProvider.PROVIDER_ID);
}
