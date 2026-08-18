// 集計ダッシュボードのドメインロジック。DBにもDOMにも依存しない純粋関数だけを置く。
// 呼ぶのは src/DashboardPage.tsx だけ(集計はブラウザ側で完結させる設計。直近31日分の
// 生データをfetchし、ここでend_time導出後のActivity[]から集計する)。サーバー側では
// 使わないので lib/shared/ には置いていない。

import type { Activity } from './activity.ts';
// このモジュールは `node --test` から直接読まれる(test/stats.test.ts)。その経路だけは
// Nodeの解決規則に従うので、**実行時に残るimportは拡張子つきで書く**必要がある
// (型だけのimportは消えるので拡張子は要らない)。lib/の中で拡張子つきになっているのは
// 今のところここだけ。
import { CATEGORIES, type Category } from './categories.ts';

/** 集計できる期間。'today'/'yesterday' はローカル時刻のカレンダー日、数値は「今から遡ってN日」の
    移動窓 */
export const STATS_PERIODS = ['today', 'yesterday', 7, 30] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ある瞬間(`nowMs`)を含むローカル日の午前0時を、UTCのミリ秒で返す。
 *
 * 集計はブラウザ側で完結するので、`tzOffsetMinutes`には呼び出し元(DashboardPage)で
 * `Date#getTimezoneOffset()`を直接渡せばよい(UTC−ローカル、分)。DSTは考慮しない
 * (呼び出し時点のoffsetをそのまま使う。日をまたぐ瞬間にDST切り替えが起きる地域では
 * ±1時間ずれ得るが、このアプリはタイ在住の個人利用でDSTが無いため実害がない)。
 */
export function localMidnightUtcMs(nowMs: number, tzOffsetMinutes: number): number {
  const localMs = nowMs - tzOffsetMinutes * 60000;
  const localDayFloorMs = Math.floor(localMs / DAY_MS) * DAY_MS;
  return localDayFloorMs + tzOffsetMinutes * 60000;
}

export type CategoryStat = { category: Category; minutes: number };
export type TagStat = { tag: string; minutes: number };

export type Stats = {
  period: StatsPeriod;
  /** 集計した期間(ISO文字列)。`end_time`は「今」を分単位に切り捨てた時刻 */
  start_time: string;
  end_time: string;
  /** 期間内に記録があった時間の合計(分)。カテゴリー別の合計と一致する */
  total_minutes: number;
  /** 5カテゴリすべてを含む(0分のカテゴリーも省かない)。多い順 */
  categories: CategoryStat[];
  /** 多い順。件数の上限は設けず、表示する数は画面側で決める */
  tags: TagStat[];
};

/**
 * 概要から拾うタグの形。`#` に続く1文字以上の英数字・`_`・`-`。
 *
 * 前に空白を要求していない(「タイ語#thai」も拾う)。和文には単語間の空白が無いので、
 * 空白を必須にすると書いたつもりのタグが拾われない方が困る。代わりに「C#」のような
 * 表記の直後に英数字が続くと拾ってしまうが、この概要欄の使い方では起きにくい。
 */
const TAG_PATTERN = /#([A-Za-z0-9_-]+)/g;

/**
 * 概要に含まれるタグを、書かれた順に取り出す(`#`は含めない)。
 *
 * 大文字小文字は区別しない。同じ概要に「#chess #Chess」と書いても二重に数えず、
 * 最初に現れた表記を返す(表示にはその表記を使う)。
 */
export function extractTags(summary: string): string[] {
  const found = new Map<string, string>();
  for (const match of summary.matchAll(TAG_PATTERN)) {
    const raw = match[1];
    const key = raw.toLowerCase();
    if (!found.has(key)) found.set(key, raw);
  }
  return [...found.values()];
}

/**
 * 活動のうち、集計期間に重なっている長さ(分)。
 *
 * 期間の端をまたぐ活動(7日前に始まって6日前に終わった睡眠など)は、はみ出した分を
 * 切り落として数える。これをしないと期間の合計が期間の長さを超える。
 * 進行中の活動(`end_time is null`)は期間の終わり(=今)までとして数える。
 */
function overlapMinutes(activity: Activity, startMs: number, endMs: number): number {
  const from = Math.max(new Date(activity.start_time).getTime(), startMs);
  const until = Math.min(
    activity.end_time === null ? endMs : new Date(activity.end_time).getTime(),
    endMs
  );
  if (!(until > from)) return 0;
  return Math.floor((until - from) / 60000);
}

/**
 * 期間内の活動をカテゴリー別・タグ別に集計する。
 *
 * タグの集計はカテゴリーと違い、合計が期間の長さに一致しない:
 *
 * - 1つの概要に複数のタグがあれば、その活動の長さを**それぞれに全額** 加算する
 *   (半分ずつに割ると「#タイ語に何分使ったか」が読めなくなる)
 * - タグの無い活動はどのタグにも入らない
 *
 * @param activities 期間に重なる活動。表示に使う表記を決めるため、新しい順に渡すこと
 */
export function aggregate(
  activities: Activity[],
  startTime: string,
  endTime: string,
  period: StatsPeriod
): Stats {
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  const byCategory = new Map<Category, number>(CATEGORIES.map((c) => [c, 0]));
  // キーは小文字にしたタグ。表示は最初に見つけた表記(=最も新しい活動での書き方)を使う
  const byTag = new Map<string, { tag: string; minutes: number }>();

  for (const activity of activities) {
    const minutes = overlapMinutes(activity, startMs, endMs);
    if (minutes === 0) continue;

    byCategory.set(activity.category, (byCategory.get(activity.category) ?? 0) + minutes);

    for (const tag of extractTags(activity.summary)) {
      const key = tag.toLowerCase();
      const entry = byTag.get(key);
      if (entry) entry.minutes += minutes;
      else byTag.set(key, { tag, minutes });
    }
  }

  // 多い順。同じ長さのときは、カテゴリーは定義順、タグは名前順にして並びを安定させる
  // (再読み込みのたびに入れ替わると、同じ画面を見ているつもりで別物を見ることになる)
  const categories = CATEGORIES.map((category) => ({
    category,
    minutes: byCategory.get(category) ?? 0,
  })).sort((a, b) => b.minutes - a.minutes || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));

  const tags = [...byTag.values()]
    .map(({ tag, minutes }) => ({ tag, minutes }))
    .sort((a, b) => b.minutes - a.minutes || a.tag.localeCompare(b.tag));

  return {
    period,
    start_time: startTime,
    end_time: endTime,
    total_minutes: categories.reduce((sum, c) => sum + c.minutes, 0),
    categories,
    tags,
  };
}

/** 日別表で見る日数。まずはこの1つに絞る(CLAUDE.mdの段階的開発の方針) */
export const DAILY_DAYS = 30;

/** 日別のタグ別表で見るタグの数。上位何件かに絞らないと、日ごとに列が増減して表にならない */
export const DAILY_TAG_LIMIT = 5;

export type DailyStat = {
  start_time: string;
  end_time: string;
  /** 今日の行だけ true。他の日と違って24時間に満たない(まだ進行中)ことを示す */
  inProgress: boolean;
  total_minutes: number;
  categories: CategoryStat[];
  /** DAILY_DAYS日合計で多い上位 DAILY_TAG_LIMIT 件だけ。その日に無ければ0分(0詰め)。
      全ての日で同じタグ・同じ並びにするため(日によって列が変わると表として読めない) */
  tags: TagStat[];
};

export type DailyBreakdown = {
  /** 新しい順(今日が先頭) */
  days: DailyStat[];
  /** DAILY_DAYS日合計で多い順のタグの表示名。上位 DAILY_TAG_LIMIT 件 */
  topTags: string[];
};

/**
 * 直近 DAILY_DAYS 日ぶんを、ローカルの暦日で1日ずつに区切ってカテゴリー別・タグ別に集計する。
 *
 * タグは日ごとに全部出すと数が細かくなりすぎて読めないため、まず DAILY_DAYS 日全体で
 * 多い順に上位 DAILY_TAG_LIMIT 件を決め(`topTags`)、日ごとの内訳はその5件だけに絞る。
 * `aggregate` を全体で1回・日ごとに DAILY_DAYS 回呼ぶだけで、重なり判定・集計ロジックを
 * 二重に持たない。
 *
 * @param todayStartMs 今日のローカル午前0時(UTCミリ秒)。`localMidnightUtcMs` の戻り値
 * @param nowMs 現在時刻(UTCミリ秒)。今日の行の終わりに使う
 */
export function aggregateDaily(activities: Activity[], todayStartMs: number, nowMs: number): DailyBreakdown {
  const rangeStart = new Date(todayStartMs - (DAILY_DAYS - 1) * DAY_MS).toISOString();
  const rangeEnd = new Date(nowMs).toISOString();
  const overall = aggregate(activities, rangeStart, rangeEnd, DAILY_DAYS);
  const topTags = overall.tags.slice(0, DAILY_TAG_LIMIT).map((t) => t.tag);
  const topTagKeys = topTags.map((t) => t.toLowerCase());

  const days: DailyStat[] = [];
  for (let i = 0; i < DAILY_DAYS; i++) {
    const dayStartMs = todayStartMs - i * DAY_MS;
    const inProgress = i === 0;
    const dayEndMs = inProgress ? nowMs : dayStartMs + DAY_MS;
    const startTime = new Date(dayStartMs).toISOString();
    const endTime = new Date(dayEndMs).toISOString();
    const dayStats = aggregate(activities, startTime, endTime, DAILY_DAYS);
    const tags = topTags.map((tag, index) => ({
      tag,
      minutes: dayStats.tags.find((t) => t.tag.toLowerCase() === topTagKeys[index])?.minutes ?? 0,
    }));
    days.push({
      start_time: startTime,
      end_time: endTime,
      inProgress,
      total_minutes: dayStats.total_minutes,
      categories: dayStats.categories,
      tags,
    });
  }
  return { days, topTags };
}
