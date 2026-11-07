import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { auth, configured, firestore, loadFamily, type Family } from './firebase';
import {
  CATS,
  TYPES,
  dayKey,
  shiftMonth,
  summarize,
  parseImport,
  exportRecords,
  type CatId,
  type RecordType,
  type CatRecord,
} from './model';
import { LocalDatabase } from './storage';
import { RecordRepository, type StoreState } from './repository';
import { FamilyPanel, friendlyError } from './FamilyPanel';
import { Portrait } from './Portrait';
import { Modal } from './Modal';

const initialState: StoreState = {
  scope: '',
  records: [],
  pending: 0,
  error: '',
  connected: false,
};
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Record writes still fail visibly if IndexedDB is unavailable. */
  }
}
export function readInvitation() {
  let saved = '';
  try {
    saved = sessionStorage.getItem('ororo-invite') ?? '';
  } catch {
    /* URL fragment still works. */
  }
  const value = new URLSearchParams(location.hash.slice(1)).get('invite') ?? saved;
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return '';
  try {
    sessionStorage.setItem('ororo-invite', value);
  } catch {
    /* Optional preference. */
  }
  return value;
}
const time = (stamp: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(stamp);

export function Diary({
  initialUser,
  redirectError = '',
  returnedFromLogin = false,
  needRefresh,
  updateServiceWorker,
}: {
  initialUser: User;
  redirectError?: string;
  returnedFromLogin?: boolean;
  needRefresh: boolean;
  updateServiceWorker: (reload?: boolean) => Promise<void>;
}) {
  const [database] = useState(() => new LocalDatabase());
  const [user, setUser] = useState<User>(initialUser);
  const [family, setFamily] = useState<Family | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [invitation, setInvitation] = useState(readInvitation);
  const [cat, setCat] = useState<CatId>(() => {
    const v = preference('ororo-cat', 'MONET');
    return Object.hasOwn(CATS, v) ? (v as CatId) : 'MONET';
  });
  const [today, setToday] = useState(() => dayKey(Date.now()));
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [received, setState] = useState(initialState);
  const [panel, setPanel] = useState<'family' | 'data' | null>(invitation ? 'family' : null);
  const [foodCat, setFoodCat] = useState<CatId | null>(null);
  const [grams, setGrams] = useState('');
  const [assign, setAssign] = useState<CatRecord | null>(null);
  const [deleting, setDeleting] = useState<CatRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authGeneration = useRef(0);
  useEffect(() => {
    const onInvitation = () => {
      const token = readInvitation();
      if (token) {
        setInvitation(token);
        setPanel('family');
      }
    };
    window.addEventListener('hashchange', onInvitation);
    return () => window.removeEventListener('hashchange', onInvitation);
  }, []);

  async function refreshAccount() {
    if (!auth?.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    await accountChanged(auth.currentUser);
  }
  async function accountChanged(current: User) {
    const generation = ++authGeneration.current;
    setUser(current);
    setFamily(null);
    setAccountError('');
    setAuthReady(false);
    try {
      if (configured && current.emailVerified) {
        let result: Family | null;
        try {
          const cached = preference(`ororo-family:${current.uid}`, '');
          result =
            !navigator.onLine && cached
              ? (JSON.parse(cached) as Family | null)
              : await loadFamily(current.uid);
        } catch (e) {
          const cached = preference(`ororo-family:${current.uid}`, '');
          const code = (e as { code?: string })?.code ?? '';
          const temporarilyUnavailable =
            !navigator.onLine || /unavailable|deadline-exceeded|resource-exhausted/.test(code);
          if (temporarilyUnavailable && cached) result = JSON.parse(cached) as Family;
          else throw e;
        }
        if (generation !== authGeneration.current) return;
        setFamily(result);
        savePreference(`ororo-family:${current.uid}`, JSON.stringify(result));
      }
    } catch (e) {
      if (generation === authGeneration.current) setAccountError(friendlyError(e));
    } finally {
      if (generation === authGeneration.current) setAuthReady(true);
    }
  }
  useEffect(() => {
    void accountChanged(initialUser);
  }, [initialUser]);
  useEffect(() => {
    if (returnedFromLogin) setPanel('family');
  }, [returnedFromLogin]);
  const repo = useMemo(
    () =>
      new RecordRepository(
        database,
        authReady && family && user?.emailVerified && firestore
          ? { db: firestore, uid: user.uid, familyId: family.id }
          : undefined,
        user.uid,
      ),
    [authReady, family?.id, user?.uid, user?.emailVerified],
  );
  const state = authReady && received.scope === repo.scope ? received : initialState;
  useEffect(() => {
    setState(initialState);
    const stop = repo.subscribe(setState);
    return () => {
      stop();
      repo.dispose();
    };
  }, [repo]);
  useEffect(() => {
    void repo.watchMonth(month);
  }, [repo, month]);
  useEffect(
    () => () => {
      void database.close();
    },
    [database],
  );
  useEffect(() => {
    const id = setInterval(() => setToday(dayKey(Date.now())), 30000);
    const onVisible = () => {
      setToday(dayKey(Date.now()));
      if (document.visibilityState === 'visible') void repo.flush();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [repo]);
  useEffect(() => {
    savePreference('ororo-cat', cat);
  }, [cat]);
  function announce(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4500);
  }
  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function add(type: RecordType, amount: number | null, target = cat) {
    await repo.add(target, type, amount);
    const now = dayKey(Date.now());
    setCat(target);
    setToday(now);
    setSelected(now);
    setMonth(now.slice(0, 7));
    announce(`${CATS[target].name}の${TYPES[type].label}を記録しました`);
  }
  function familyReady(next: Family) {
    setFamily(next);
    if (user) savePreference(`ororo-family:${user.uid}`, JSON.stringify(next));
    setInvitation('');
    try {
      sessionStorage.removeItem('ororo-invite');
    } catch {
      /* Optional preference. */
    }
    history.replaceState(null, '', location.pathname);
  }
  const visible = state.records.filter((r) => r.deletedAt === null && r.catId === cat);
  const day = visible
    .filter((r) => dayKey(r.occurredAt) === selected)
    .sort((a, b) => b.occurredAt - a.occurredAt);
  const summary = summarize(day);
  const unassigned = state.records.filter(
    (r) => r.catId === 'UNASSIGNED' && r.deletedAt === null,
  ).length;
  const [year, monthNumber] = month.split('-').map(Number);
  const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const counts = new Map<string, number>();
  for (const r of visible) {
    const key = dayKey(r.occurredAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const inputFile = useRef<HTMLInputElement>(null);
  const recordingDisabled = busy || !authReady || !!accountError || cat === 'UNASSIGNED';

  return (
    <>
      <div className="app-shell">
        <header>
          <div>
            <span className="eyebrow">ORORO / FAMILY CAT DIARY</span>
            <h1>ねこの、いつもを。</h1>
            <p className="subtitle">モネとルノワールの、小さな健康日記。</p>
          </div>
          <button className="family-button" onClick={() => setPanel('family')}>
            <span aria-hidden="true">⌂</span> 家族共有
          </button>
        </header>
        <div className="connection" aria-live="polite">
          <span className={`status-dot ${family && state.connected ? 'live' : ''}`} />
          {!authReady
            ? 'アカウントを確認しています…'
            : family
              ? state.pending
                ? `家族に未送信 ${state.pending}件 · 端末に保存済み`
                : state.connected
                  ? `${family.name} · 同期済み`
                  : '家族の記録 · 通信を確認中'
              : 'この端末に保存中'}
          {family && (
            <button className="text-button small" onClick={() => void repo.flush()}>
              再送
            </button>
          )}
        </div>
        {accountError && (
          <div className="error" role="alert">
            {accountError}
            <button onClick={() => void work(refreshAccount)}>再読み込み</button>
          </div>
        )}
        {state.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="エラーを閉じる"
              onClick={() => setError('')}
            >
              ×
            </button>
          </p>
        )}
        <section aria-label="記録する猫" className="cat-selector">
          {(['MONET', 'RENOIR'] as const).map((id) => (
            <button
              key={id}
              aria-pressed={cat === id}
              className={`cat-card ${id.toLowerCase()}`}
              onClick={() => setCat(id)}
            >
              <Portrait cat={id} />
              <span className="cat-info">
                <strong>{CATS[id].name}</strong>
                <span>
                  {CATS[id].coat}の<br />
                  {CATS[id].breed}
                </span>
              </span>
              <span className="selection-mark" aria-hidden="true">
                {cat === id ? '✓' : ''}
              </span>
            </button>
          ))}
        </section>
        {(unassigned > 0 || cat === 'UNASSIGNED') && (
          <button
            className="unassigned"
            aria-pressed={cat === 'UNASSIGNED'}
            onClick={() => setCat('UNASSIGNED')}
          >
            未分類の記録を振り分ける · {unassigned}件
            <span className="fineprint">表示した月・端末内の記録</span>
          </button>
        )}
        <main>
          <section className="record-section" aria-labelledby="record-title">
            <div className="section-title">
              <div>
                <span className="eyebrow">A LITTLE NOTE</span>
                <h2 id="record-title">
                  {cat === 'UNASSIGNED' ? '以前の未分類の記録' : `${CATS[cat].name}の今を記録`}
                </h2>
              </div>
              <span className="date-label">{today.replaceAll('-', '.')}</span>
            </div>
            <p className="muted">
              {cat === 'UNASSIGNED'
                ? '履歴の「猫を選ぶ」から振り分けてください。'
                : '押した時刻で記録。ご飯は残った量をグラムで。'}
            </p>
            <div className="record-grid">
              {(Object.keys(TYPES) as RecordType[]).map((type) => (
                <button
                  key={type}
                  className={`record-button ${type.toLowerCase()}`}
                  disabled={recordingDisabled}
                  aria-label={`${CATS[cat].name}の${TYPES[type].label}を記録`}
                  onClick={() => {
                    if (type === 'FOOD') {
                      setGrams('');
                      setFoodCat(cat);
                    } else void work(() => add(type, null));
                  }}
                >
                  <span className="record-symbol" aria-hidden="true">
                    {TYPES[type].symbol}
                  </span>
                  <strong>{TYPES[type].label}</strong>
                  <span className="record-caption">
                    {type === 'FOOD' ? '残った量を入力' : 'ワンタップで記録'}
                  </span>
                </button>
              ))}
            </div>
            <p className="fineprint">過去の日付を見ていても、新しい記録は今日に保存します。</p>
          </section>
          <section className="calendar-section" aria-label="記録カレンダー">
            <div className="section-title">
              <div>
                <span className="eyebrow">THE EVERYDAY</span>
                <h2>{CATS[cat].name}のカレンダー</h2>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  const now = dayKey(Date.now());
                  setToday(now);
                  setSelected(now);
                  setMonth(now.slice(0, 7));
                }}
              >
                今日へ
              </button>
            </div>
            <div className="calendar-card">
              <div className="month-nav">
                <button
                  className="icon-button"
                  aria-label="前の月"
                  disabled={year <= 1970 && monthNumber === 1}
                  onClick={() => setMonth(shiftMonth(month, -1))}
                >
                  ‹
                </button>
                <h3>
                  {year}年 <strong>{monthNumber}月</strong>
                </h3>
                <button
                  className="icon-button"
                  aria-label="次の月"
                  disabled={year >= 2099 && monthNumber === 12}
                  onClick={() => setMonth(shiftMonth(month, 1))}
                >
                  ›
                </button>
              </div>
              <div className="calendar-grid">
                {['月', '火', '水', '木', '金', '土', '日'].map((name, index) => (
                  <span key={name} className={`weekday ${index === 6 ? 'sunday' : ''}`}>
                    {name}
                  </span>
                ))}
                {Array.from({ length: cells }, (_, index) => {
                  const number = index - offset + 1;
                  if (number < 1 || number > daysInMonth) return <span key={index} />;
                  const key = `${month}-${String(number).padStart(2, '0')}`;
                  const count = counts.get(key) ?? 0;
                  return (
                    <button
                      key={key}
                      className={`day ${key === selected ? 'selected' : ''} ${key === today ? 'today' : ''}`}
                      aria-pressed={key === selected}
                      aria-label={`${key}、記録${count}件`}
                      onClick={() => setSelected(key)}
                    >
                      <span>{number}</span>
                      <small>{count ? `${count}件` : '·'}</small>
                    </button>
                  );
                })}
              </div>
              <p className="calendar-legend">
                <span>数字の下は、{CATS[cat].name}の記録件数</span>
                <span>日本時間</span>
              </p>
            </div>
          </section>
          <section className="history-section" aria-label="日別の記録">
            <div className="section-title">
              <div>
                <span className="eyebrow">DAILY JOURNAL / {CATS[cat].name}</span>
                <h2>
                  {Number(selected.slice(5, 7))}月{Number(selected.slice(8))}日の記録
                </h2>
              </div>
              <span className="count-badge">{day.length}件</span>
            </div>
            <div className="summary">
              <span>
                うんち <b>{summary.counts.POOP}</b>回
              </span>
              <span>
                おしっこ <b>{summary.counts.PEE}</b>回
              </span>
              <span>
                嘔吐 <b>{summary.counts.VOMIT}</b>回
              </span>
              <span>
                おめめ痛々 <b>{summary.counts.EYE_PAIN}</b>回
              </span>
              <span>
                ご飯廃棄 <b>{summary.counts.FOOD}</b>回 / <b>{summary.grams}</b> g
              </span>
            </div>
            {day.length === 0 ? (
              <div className="empty-state">
                <span aria-hidden="true">☾</span>
                <p>この日の記録はまだありません。</p>
                <small>いつものようすを、少しずつ。</small>
              </div>
            ) : (
              <ul className="history-list">
                {day.map((record) => (
                  <li key={record.id}>
                    <span className={`event-icon ${record.type.toLowerCase()}`} aria-hidden="true">
                      {TYPES[record.type].symbol}
                    </span>
                    <div className="event-description">
                      <strong>
                        {TYPES[record.type].label}
                        {record.grams !== null && <span> · {record.grams} g</span>}
                      </strong>
                      <span className="event-time">
                        {time(record.occurredAt)}
                        {family && record.createdBy === user?.uid
                          ? ' · あなた'
                          : family
                            ? ' · 家族'
                            : ''}
                      </span>
                      <button className="text-button small" onClick={() => setAssign(record)}>
                        {record.catId === 'UNASSIGNED' ? '猫を選ぶ' : '猫を変更'}
                      </button>
                    </div>
                    <button
                      className="delete-button"
                      aria-label={`${time(record.occurredAt)}の${TYPES[record.type].label}を削除`}
                      onClick={() => setDeleting(record)}
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
        <footer>
          <div>
            <span className="brand-mark" aria-hidden="true">
              ✳
            </span>
            <span>ふたりの、いつものために。</span>
          </div>
          <button className="text-button" onClick={() => setPanel('data')}>
            保存・取り込み
          </button>
        </footer>
        <p className="privacy-note">
          {family
            ? '家族の記録はクラウドとこの端末に保存します。'
            : '記録はこのブラウザーに保存しています。家族共有を使うまで外部には送信しません。'}
          <br />
          ブラウザーのデータ消去前に、記録を書き出してください。
        </p>
      </div>
      {notice && (
        <div className="toast" role="status">
          ✓ {notice}
        </div>
      )}
      {needRefresh && (
        <div className="update-banner" role="status">
          新しいバージョンがあります。
          <button
            disabled={state.pending > 0 || busy}
            onClick={() => void updateServiceWorker(true)}
          >
            更新する
          </button>
          {state.pending > 0 && <small>未送信の記録を同期してから更新してください。</small>}
        </div>
      )}
      {panel === 'family' && (
        <FamilyPanel
          user={user}
          family={family}
          pending={state.pending}
          invitation={invitation}
          onRefresh={refreshAccount}
          redirectError={redirectError}
          onFamily={familyReady}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'data' && (
        <Modal title="記録を保存・取り込み" onClose={() => setPanel(null)}>
          <p className="muted">
            モネ・ルノワール・未分類を含む全記録が対象です。家族共有中の全件書き出しには通信が必要です。
          </p>
          <button
            className="primary full"
            disabled={busy || !authReady}
            onClick={() =>
              void work(async () => {
                const data = exportRecords(await repo.exportAll());
                const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = `ororo-${dayKey(Date.now())}.json`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 30000);
                announce('記録を書き出しました');
              })
            }
          >
            全記録をJSONに書き出す
          </button>
          <input
            ref={inputFile}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              void work(async () => {
                if (file.size > 20 * 1024 * 1024)
                  throw new Error('ファイルは20MB以内にしてください。');
                const records = parseImport(await file.text());
                if (
                  !confirm(
                    `${records.length}件の記録を${family ? '家族グループ' : 'この端末'}に取り込みます。既存の同じIDの記録は上書きしません。よろしいですか？`,
                  )
                )
                  return;
                const count = await repo.import(records);
                announce(`${count}件を取り込みました`);
              });
            }}
          />
          <button
            className="secondary full"
            disabled={busy || !authReady || !!accountError}
            onClick={() => inputFile.current?.click()}
          >
            Android版・PWAのJSONを取り込む
          </button>
          {
            <button
              className="secondary full"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  const records = await repo.localRecords();
                  if (!records.length) throw new Error('以前の端末記録はありません。');
                  if (
                    !confirm(
                      `以前この端末に保存した${records.length}件を、${family ? '家族と共有' : 'このアカウントに取り込み'}しますか？`,
                    )
                  )
                    return;
                  const count = await repo.import(records);
                  announce(`${count}件を取り込みました`);
                })
              }
            >
              {family ? '端末だけの記録を家族と共有する' : '以前の端末記録を取り込む'}
            </button>
          }
          <p className="fineprint">
            取り込みは同じIDの重複を防ぎます。書き出しには削除済みの記録も含み、再取り込みで復活させません。Android旧版の猫が分からない記録は未分類になります。
          </p>
          <h3>ホーム画面に追加</h3>
          <p>
            iPhoneはSafariの共有メニュー →「ホーム画面に追加」。Androidはブラウザーのメニュー
            →「ホーム画面に追加」または「アプリをインストール」を選びます。
          </p>
          {busy && <p role="status">処理しています…</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {foodCat && (
        <Modal title={`${CATS[foodCat].name}のご飯廃棄`} onClose={() => setFoodCat(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void work(async () => {
                if (!/^\d+(\.\d{1,2})?$/.test(grams) || Number(grams) > 10000)
                  throw new Error('0〜10000 gを小数点以下2桁までで入力してください。');
                await add('FOOD', Number(grams), foodCat);
                setFoodCat(null);
              });
            }}
          >
            <p className="muted">ご飯を交換するときに、残っている量を記録します。</p>
            <label htmlFor="grams">残っているご飯の量</label>
            <div className="weight-input">
              <input
                id="grams"
                autoFocus
                inputMode="decimal"
                required
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                placeholder="12.5"
              />
              <span>g</span>
            </div>
            <p className="fineprint">食べきったら0 g。与えた量からの自動計算は行いません。</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              記録する
            </button>
          </form>
        </Modal>
      )}
      {assign && (
        <Modal title="どちらの猫の記録ですか？" onClose={() => setAssign(null)}>
          <p>
            {TYPES[assign.type].label} · {time(assign.occurredAt)}
          </p>
          <div className="assign-options">
            {(['MONET', 'RENOIR'] as const).map((id) => (
              <button
                key={id}
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await repo.edit(assign.id, { catId: id });
                    setCat(id);
                    setAssign(null);
                    announce(`${CATS[id].name}の記録に変更しました`);
                  })
                }
              >
                <Portrait cat={id} />
                {CATS[id].name}
              </button>
            ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {deleting && (
        <Modal title="この記録を削除しますか？" onClose={() => setDeleting(null)}>
          <p>
            {CATS[deleting.catId].name} / {TYPES[deleting.type].label} · {time(deleting.occurredAt)}
          </p>
          <p className="muted">
            {family ? '家族全員の履歴から削除します。' : 'この端末の履歴から削除します。'}
            削除後は元に戻せません。
          </p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              キャンセル
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await repo.edit(deleting.id, { deletedAt: Date.now() });
                  setDeleting(null);
                  announce('記録を削除しました');
                })
              }
            >
              削除する
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
