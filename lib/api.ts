import type { Activity, ActivityPatch } from './activity.ts';
import type { Category } from './categories.ts';
import { isCategory } from './categories.ts';
import { deriveEndTimes, sortActivities } from './shared/endTime.ts';
import { validateStartTime, type Neighbor } from './shared/boundary.ts';
import { floorToMinute, nowFlooredToMinute } from './shared/time.ts';
import { normalizeSummary } from './shared/summary.ts';

/** 挿入で新しく作る活動の値 */
export type InsertValues = {
  category: Category;
  start_time: string;
  summary: string;
};

/**
 * `hooks/useActivityLog.tsx`が要求するデータ層の契約。
 *
 * バックエンドDB(Postgres・Redis等)を自分で用意したい場合は、この5関数を実装した
 * 別モジュールをこのファイルの代わりに置けばよい。呼び出し側(useActivityLog.tsx)は
 * この契約だけを知っており、実装がlocalStorageかHTTP経由のAPIかを関知しない。
 */
export interface ActivityStore {
  fetchActivities(): Promise<Activity[]>;
  startActivity(category: Category): Promise<Activity>;
  updateActivity(id: number, patch: ActivityPatch): Promise<Activity>;
  deleteActivity(id: number): Promise<void>;
  insertActivity(beforeId: number, values: InsertValues): Promise<Activity>;
}

const STORE_KEY = 'actlog:store:v1';
const STORE_VERSION = 1;

type StoreEnvelope = { version: number; activities: Activity[] };

/**
 * ストレージから生の活動一覧を読む。この関数と`writeStore`の2つだけがストレージに
 * 直接触る。将来レイテンシーを隠すインメモリキャッシュ等を足したくなったら、
 * この2関数の中身だけを差し替えればよい(公開関数のシグネチャ・呼び出し側は無改修で済む)。
 *
 * `storage`はデフォルト引数として実ブラウザの`localStorage`を指す。デフォルト引数は
 * **呼び出し時に省略された場合だけ遅延評価される**ため、node --test環境(`localStorage`
 * という識別子自体が存在しない)でこのモジュールをimportしても落ちない
 * (旧`lib/cache.ts`と同じ理由・同じパターン)。テストでは常にfakeのStorageを明示的に渡す。
 */
function readStore(storage: Storage = localStorage): Activity[] {
  try {
    const raw = storage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoreEnvelope>;
    if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.activities)) return [];
    return parsed.activities;
  } catch {
    // 壊れたJSON・private browsingでの読み取り拒否等は、すべて「データ無し」に縮退させる
    return [];
  }
}

function writeStore(activities: Activity[], storage: Storage = localStorage): void {
  try {
    const envelope: StoreEnvelope = { version: STORE_VERSION, activities };
    storage.setItem(STORE_KEY, JSON.stringify(envelope));
  } catch {
    // 容量超過・private browsing等は無視する(この呼び出し元は書き込み失敗を検知できないが、
    // 個人利用のデモという性質上、ここで例外を投げて操作自体を失敗にするよりは許容する)
  }
}

/** 既存行のidと衝突しない新しいidを払い出す。カウンタを別途永続化しないので、
    手でlocalStorageを書き換えられても衝突しない */
function nextId(activities: Activity[]): number {
  return activities.reduce((max, a) => Math.max(max, a.id), 0) + 1;
}

/** idからNeighbor形式を作る(前後の活動の境界検証に使う) */
function toNeighbor(activity: Activity | undefined): Neighbor | null {
  return activity ? { id: activity.id, start_time: activity.start_time } : null;
}

/** `startTime`より前で最も新しい活動 */
function findPrev(activities: Activity[], startTime: string): Activity | undefined {
  return activities
    .filter((a) => a.start_time < startTime)
    .sort((a, b) => (a.start_time < b.start_time ? 1 : -1))[0];
}

/** `startTime`より後で最も古い活動 */
function findNext(activities: Activity[], startTime: string): Activity | undefined {
  return activities
    .filter((a) => a.start_time > startTime)
    .sort((a, b) => (a.start_time < b.start_time ? -1 : 1))[0];
}

export async function fetchActivities(storage: Storage = localStorage): Promise<Activity[]> {
  return sortActivities(deriveEndTimes(readStore(storage)));
}

export async function startActivity(category: Category, storage: Storage = localStorage): Promise<Activity> {
  if (!isCategory(category)) throw new Error('不正なカテゴリーです');

  const activities = readStore(storage);
  const startTime = nowFlooredToMinute();

  // 時刻は分単位に切り捨てる方針のため、同じ分のうちに別のカテゴリーを押すと
  // 既存行と時刻が衝突する(api/activities/index.tsのSQL版と同じ制約をJSで再現)。
  if (activities.some((a) => a.start_time === startTime)) {
    throw new Error(
      '時刻は分単位で記録するため、同じ分のうちに活動を切り替えることはできません。1分たってからもう一度押してください。'
    );
  }

  const activity: Activity = { id: nextId(activities), category, start_time: startTime, end_time: null, summary: '' };
  writeStore([...activities, activity], storage);
  return activity;
}

export async function updateActivity(
  id: number,
  patch: ActivityPatch,
  storage: Storage = localStorage
): Promise<Activity> {
  const activities = readStore(storage);
  const target = activities.find((a) => a.id === id);
  if (!target) throw new Error('見つかりません');

  const startTime = floorToMinute(patch.start_time);
  if (!isCategory(patch.category) || !startTime) {
    throw new Error('category, start_timeは必須です(時刻の形式も確認してください)');
  }
  const summary = normalizeSummary(patch.summary);

  const prev = toNeighbor(findPrev(activities, target.start_time));
  const next = toNeighbor(findNext(activities, target.start_time));
  const validation = validateStartTime(startTime, prev, next, nowFlooredToMinute());
  if (!validation.ok) throw new Error(validation.error);

  const updated: Activity = { ...target, category: patch.category, start_time: startTime, summary };
  writeStore(
    activities.map((a) => (a.id === id ? updated : a)),
    storage
  );
  return updated;
}

export async function deleteActivity(id: number, storage: Storage = localStorage): Promise<void> {
  const activities = readStore(storage);
  writeStore(
    activities.filter((a) => a.id !== id),
    storage
  );
}

export async function insertActivity(
  beforeId: number,
  values: InsertValues,
  storage: Storage = localStorage
): Promise<Activity> {
  const activities = readStore(storage);
  const before = activities.find((a) => a.id === beforeId);
  if (!before) throw new Error('見つかりません');
  const startTime = floorToMinute(values.start_time);
  if (!isCategory(values.category) || !startTime) {
    throw new Error('category, start_timeは必須です(時刻の形式も確認してください)');
  }

  const prevActivity = findPrev(activities, before.start_time);
  if (!prevActivity) throw new Error('最も古い活動より前には挿入できません');

  const summary = normalizeSummary(values.summary);
  const validation = validateStartTime(
    startTime,
    toNeighbor(prevActivity),
    toNeighbor(before),
    nowFlooredToMinute()
  );
  if (!validation.ok) throw new Error(validation.error);

  const activity: Activity = {
    id: nextId(activities),
    category: values.category,
    start_time: startTime,
    end_time: null,
    summary,
  };
  writeStore([...activities, activity], storage);
  return activity;
}

/**
 * `useReducer`の遅延初期化用の同期スナップショット読み出し。`ActivityStore`の契約には
 * 含めない(Reactの遅延初期化がPromiseを扱えないための、この実装固有の補助関数)。
 */
export function readActivitiesSnapshot(storage: Storage = localStorage): Activity[] {
  return sortActivities(deriveEndTimes(readStore(storage)));
}

// 上の5関数が`ActivityStore`の契約を満たすことをコンパイル時に保証するだけの束
// (実行時には使わない。hooks/useActivityLog.tsxは個別の名前でimportする)。
const _activityStore: ActivityStore = { fetchActivities, startActivity, updateActivity, deleteActivity, insertActivity };
void _activityStore;
