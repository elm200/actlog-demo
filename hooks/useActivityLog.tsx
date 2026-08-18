import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { DRAFT_ID, type Activity, type ActivityPatch, type Draft } from '@/lib/activity';
import { categoryLabel, type Category } from '@/lib/categories';
import { formatDuration } from '@/lib/time';
import {
  fetchActivities,
  startActivity,
  updateActivity,
  deleteActivity,
  insertActivity,
  readActivitiesSnapshot,
  type InsertValues,
} from '@/lib/api';
import { nowFlooredToMinute } from '@/lib/shared/time';
import { initialState, reducer, type Action } from './activityLogReducer';

export type ActivityLog = {
  activities: Activity[];
  /** 下書きを挿入位置に合成した、描画用の一覧 */
  visibleActivities: Activity[];
  /** 一度でも表示できるデータが揃ったか。空の状態を「記録なし」と断定してよいかの判定に使う */
  loaded: boolean;
  /** マウント時の裏検証・手動更新のいずれかが進行中か(更新アイコンの回転に使う) */
  refreshing: boolean;
  current: Activity | null;
  draft: Draft | null;
  editingId: number | null;
  error: string | null;
  /** 明示的に最新の状態を取り直す(手動更新ボタン用) */
  refresh: () => Promise<void>;
  select: (category: Category) => Promise<void>;
  beginEdit: (id: number) => void;
  cancelEdit: () => void;
  save: (id: number, patch: ActivityPatch) => Promise<void>;
  remove: (id: number) => Promise<void>;
  beginInsert: (beforeId: number) => void;
};

const ActivityLogContext = createContext<ActivityLog | null>(null);

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * サーバーにまだ存在しない行(下書き、および楽観的に追加してレスポンス待ちの行)か。
 * 実在しないidでPATCH/DELETEを投げてしまわないよう、操作の入り口で弾くために使う。
 */
function isPending(id: number): boolean {
  return id < 0;
}

/**
 * 表示用の一覧。下書きがあれば、挿入先(beforeIdの1つ古い側)に混ぜて返す。
 * 下書きを`activities`に入れてしまうと、一覧を取り直すたびに消えてしまうので、
 * stateでは別に持っておき、描画のときだけ合成する。
 */
function mergeVisible(activities: Activity[], draft: Draft | null): Activity[] {
  if (!draft) return activities;
  const index = activities.findIndex((a) => a.id === draft.beforeId);
  if (index === -1) return activities;
  const merged = [...activities];
  merged.splice(index + 1, 0, draft.activity);
  return merged;
}

/** useReducerの遅延初期化。localStorageの内容(=データそのもの)を初回描画から即使う。 */
function initState() {
  const activities = readActivitiesSnapshot();
  if (activities.length === 0) return initialState;
  return { ...initialState, activities, loaded: true };
}

/**
 * アプリ全体の活動記録の状態と、それを変更する操作をまとめたProvider。
 *
 * `src/App.tsx`のルート直下(react-routerの`<Outlet />`より上)に1つだけ置く。画面遷移で
 * アンマウントされないので、`/`⇄`/dashboard`を行き来しても`/api/activities`を叩き直さない。
 */
export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const { activities, loaded, refreshing, error, draft, editingId } = state;

  /**
   * `lib/api.ts`(データ層)から一覧を取り直して表示を確定させる(SWR: マウント時の
   * 裏検証・手動更新・楽観的更新の競合後の取り直し、いずれもこれを通る)。localStorage版
   * では即時に解決するが、この関数自体はデータ層の実体を知らないので無改修のままでよい。
   *
   * @param keepError 直前に出したエラーを消さない(競合後の取り直し用)
   * @param signal 呼び出し元がキャンセルしたかどうかを示す(StrictMode下でeffectが
   *   2回走っても、先発の呼び出しの結果でstateを壊さないためのガード)
   */
  async function refresh({
    keepError = false,
    signal,
  }: { keepError?: boolean; signal?: { cancelled: boolean } } = {}): Promise<void> {
    dispatch({ type: 'refresh-started' });
    try {
      // fetchActivitiesは既にderiveEndTimes/sortActivities済みのActivity[]を返す
      const next = await fetchActivities();
      if (signal?.cancelled) return;
      dispatch({ type: 'activities-loaded', activities: next, keepError });
    } catch (err) {
      if (signal?.cancelled) return;
      dispatch({ type: 'fetch-failed', error: messageOf(err) });
    }
  }

  /** 実行中の楽観的更新の数。重なっているときだけ、失敗後にサーバーから取り直す */
  const inFlight = useRef(0);

  /**
   * 楽観的更新の共通処理。
   *
   * 先にローカルのstateを書き換えて描画してしまい、そのあとリクエストを投げる。成功したら
   * サーバーが返した確定値で置き換え、失敗したら書き換える前の状態に戻してエラーを出す。
   * 一覧の再取得(refresh)は挟まない。1往復ぶんの待ち時間をUIから消すのが目的なので、
   * ここで待ってしまっては意味がない。
   *
   * `optimistic`アクションを先にdispatchした時点のstateがそのままロールバック用の
   * スナップショットになる(このProviderは`useCallback`で包まれていないので、常にその時点の
   * `state`を素直に閉じている。クリック時点のstateを退避したいので、これはむしろ正しい)。
   * `reconcile`はdispatch経由でreducerに常に最新のstateを見せるので、`await`をまたいでも
   * 他の同時更新を上書きしない。
   */
  async function mutate<T>({
    optimistic,
    request,
    matchId,
    onError,
  }: {
    optimistic: Action;
    request: () => Promise<T>;
    /** 成功後、この`id`の行をサーバーの確定値(`result`)で置き換える。省略時は何もしない(削除用) */
    matchId?: number;
    onError?: () => void;
  }): Promise<void> {
    const snapshot = activities;
    dispatch(optimistic);

    inFlight.current += 1;
    try {
      const result = await request();
      if (matchId !== undefined) {
        dispatch({ type: 'reconcile', matchId, result: result as Activity });
      }
    } catch (err) {
      dispatch({ type: 'rollback', snapshot, error: messageOf(err) });
      onError?.();
      // 他の更新も同時に走っていた場合、退避しておいた状態はその更新を含まない古いものかも
      // しれない。そのときだけサーバーから取り直して、真の状態に合わせ直す。
      if (inFlight.current > 1) void refresh({ keepError: true });
    } finally {
      inFlight.current -= 1;
    }
  }

  /** 楽観的に追加した行に与える仮のid。DRAFT_ID(-1)と重ならないよう、そこから下に振っていく */
  const nextPendingId = useRef(DRAFT_ID - 1);
  const takePendingId = () => nextPendingId.current--;

  /**
   * カテゴリーボタンのクリックは(awaitされない)イベントハンドラから呼ばれるので、
   * ここでcatchしないと失敗が画面に出ないまま握りつぶされる。同じ分のうちの切り替えは
   * サーバーが409で拒否する通常の経路なので、メッセージを必ず表示する。
   */
  async function select(category: Category): Promise<void> {
    const first = activities[0];
    const current = first && first.end_time === null ? first : null;
    const startTime = nowFlooredToMinute();

    // サーバーは同じ分のうちの切り替えを409で拒否する(api/activities/index.ts)。
    // 同じ判定を先にしておかないと、カードが一瞬現れてすぐ消える見え方になってしまう。
    if (current && current.start_time >= startTime) {
      dispatch({
        type: 'set-error',
        error: '時刻は分単位で記録するため、同じ分のうちに活動を切り替えることはできません。1分たってからもう一度押してください。',
      });
      return;
    }

    const pendingId = takePendingId();
    await mutate({
      // 概要は開始時には付けない(サーバーも空文字で作る)。あとから編集で書き足す。
      // 直前に開いていた活動のend_timeは、reducerのnormalizeListが自動的に拾い直すので、
      // ここで個別に合わせ直す必要はない。
      optimistic: {
        type: 'optimistic-insert',
        activity: { id: pendingId, category, start_time: startTime, end_time: null, summary: '' },
      },
      request: () => startActivity(category),
      matchId: pendingId,
    });
  }

  function beginEdit(id: number): void {
    if (isPending(id)) return;
    dispatch({ type: 'set-editing', id });
  }

  function cancelEdit(): void {
    // 下書きを開いていた場合は、キャンセルでそのまま破棄する(DBには何も送っていない)
    dispatch({ type: 'set-draft', draft: null });
    dispatch({ type: 'set-editing', id: null });
  }

  async function save(id: number, patch: ActivityPatch): Promise<void> {
    const currentDraft = draft;
    const previousEditingId = editingId;
    dispatch({ type: 'set-editing', id: null });

    if (currentDraft && id === DRAFT_ID) {
      // 下書きの保存。ここで初めてDBに登録される。
      const values: InsertValues = { category: patch.category, start_time: patch.start_time, summary: patch.summary };
      const pendingId = takePendingId();
      dispatch({ type: 'set-draft', draft: null });
      await mutate({
        optimistic: { type: 'optimistic-insert', activity: { id: pendingId, ...values, end_time: null } },
        request: () => insertActivity(currentDraft.beforeId, values),
        matchId: pendingId,
        onError: () => {
          dispatch({ type: 'set-draft', draft: currentDraft });
          dispatch({ type: 'set-editing', id: previousEditingId });
        },
      });
      return;
    }

    await mutate({
      optimistic: { type: 'optimistic-patch', id, patch },
      request: () => updateActivity(id, patch),
      matchId: id,
      onError: () => dispatch({ type: 'set-editing', id: previousEditingId }),
    });
  }

  async function remove(id: number): Promise<void> {
    // 活動は独立したチェックインイベントなので、削除は他の行を一切気にしない。
    // 空いた時間は、直前の活動の記録にnormalizeListを通じて自動的に引き継がれる。
    const previousEditingId = editingId;
    dispatch({ type: 'set-editing', id: null });

    await mutate({
      optimistic: { type: 'optimistic-remove', id },
      request: () => deleteActivity(id),
      onError: () => dispatch({ type: 'set-editing', id: previousEditingId }),
    });
  }

  function beginInsert(beforeId: number): void {
    // 「+」を押しただけではDBに何も作らない。画面上に下書きのカードを出して
    // 編集フォームを開くだけにし、保存するまでサーバーには送らない。
    if (isPending(beforeId)) return;
    const before = activities.find((a) => a.id === beforeId);
    if (!before) return;
    dispatch({
      type: 'set-draft',
      draft: {
        beforeId,
        activity: {
          id: DRAFT_ID,
          category: before.category,
          // 挿入位置(=beforeの開始時刻)を開始時刻の初期値にしておく。編集フォームで
          // これを動かせば、その時刻が既存の区間を2つに割る新しい開始点になる。
          // end_timeは編集フォームでは扱わない導出値なので、ここでの値は使われない。
          start_time: before.start_time,
          end_time: before.start_time,
          // カテゴリーは直前の活動から引き継ぐが、概要は引き継がない。別の活動を足すために
          // 押しているので、内容まで同じであることはまずない。
          summary: '',
        },
      },
    });
    dispatch({ type: 'set-editing', id: DRAFT_ID });
  }

  // マウント時に一度だけ裏で最新化する(SWR)。StrictMode下ではeffectが2回走るので、
  // 先発の呼び出しの結果を後発が握りつぶさないようcancelledガードを付ける
  // (src/DashboardPage.tsxの旧実装と同じ考え方)。
  useEffect(() => {
    const signal = { cancelled: false };
    void refresh({ signal });
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時に1回だけ
  }, []);

  // 進行中カードの経過時間表示を定期的に更新する(一覧の再取得はしない)。
  // 編集中は更新しない条件はvanilla JS版から引き継いだもの。Reactでは再描画しても
  // 入力中の値は保たれるが、見え方を変えないためそのまま残している。
  //
  // このProviderはルート直下に常駐しアンマウントされないので、intervalは1つだけ立って
  // アプリが開いている間ずっと動き続ける(以前は記録画面がアンマウントされるたびに
  // 止まっていた)。
  const [tick, setTick] = useState(0);
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  useEffect(() => {
    const timer = setInterval(() => {
      if (editingIdRef.current === null) setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const first = activities[0];
  const current = first && first.end_time === null ? first : null;

  // タブのタイトルに進行中の活動を出す。CurrentStatusのカード表示(進行中: ...)と
  // 同じformatDuration/categoryLabelを使い、既存の30秒tickに相乗りする(専用の
  // setIntervalは作らない)。Providerが常駐するようになったので、/dashboardに居る間も
  // 更新され続ける(以前は記録画面を離れた瞬間の表示で固まっていた)。
  useEffect(() => {
    document.title = current
      ? `actlog ${categoryLabel(current.category)}(${formatDuration(current.start_time, null)})`
      : 'actlog';
  }, [current, tick]);

  const value: ActivityLog = {
    activities,
    visibleActivities: mergeVisible(activities, draft),
    loaded,
    refreshing,
    current,
    draft,
    editingId,
    error,
    refresh: () => refresh(),
    select,
    beginEdit,
    cancelEdit,
    save,
    remove,
    beginInsert,
  };

  return <ActivityLogContext.Provider value={value}>{children}</ActivityLogContext.Provider>;
}

export function useActivityLog(): ActivityLog {
  const ctx = useContext(ActivityLogContext);
  if (!ctx) throw new Error('useActivityLogはActivityLogProviderの内側でのみ呼べます');
  return ctx;
}
