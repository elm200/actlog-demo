import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregate,
  aggregateDaily,
  DAILY_DAYS,
  DAILY_TAG_LIMIT,
  extractTags,
  localMidnightUtcMs,
} from '../lib/stats.ts';
import type { Activity } from '../lib/activity.ts';
import type { Category } from '../lib/categories.ts';

// 集計は「期間の端をまたぐ活動を切り落とす」ところだけが自明でない。ここを間違えると
// 合計が期間の長さを超え、カテゴリー別の割合が静かにずれる(見た目は普通に出てしまう)。

const WINDOW_START = '2026-08-08T00:00:00.000Z';
const WINDOW_END = '2026-08-15T00:00:00.000Z';

let nextId = 1;
function act(
  category: Category,
  start: string,
  end: string | null,
  summary = ''
): Activity {
  return { id: nextId++, category, start_time: start, end_time: end, summary };
}

function minutesOf(stats: { categories: { category: Category; minutes: number }[] }, category: Category): number {
  return stats.categories.find((c) => c.category === category)?.minutes ?? 0;
}

test('extractTags: #に続く英数字・_・- を拾う', () => {
  assert.deepEqual(extractTags('タイ語の勉強 #thai #vocab_2 #chess-club'), ['thai', 'vocab_2', 'chess-club']);
  assert.deepEqual(extractTags('タグなしの概要'), []);
  // 空白を要求していないので、和文に直接続けて書いても拾う
  assert.deepEqual(extractTags('タイ語#thai'), ['thai']);
  // #だけ、記号だけのものはタグにしない
  assert.deepEqual(extractTags('# #! #あいう'), []);
});

test('extractTags: 同じ概要の中では大文字小文字を区別せず、最初の表記を返す', () => {
  assert.deepEqual(extractTags('#Chess と #chess は同じ'), ['Chess']);
});

test('aggregate: 期間からはみ出した分を切り落とす', () => {
  // 期間の前から始まって中で終わる睡眠(中に入っているのは6時間ぶんだけ)
  const stats = aggregate(
    [act('sleep', '2026-08-07T22:00:00.000Z', '2026-08-08T06:00:00.000Z')],
    WINDOW_START,
    WINDOW_END,
    7
  );
  assert.equal(minutesOf(stats, 'sleep'), 6 * 60);
  assert.equal(stats.total_minutes, 6 * 60);
});

test('aggregate: 進行中の活動は期間の終わり(=今)までを数える', () => {
  const stats = aggregate(
    [act('work', '2026-08-14T22:30:00.000Z', null)],
    WINDOW_START,
    WINDOW_END,
    7
  );
  assert.equal(minutesOf(stats, 'work'), 90);
});

test('aggregate: 期間に重ならない活動は0分として無視する', () => {
  const stats = aggregate(
    [
      act('rest', '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z'),
      act('rest', '2026-08-15T00:00:00.000Z', '2026-08-15T01:00:00.000Z'),
    ],
    WINDOW_START,
    WINDOW_END,
    7
  );
  assert.equal(stats.total_minutes, 0);
});

test('aggregate: 5カテゴリすべてを多い順に返す(0分のカテゴリーも省かない)', () => {
  const stats = aggregate(
    [
      act('learning', '2026-08-10T00:00:00.000Z', '2026-08-10T02:00:00.000Z'),
      act('work', '2026-08-10T02:00:00.000Z', '2026-08-10T05:00:00.000Z'),
    ],
    WINDOW_START,
    WINDOW_END,
    7
  );
  assert.equal(stats.categories.length, 5);
  assert.deepEqual(
    stats.categories.map((c) => c.category),
    ['work', 'learning', 'rest', 'social', 'sleep']
  );
  assert.equal(stats.total_minutes, 5 * 60);
});

test('aggregate: 1つの活動に複数のタグがあれば、それぞれに全額を数える', () => {
  const stats = aggregate(
    [act('learning', '2026-08-10T00:00:00.000Z', '2026-08-10T02:00:00.000Z', '#thai #vocab')],
    WINDOW_START,
    WINDOW_END,
    7
  );
  assert.deepEqual(stats.tags, [
    { tag: 'thai', minutes: 120 },
    { tag: 'vocab', minutes: 120 },
  ]);
  // カテゴリー側は当然二重には数えない
  assert.equal(stats.total_minutes, 120);
});

test('aggregate: タグは大文字小文字をまとめ、表示は最初に見つけた表記(=最新の活動)', () => {
  const stats = aggregate(
    [
      act('learning', '2026-08-12T00:00:00.000Z', '2026-08-12T01:00:00.000Z', '#Thai'),
      act('learning', '2026-08-10T00:00:00.000Z', '2026-08-10T02:00:00.000Z', '#thai'),
    ],
    WINDOW_START,
    WINDOW_END,
    7
  );
  assert.deepEqual(stats.tags, [{ tag: 'Thai', minutes: 180 }]);
});

test('localMidnightUtcMs: UTC+7(タイ, offset=-420)で、日付をまたぐ前後の瞬間から同じローカル日の午前0時を出す', () => {
  // ローカル(UTC+7)で2026-08-16の00:00〜23:59台にあたるUTC瞬間はどれも
  // 「2026-08-16T00:00 UTC+7」= 2026-08-15T17:00:00.000Z を返すはず
  const expected = new Date('2026-08-15T17:00:00.000Z').getTime();
  assert.equal(localMidnightUtcMs(new Date('2026-08-15T17:00:00.000Z').getTime(), -420), expected);
  assert.equal(localMidnightUtcMs(new Date('2026-08-15T23:59:00.000Z').getTime(), -420), expected);
  assert.equal(localMidnightUtcMs(new Date('2026-08-16T16:59:00.000Z').getTime(), -420), expected);
  // 日をまたいだ瞬間は次の日の午前0時になる
  assert.equal(
    localMidnightUtcMs(new Date('2026-08-16T17:00:00.000Z').getTime(), -420),
    new Date('2026-08-16T17:00:00.000Z').getTime()
  );
});

test('localMidnightUtcMs: UTC-5(offset=+300)でも同様に計算できる', () => {
  const expected = new Date('2026-08-16T05:00:00.000Z').getTime();
  assert.equal(localMidnightUtcMs(new Date('2026-08-16T05:00:00.000Z').getTime(), 300), expected);
  assert.equal(localMidnightUtcMs(new Date('2026-08-17T04:59:00.000Z').getTime(), 300), expected);
});

test('localMidnightUtcMs: offset=0(UTC)ではUTCの午前0時と一致する', () => {
  const expected = new Date('2026-08-16T00:00:00.000Z').getTime();
  assert.equal(localMidnightUtcMs(new Date('2026-08-16T13:00:00.000Z').getTime(), 0), expected);
});

test('aggregate: period に today/yesterday を渡してもそのまま結果に反映される', () => {
  const stats = aggregate([], WINDOW_START, WINDOW_END, 'today');
  assert.equal(stats.period, 'today');
});

test('aggregateDaily: DAILY_DAYS件を新しい順(今日が先頭)で返し、今日だけinProgress', () => {
  const todayStartMs = new Date('2026-08-16T00:00:00.000Z').getTime();
  const nowMs = new Date('2026-08-16T07:40:00.000Z').getTime();
  const { days } = aggregateDaily([], todayStartMs, nowMs);

  assert.equal(days.length, DAILY_DAYS);
  assert.equal(days[0].start_time, '2026-08-16T00:00:00.000Z');
  assert.equal(days[0].end_time, '2026-08-16T07:40:00.000Z');
  assert.equal(days[0].inProgress, true);
  assert.equal(days[1].start_time, '2026-08-15T00:00:00.000Z');
  assert.equal(days[1].end_time, '2026-08-16T00:00:00.000Z');
  assert.equal(days[1].inProgress, false);
  // 最古の行はtodayStartMsから(DAILY_DAYS-1)日前の午前0時から始まる
  const oldest = days[days.length - 1];
  assert.equal(
    oldest.start_time,
    new Date(todayStartMs - (DAILY_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString()
  );
});

test('aggregateDaily: 日をまたぐ活動は日ごとの行に正しく分かれる', () => {
  const todayStartMs = new Date('2026-08-16T00:00:00.000Z').getTime();
  const nowMs = new Date('2026-08-16T07:40:00.000Z').getTime();
  // 前日22:00に寝て、当日6:00に起きた(8時間)
  const { days } = aggregateDaily(
    [act('sleep', '2026-08-15T22:00:00.000Z', '2026-08-16T06:00:00.000Z')],
    todayStartMs,
    nowMs
  );
  assert.equal(minutesOf(days[0], 'sleep'), 6 * 60);
  assert.equal(minutesOf(days[1], 'sleep'), 2 * 60);
});

test('aggregateDaily: topTagsはDAILY_DAYS日合計の上位DAILY_TAG_LIMIT件・多い順', () => {
  const todayStartMs = new Date('2026-08-16T00:00:00.000Z').getTime();
  const nowMs = new Date('2026-08-16T07:40:00.000Z').getTime();
  const activities = [
    act('learning', '2026-08-15T00:00:00.000Z', '2026-08-15T03:00:00.000Z', '#a #b #c #d #e #f'),
    act('learning', '2026-08-14T00:00:00.000Z', '2026-08-14T01:00:00.000Z', '#a'),
  ];
  const { topTags } = aggregateDaily(activities, todayStartMs, nowMs);

  assert.equal(topTags.length, DAILY_TAG_LIMIT);
  // #aが2日ぶん(240分)で最多、続いて#b〜#fが同着(180分)。6件目の#fは含まれない
  assert.equal(topTags[0], 'a');
  assert.ok(!topTags.includes('f'));
});

test('aggregateDaily: 上位タグの活動が無い日は、その行で0分になる(0詰め)', () => {
  const todayStartMs = new Date('2026-08-16T00:00:00.000Z').getTime();
  const nowMs = new Date('2026-08-16T07:40:00.000Z').getTime();
  // #thaiは2日前だけ、それ以外の日には無い
  const activities = [act('learning', '2026-08-14T00:00:00.000Z', '2026-08-14T01:00:00.000Z', '#thai')];
  const { days, topTags } = aggregateDaily(activities, todayStartMs, nowMs);

  assert.deepEqual(topTags, ['thai']);
  const dayWithTag = days.find((d) => d.start_time === '2026-08-14T00:00:00.000Z');
  const dayWithoutTag = days.find((d) => d.start_time === '2026-08-15T00:00:00.000Z');
  assert.equal(dayWithTag?.tags[0].minutes, 60);
  assert.equal(dayWithoutTag?.tags[0].minutes, 0);
  assert.equal(dayWithoutTag?.tags[0].tag, 'thai');
});

test('aggregate: タグは多い順、同じ長さなら名前順で安定させる', () => {
  const stats = aggregate(
    [
      act('learning', '2026-08-10T00:00:00.000Z', '2026-08-10T01:00:00.000Z', '#zebra #apple'),
      act('learning', '2026-08-11T00:00:00.000Z', '2026-08-11T03:00:00.000Z', '#chess'),
    ],
    WINDOW_START,
    WINDOW_END,
    7
  );
  assert.deepEqual(
    stats.tags.map((t) => t.tag),
    ['chess', 'apple', 'zebra']
  );
});
