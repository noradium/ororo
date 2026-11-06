import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { accessConfigured, isAllowedGoogleUser } from './access';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { auth, configured } from './firebase';
import { finishGoogleRedirect, loginWithGoogle } from './googleAuth';
import { friendlyError } from './FamilyPanel';
import { Diary, readInvitation } from './Diary';
import { Portrait } from './Portrait';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(auth ? undefined : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [returnedFromLogin, setReturnedFromLogin] = useState(false);
  const generation = useRef(0);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    readInvitation();
    window.addEventListener('hashchange', readInvitation);
    return () => window.removeEventListener('hashchange', readInvitation);
  }, []);
  useEffect(() => {
    if (!auth) return;
    let active = true;
    const stop = onAuthStateChanged(
      auth,
      (current) => {
        const attempt = ++generation.current;
        if (!current) {
          setUser(null);
          return;
        }
        setUser(undefined);
        void isAllowedGoogleUser(current)
          .then(async (allowed) => {
            if (!active || attempt !== generation.current) return;
            if (allowed) {
              setUser(current);
              setError('');
            } else {
              setUser(null);
              setError(
                'このGoogleアカウントでは利用できません。許可されたアカウントでログインしてください。',
              );
              await signOut(auth!);
            }
          })
          .catch((failure) => {
            if (active && attempt === generation.current) {
              setUser(null);
              setError(friendlyError(failure));
            }
          });
      },
      (failure) => {
        setUser(null);
        setError(friendlyError(failure));
      },
    );
    void finishGoogleRedirect(auth)
      .then((returned) => {
        if (active && returned) setReturnedFromLogin(true);
      })
      .catch((failure) => {
        if (active) setError(friendlyError(failure));
      });
    return () => {
      active = false;
      stop();
    };
  }, []);
  // No record components or database connections exist until auth is restored.
  // A UID change unmounts every dialog, subscription and transient record state.
  if (user)
    return (
      <Diary
        key={user.uid}
        initialUser={user}
        redirectError={error}
        returnedFromLogin={returnedFromLogin}
        needRefresh={needRefresh}
        updateServiceWorker={updateServiceWorker}
      />
    );

  async function login(redirect = false) {
    if (!auth) return;
    setBusy(true);
    setError('');
    try {
      await loginWithGoogle(auth, undefined, redirect);
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setBusy(false);
    }
  }
  const checking = user === undefined;
  return (
    <main className="welcome" aria-label="ログイン画面">
      <div className="welcome-card">
        <span className="eyebrow">A LITTLE DIARY FOR OUR CATS</span>
        <h1>おろろ</h1>
        <p className="welcome-tagline">ねこの毎日を、家族と。</p>
        <div className="welcome-cats" role="img" aria-label="グレーの猫と白い猫のイラスト">
          <span className="welcome-cat">
            <Portrait cat="MONET" />
          </span>
          <span className="welcome-cat">
            <Portrait cat="RENOIR" />
          </span>
          <span className="welcome-sparkle" aria-hidden="true">
            ✳
          </span>
        </div>
        {checking ? (
          <p className="muted" role="status">
            ログイン状態を確認しています…
          </p>
        ) : (
          <>
            <button
              className="google-button full"
              disabled={busy || !configured || !accessConfigured}
              onClick={() => void login()}
            >
              <span className="google-mark" aria-hidden="true">
                G
              </span>
              Googleでログイン
            </button>
            {configured && accessConfigured ? (
              <>
                <button className="text-button" disabled={busy} onClick={() => void login(true)}>
                  画面を切り替えてログイン
                </button>
                <p className="fineprint">許可されたGoogleアカウントでご利用ください。</p>
              </>
            ) : (
              <p className="fineprint">
                ログインの初期設定がまだ完了していません。サイト管理者にご確認ください。
              </p>
            )}
          </>
        )}
        {busy && (
          <p className="muted" role="status">
            Googleログインを開いています…
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {needRefresh && (
          <button
            className="text-button"
            disabled={busy || checking}
            onClick={() => void updateServiceWorker(true)}
          >
            新しいバージョンに更新
          </button>
        )}
      </div>
    </main>
  );
}
