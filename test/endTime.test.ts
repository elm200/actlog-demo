import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEndTimes, sortActivities } from '../lib/shared/endTime.ts';
import type { Activity } from '../lib/activity.ts';

// deriveEndTimes/sortActivitiesはend_time導出の唯一の実装(サーバー・クライアント共通)。
// SQL側にはこの計算のいかなる形も存在しない前提なので、ここでの正しさが導出全体の正しさになる。

let nextId = 1;
function activity(start: string, summary = ''): Activity {
  return { id: nextId++, category: 'work', start_time: start, end_time: null, summary };
}

test('deriveEndTimes: 次の活動のstart_timeがend_timeになる', () => {
  const a = activity('2026-08-14T09:00:00.000Z');
  const b = activity('2026-08-14T10:00:00.000Z');
  const c = activity('2026-08-14T11:00:00.000Z');
  const derived = deriveEndTimes([a, b, c]);
  const byId = new Map(derived.map((x) => [x.id, x]));
  assert.equal(byId.get(a.id)!.end_time, '2026-08-14T10:00:00.000Z');
  assert.equal(byId.get(b.id)!.end_time, '2026-08-14T11:00:00.000Z');
});

test('deriveEndTimes: 最新の活動はnull(進行中)になる', () => {
  const a = activity('2026-08-14T09:00:00.000Z');
  const b = activity('2026-08-14T10:00:00.000Z');
  const derived = deriveEndTimes([a, b]);
  const byId = new Map(derived.map((x) => [x.id, x]));
  assert.equal(byId.get(b.id)!.end_time, null);
});

test('deriveEndTimes: 入力の並び順に依存しない(降順で渡しても同じ結果)', () => {
  const a = activity('2026-08-14T09:00:00.000Z');
  const b = activity('2026-08-14T10:00:00.000Z');
  const c = activity('2026-08-14T11:00:00.000Z');
  const derived = deriveEndTimes([c, b, a]);
  const byId = new Map(derived.map((x) => [x.id, x]));
  assert.equal(byId.get(a.id)!.end_time, '2026-08-14T10:00:00.000Z');
  assert.equal(byId.get(c.id)!.end_time, null);
});

test('deriveEndTimes: 単一件はnull', () => {
  const a = activity('2026-08-14T09:00:00.000Z');
  const derived = deriveEndTimes([a]);
  assert.equal(derived[0].end_time, null);
});

test('deriveEndTimes: 0件は0件のまま', () => {
  assert.deepEqual(deriveEndTimes([]), []);
});

test('sortActivities: start_time降順に並ぶ', () => {
  const a = activity('2026-08-14T09:00:00.000Z');
  const b = activity('2026-08-14T10:00:00.000Z');
  const sorted = sortActivities([a, b]);
  assert.deepEqual(sorted.map((x) => x.id), [b.id, a.id]);
});

test('sortActivities: start_timeが同値なら進行中(end_time is null)を先に出す', () => {
  const open: Activity = { id: 10, category: 'work', start_time: '2026-08-14T09:00:00.000Z', end_time: null, summary: '' };
  const closed: Activity = { id: 11, category: 'work', start_time: '2026-08-14T09:00:00.000Z', end_time: '2026-08-14T09:30:00.000Z', summary: '' };
  const sorted = sortActivities([closed, open]);
  assert.deepEqual(sorted.map((x) => x.id), [open.id, closed.id]);
});
