import { useEffect, useState } from 'react';
import { signOut, type User } from 'firebase/auth';
import { hasGoogleAccount, loginWithGoogle } from './googleAuth';
import { auth, configured, createFamily, createInvite, joinFamily, type Family } from './firebase';
import { Modal } from './Modal';

export function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request'))
    return 'Googleログインをキャンセルしました。もう一度ログインできます。';
  if (
    code.includes('account-exists-with-different-credential') ||
    code.includes('credential-already-in-use')
  )
    return '既存アカウントとの連携が必要です。以前ログインした端末で「Googleアカウントを連携」を選んでください。';
  if (code.includes('unauthorized-domain'))
    return 'このURLはGoogleログインの許可先に登録されていません。サイト管理者に連絡してください。';
  if (code.includes('operation-not-allowed'))
    return 'Googleログインが有効になっていません。サイト管理者に連絡してください。';
  if (code.includes('provider-already-linked'))
    return 'Googleアカウントは連携済みです。画面を再読み込みしてください。';
  if (code.includes('invalid-credential'))
    return 'Googleログインを完了できませんでした。もう一度お試しください。';
  if (code.includes('too-many-requests') || code.includes('resource-exhausted'))
    return '利用回数の制限に達しました。時間をおいてお試しください。';
  if (code.includes('permission-denied'))
    return '家族の参加権限と、Googleアカウントのメール確認状態を確認してください。';
  if (code.includes('network') || code.includes('unavailable'))
    return 'インターネット接続を確認してください。';
  return error instanceof Error && !code
    ? error.message
    : '処理できませんでした。設定と通信状態を確認して、もう一度お試しください。';
}
export function FamilyPanel({
  user,
  family,
  pending,
  invitation,
  onRefresh,
  onFamily,
  onClose,
  redirectError = '',
}: {
  user: User | null;
  family: Family | null;
  pending: number;
  invitation: string;
  onRefresh: () => Promise<void>;
  onFamily: (family: Family) => void;
  onClose: () => void;
  redirectError?: string;
}) {
  const [name, setName] = useState('モネとルノワールの家族');
  const [token, setToken] = useState(invitation);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  useEffect(() => {
    if (redirectError) setError(redirectError);
  }, [redirectError]);
  useEffect(() => {
    if (invitation) setToken(invitation);
  }, [invitation]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  function invitationToken(value: string) {
    const match = value.match(/(?:#|&)invite=([A-Za-z0-9_-]{43})/);
    return match?.[1] ?? value.trim();
  }
  return (
    <Modal title="家族と一緒に使う" onClose={onClose}>
      {!configured ? (
        <div className="notice">
          <p>いまはこの端末だけに保存しています。</p>
          <p>
            家族共有の初期設定が必要です。サイト管理者の設定が終わると、家族を招待して一緒に使えるようになります。
          </p>
        </div>
      ) : (
        <>
          {!user && (
            <>
              <p className="muted">家族それぞれのGoogleアカウントでログインしてください。</p>
              <button
                className="google-button full"
                disabled={busy}
                onClick={() => void action(() => loginWithGoogle(auth!))}
              >
                <span className="google-mark" aria-hidden="true">
                  G
                </span>
                Googleでログイン
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void action(() => loginWithGoogle(auth!, undefined, true))}
              >
                画面を切り替えてログイン
              </button>
              <p className="fineprint">
                初めての方も同じボタンで使い始められます。パスワードの登録は不要です。
              </p>
            </>
          )}
          {user && !hasGoogleAccount(user) && (
            <div className="notice">
              <p>既存の記録を引き継ぐため、ログイン中のアカウントにGoogleを連携してください。</p>
              <button
                className="google-button full"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await loginWithGoogle(auth!, user);
                    await onRefresh();
                  })
                }
              >
                <span className="google-mark" aria-hidden="true">
                  G
                </span>
                Googleアカウントを連携
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void action(() => loginWithGoogle(auth!, user, true))}
              >
                画面を切り替えて連携
              </button>
            </div>
          )}
          {user && !user.emailVerified && (
            <>
              <p>
                共有にはメールアドレスが確認済みのGoogleアカウントが必要です。Google側で確認した後、再読み込みしてください。
              </p>
              <button
                className="secondary full"
                disabled={busy}
                onClick={() => void action(onRefresh)}
              >
                アカウントを再読み込み
              </button>
            </>
          )}
          {user?.emailVerified && !family && (
            <>
              {invitation && (
                <p className="notice">
                  家族からの招待リンクを受け取っています。下の「家族に参加する」で参加してください。
                </p>
              )}
              <h3>招待を受け取った方</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const f = await joinFamily(user.uid, invitationToken(token));
                    onFamily(f);
                    setMessage('家族に参加しました。');
                  });
                }}
              >
                <label>
                  招待リンク
                  <input
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="家族から受け取ったリンクを貼り付け"
                  />
                </label>
                <button className="primary full" disabled={busy}>
                  家族に参加する
                </button>
              </form>
              {!invitation && (
                <>
                  <h3>最初に使い始める方</h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        const f = await createFamily(user.uid, name.trim());
                        onFamily(f);
                        setMessage('家族グループを作成しました。');
                      });
                    }}
                  >
                    <label>
                      家族グループの名前
                      <input
                        required
                        maxLength={50}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <button className="secondary full" disabled={busy || !name.trim()}>
                      新しい家族グループを作る
                    </button>
                  </form>
                </>
              )}
            </>
          )}
          {family && (
            <>
              <div className="family-box">
                <span className="eyebrow">OUR FAMILY</span>
                <h3>{family.name}</h3>
                <p className="muted">{user?.email}</p>
              </div>
              {user?.uid === family.ownerId ? (
                <>
                  <p>招待リンクは1人につき1つ。6日間有効です。家族にだけ渡してください。</p>
                  <button
                    className="primary full"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        setLink(await createInvite(family.id, user.uid));
                      })
                    }
                  >
                    招待リンクを作る
                  </button>
                  {link && (
                    <>
                      <label>
                        家族への招待リンク
                        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                      </label>
                      <button
                        className="secondary full"
                        onClick={() =>
                          void action(async () => {
                            await navigator.clipboard.writeText(link);
                            setMessage('リンクをコピーしました。');
                          })
                        }
                      >
                        リンクをコピー
                      </button>
                    </>
                  )}
                </>
              ) : (
                <p className="muted">ほかの家族の招待は、グループを作成した方から行えます。</p>
              )}
            </>
          )}
          {user && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (
                    pending > 0 &&
                    !confirm(
                      `未送信の記録が${pending}件あります。記録はこの端末に残り、同じアカウントでログインすると送信を再開します。ログアウトしますか？`,
                    )
                  )
                    return;
                  await signOut(auth!);
                  onClose();
                })
              }
            >
              ログアウト
            </button>
          )}
        </>
      )}
      {busy && <p role="status">処理しています…</p>}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="fineprint">
        共有中の記録は家族だけが見られます。無料プランの上限に達すると同期が制限されることがあります。
      </p>
    </Modal>
  );
}
