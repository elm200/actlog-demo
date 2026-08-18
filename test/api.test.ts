import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchActivities,
  startActivity,
  updateActivity,
  deleteActivity,
  insertActivity,
  readActivitiesSnapshot,
} from '../lib/api.ts';
import { floorToMinute } from '../lib/shared/time.ts';

/** Storageの最小限のfake実装。node --testにはlocalStorage(jsdom)が無いので、
    lib/api.tsの各関数に明示的に渡す(旧lib/cache.test.tsと同じパターン)。 */
class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** 「1分前」のようなISO文字列を作る(未来時刻エラーを避けつつ、順序のある活動を作るため) */
function minutesAgo(n: number): string {
  return floorToMinute(new Date(Date.now() - n * 60000).toISOString())!;
}

test('fetchActivitiesは空ストレージに対して空配列を返す', async () => {
  const storage = new FakeStorage();
  assert.deepEqual(await fetchActivities(storage), []);
});

test('startActivity→fetchActivitiesの往復で1件返る', async () => {
  const storage = new FakeStorage();
  const created = await startActivity('work', storage);
  assert.equal(created.category, 'work');
  assert.equal(created.summary, '');
  const list = await fetchActivities(storage);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);
});

test('同じ分のうちに2回startActivityすると2回目は拒否される', async () => {
  const storage = new FakeStorage();
  await startActivity('work', storage);
  await assert.rejects(() => startActivity('rest', storage), /同じ分のうちに/);
});

test('壊れたJSONは空配列に縮退する(書き込み前のfetchActivitiesは例外を投げない)', async () => {
  const storage = new FakeStorage();
  storage.setItem('actlog:store:v1', '{not json');
  assert.deepEqual(await fetchActivities(storage), []);
});

test('idは既存の行(id=1,5)のどれとも衝突しない値(max+1=6)が払い出される', async () => {
  const storage = new FakeStorage();
  const existing = [
    { id: 1, category: 'work' as const, start_time: minutesAgo(10), end_time: null, summary: '' },
    { id: 5, category: 'rest' as const, start_time: minutesAgo(5), end_time: null, summary: '' },
  ];
  storage.setItem('actlog:store:v1', JSON.stringify({ version: 1, activities: existing }));
  const created = await startActivity('learning', storage);
  assert.equal(created.id, 6);
});

test('id採番はカウンタを永続化しない(最大idの行を消せば同じidが再度払い出されうる)', async () => {
  const storage = new FakeStorage();
  const first = await startActivity('work', storage); // id=1
  await deleteActivity(first.id, storage);
  const second = await startActivity('rest', storage);
  // 永続カウンタを持たず「都度の最大値+1」で採番する設計なので、全件削除後は1から振り直される。
  // (この時点でid=1を参照している行は無いので、再利用しても衝突しない)
  assert.equal(second.id, 1);
});

test('updateActivityは未来の時刻を拒否する(validateStartTimeへの委譲を確認)', async () => {
  const storage = new FakeStorage();
  const base = await startActivity('work', storage);
  const fiveMinutesLater = new Date(Date.now() + 5 * 60000).toISOString();
  await assert.rejects(
    () => updateActivity(base.id, { category: 'work', start_time: fiveMinutesLater, summary: '' }, storage),
    /現在時刻より後/
  );
});

test('insertActivityは最も古い活動より前には挿入できない', async () => {
  const storage = new FakeStorage();
  const only = await startActivity('work', storage);
  await assert.rejects(
    () =>
      insertActivity(only.id, { category: 'rest', start_time: minutesAgo(10), summary: '' }, storage),
    /最も古い活動より前/
  );
});

test('insertActivityは前後の間の時刻なら挿入できる', async () => {
  const storage = new FakeStorage();
  const older = await startActivity('work', storage);
  await deleteActivity(older.id, storage);

  // older(6分前) → newer(2分前) を手動で組み立て、その間(4分前)に挿入する
  const olderActivity = { id: 1, category: 'work' as const, start_time: minutesAgo(6), end_time: null, summary: '' };
  const newerActivity = { id: 2, category: 'rest' as const, start_time: minutesAgo(2), end_time: null, summary: '' };
  storage.setItem('actlog:store:v1', JSON.stringify({ version: 1, activities: [olderActivity, newerActivity] }));

  const inserted = await insertActivity(
    newerActivity.id,
    { category: 'learning', start_time: minutesAgo(4), summary: '' },
    storage
  );
  assert.equal(inserted.category, 'learning');
  const list = await fetchActivities(storage);
  assert.equal(list.length, 3);
});

test('readActivitiesSnapshotはderiveEndTimes/sortActivities済みの一覧を同期で返す', () => {
  const storage = new FakeStorage();
  const activity = { id: 1, category: 'work' as const, start_time: minutesAgo(5), end_time: null, summary: '' };
  storage.setItem('actlog:store:v1', JSON.stringify({ version: 1, activities: [activity] }));
  const snapshot = readActivitiesSnapshot(storage);
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].id, 1);
});
