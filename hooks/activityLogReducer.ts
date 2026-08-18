// useActivityLog.tsxが使う純粋なstate/reducer。DOM・ネットワークに一切依存しないので、
// node --testで直接検証できる(test/activityLogReducer.test.ts)。
//
// node --testから直接読まれる経路があるため、lib/stats.tsと同じ理由で
// importは「相対 + `.ts`拡張子」で書く(`@/`エイリアスはViteの設定でしか効かない)。

import type { Activity, ActivityPatch, Draft } from '../lib/activity.ts';
import { deriveEndTimes, sortActivities } from '../lib/shared/endTime.ts';

export type State = {
  activities: Activity[];
  /** 一度でも表示できるデータが揃ったか(キャッシュ命中 or 初回fetch成功) */
  loaded: boolean;
  /** マウント時の裏検証・手動更新のいずれかが進行中か */
  refreshing: boolean;
  error: string | null;
  draft: Draft | null;
  editingId: number | null;
};

export type Action =
  | { type: 'refresh-started' }
  | { type: 'activities-loaded'; activities: Activity[]; keepError?: boolean }
  | { type: 'fetch-failed'; error: string }
  | { type: 'set-error'; error: string }
  | { type: 'optimistic-insert'; activity: Activity }
  | { type: 'optimistic-patch'; id: number; patch: ActivityPatch }
  | { type: 'optimistic-remove'; id: number }
  | { type: 'reconcile'; matchId: number; result: Activity }
  | { type: 'rollback'; snapshot: Activity[]; error: string }
  | { type: 'set-draft'; draft: Draft | null }
  | { type: 'set-editing'; id: number | null };

/** サーバーの`lead(start_time)`相当の導出+並び替え。activitiesを変えるactionは必ずこれを通す。 */
function normalizeList(activities: Activity[]): Activity[] {
  return sortActivities(deriveEndTimes(activities));
}

export const initialState: State = {
  activities: [],
  loaded: false,
  refreshing: false,
  error: null,
  draft: null,
  editingId: null,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'refresh-started':
      return { ...state, refreshing: true };
    case 'activities-loaded':
      return {
        ...state,
        activities: normalizeList(action.activities),
        loaded: true,
        refreshing: false,
        error: action.keepError ? state.error : null,
      };
    case 'fetch-failed':
      return { ...state, loaded: true, refreshing: false, error: action.error };
    case 'set-error':
      return { ...state, error: action.error };
    case 'optimistic-insert':
      return { ...state, activities: normalizeList([...state.activities, action.activity]), error: null };
    case 'optimistic-patch':
      return {
        ...state,
        activities: normalizeList(
          state.activities.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a))
        ),
        error: null,
      };
    case 'optimistic-remove':
      return {
        ...state,
        activities: normalizeList(state.activities.filter((a) => a.id !== action.id)),
        error: null,
      };
    case 'reconcile':
      return {
        ...state,
        activities: normalizeList(
          state.activities.map((a) => (a.id === action.matchId ? action.result : a))
        ),
      };
    case 'rollback':
      return { ...state, activities: action.snapshot, error: action.error };
    case 'set-draft':
      return { ...state, draft: action.draft };
    case 'set-editing':
      return { ...state, editingId: action.id };
  }
}
