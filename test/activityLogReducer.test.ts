import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reducer, type State } from '../hooks/activityLogReducer.ts';
import type { Activity } from '../lib/activity.ts';

// reducerはhooks/useActivityLog.tsxの中身(dispatch呼び出し)を持たない純粋関数なので、
// ロールバック・reconcileの正しさをここで直接検証できる。

let nextId = 1;
function activity(start: string, overrides: Partial<Activity> = {}): Activity {
  return { id: nextId++, category: 'work', start_time: start, end_time: null, summary: '', ...overrides };
}

test('refresh-started: refreshingをtrueにするだけ', () => {
  const next = reducer(initialState, { type: 'refresh-started' });
  assert.equal(next.refreshing, true);
  assert.deepEqual(next.activities, []);
});

test('activities-loaded: activitiesを導出・整列し、loadedをtrueにし、refreshingを終える', () => {
  const older = activity('2026-08-14T09:00:00.000Z');
  const newer = activity('2026-08-14T10:00:00.000Z');
  const state: State = { ...initialState, refreshing: true };
  const next = reducer(state, { type: 'activities-loaded', activities: [older, newer] });
  assert.equal(next.loaded, true);
  assert.equal(next.refreshing, false);
  assert.equal(next.error, null);
  // sortActivitiesでstart_time降順、deriveEndTimesでolderのend_timeがnewerのstart_timeになる
  assert.deepEqual(
    next.activities.map((a) => a.id),
    [newer.id, older.id]
  );
  assert.equal(next.activities.find((a) => a.id === older.id)?.end_time, newer.start_time);
});

test('activities-loaded: keepErrorがtrueなら既存のerrorを消さない', () => {
  const state: State = { ...initialState, error: '前回のエラー' };
  const next = reducer(state, { type: 'activities-loaded', activities: [], keepError: true });
  assert.equal(next.error, '前回のエラー');
});

test('activities-loaded: keepError省略時はerrorを消す', () => {
  const state: State = { ...initialState, error: '前回のエラー' };
  const next = reducer(state, { type: 'activities-loaded', activities: [] });
  assert.equal(next.error, null);
});

test('fetch-failed: errorを立て、loadedをtrueにする(既存のactivitiesは触らない)', () => {
  const existing = [activity('2026-08-14T09:00:00.000Z')];
  const state: State = { ...initialState, activities: existing, refreshing: true };
  const next = reducer(state, { type: 'fetch-failed', error: 'network error' });
  assert.equal(next.error, 'network error');
  assert.equal(next.loaded, true);
  assert.equal(next.refreshing, false);
  assert.deepEqual(next.activities, existing);
});

test('set-error: errorだけを立てる', () => {
  const next = reducer(initialState, { type: 'set-error', error: '重複' });
  assert.equal(next.error, '重複');
});

test('optimistic-insert: 追加後、導出・整列される', () => {
  const existing = activity('2026-08-14T09:00:00.000Z');
  const state: State = { ...initialState, activities: [existing] };
  const inserted = activity('2026-08-14T10:00:00.000Z');
  const next = reducer(state, { type: 'optimistic-insert', activity: inserted });
  assert.deepEqual(
    next.activities.map((a) => a.id),
    [inserted.id, existing.id]
  );
  assert.equal(next.activities.find((a) => a.id === existing.id)?.end_time, inserted.start_time);
  assert.equal(next.error, null);
});

test('optimistic-patch: 対象行だけを書き換える', () => {
  const target = activity('2026-08-14T09:00:00.000Z', { category: 'work' });
  const state: State = { ...initialState, activities: [target] };
  const next = reducer(state, {
    type: 'optimistic-patch',
    id: target.id,
    patch: { category: 'rest', start_time: target.start_time, summary: '休憩' },
  });
  assert.equal(next.activities[0].category, 'rest');
  assert.equal(next.activities[0].summary, '休憩');
});

test('optimistic-remove: 対象行だけを取り除く', () => {
  const a = activity('2026-08-14T09:00:00.000Z');
  const b = activity('2026-08-14T10:00:00.000Z');
  const state: State = { ...initialState, activities: [a, b] };
  const next = reducer(state, { type: 'optimistic-remove', id: a.id });
  assert.deepEqual(
    next.activities.map((x) => x.id),
    [b.id]
  );
});

test('reconcile: 一致するidの行をサーバー確定値で置き換える(他の同時更新を巻き込まない)', () => {
  const pending = activity('2026-08-14T09:00:00.000Z');
  const other = activity('2026-08-14T10:00:00.000Z'); // reconcile呼び出しの間に別の更新が割り込んだ想定
  const state: State = { ...initialState, activities: [pending, other] };
  const confirmed = { ...pending, id: 999 };
  const next = reducer(state, { type: 'reconcile', matchId: pending.id, result: confirmed });
  assert.ok(next.activities.some((a) => a.id === 999));
  assert.ok(next.activities.some((a) => a.id === other.id)); // otherが消えていない
});

test('rollback: スナップショットへ戻し、エラーを立てる(normalizeListを再適用しない)', () => {
  const snapshot = [activity('2026-08-14T09:00:00.000Z')];
  const state: State = { ...initialState, activities: [activity('2026-08-14T10:00:00.000Z')] };
  const next = reducer(state, { type: 'rollback', snapshot, error: '保存に失敗しました' });
  assert.deepEqual(next.activities, snapshot);
  assert.equal(next.error, '保存に失敗しました');
});

test('set-draft / set-editing: 該当フィールドだけを更新する', () => {
  const draft = { beforeId: 1, activity: activity('2026-08-14T09:00:00.000Z') };
  let state = reducer(initialState, { type: 'set-draft', draft });
  assert.deepEqual(state.draft, draft);
  state = reducer(state, { type: 'set-editing', id: 5 });
  assert.equal(state.editingId, 5);
  assert.deepEqual(state.draft, draft); // 他フィールドは変わらない
});
