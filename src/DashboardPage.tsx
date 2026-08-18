import { useMemo, useState } from 'react';
import { useActivityLog } from '@/hooks/useActivityLog';
import { CATEGORIES, categoryColor, categoryLabel } from '@/lib/categories';
import {
  aggregate,
  aggregateDaily,
  DAY_MS,
  localMidnightUtcMs,
  STATS_PERIODS,
  type StatsPeriod,
} from '@/lib/stats';
import { nowFlooredToMinute } from '@/lib/shared/time';
import { formatDateTime, formatMinutes } from '@/lib/time';
import { AppHeader } from '@/components/AppHeader';
import { BarChart, BarChartSkeleton, type BarItem } from '@/components/BarChart';
import { DailyBreakdownTable, type DailyBreakdownColumn } from '@/components/DailyBreakdownTable';

/** タグの棒を出す上限。これを超えたぶんは件数だけ知らせる(長い一覧はグラフとして読めない) */
const TAG_LIMIT = 12;

/** 読み込み中に出す棒の本数と基準の長さ(%)。カテゴリーは必ず5本なので本数が正しい。
    タグは何本になるか分からないので、少なめの4本にしてある(多く出して減るより目立たない) */
const CATEGORY_SKELETON = [92, 71, 54, 36, 19];
const TAG_SKELETON = [86, 62, 43, 25];

/** 日別表のカテゴリー列。数値の文字色をカードのchipと同じ色にする(BarChartと同じ理由) */
const CATEGORY_COLUMNS: DailyBreakdownColumn[] = CATEGORIES.map((category) => ({
  key: category,
  label: categoryLabel(category),
  color: categoryColor(category),
}));

/** タブに出す文言。今日・昨日はカレンダー日、数値は移動窓であることが伝わるように「過去」を付ける */
function periodLabel(period: StatsPeriod): string {
  if (period === 'today') return '今日';
  if (period === 'yesterday') return '昨日';
  return `過去${period}日`;
}

/** periodに対応する集計期間の[start, end)を求める。今日/昨日はローカルの暦日、
    数値は「今から遡ってN日」の移動窓(旧api/stats.tsのロジックをそのまま移設)。 */
function periodRange(period: StatsPeriod, tzOffsetMinutes: number): { startTime: string; endTime: string } {
  const todayStartMs = localMidnightUtcMs(Date.now(), tzOffsetMinutes);
  if (period === 'today') {
    return { startTime: new Date(todayStartMs).toISOString(), endTime: nowFlooredToMinute() };
  }
  if (period === 'yesterday') {
    return {
      startTime: new Date(todayStartMs - DAY_MS).toISOString(),
      endTime: new Date(todayStartMs).toISOString(),
    };
  }
  const endTime = nowFlooredToMinute();
  const startTime = new Date(new Date(endTime).getTime() - period * DAY_MS).toISOString();
  return { startTime, endTime };
}

export function DashboardPage() {
  // 記録画面と同じ、アプリ全体で共有された活動一覧を使う(hooks/useActivityLog.tsx)。
  // このProviderがルート直下に常駐しているため、ここで独自にfetchする必要はない
  // (画面遷移で毎回叩き直すことも無い)。集計(日別・期間別)はどちらもこのデータから
  // ブラウザ側でその場で計算する。
  const { activities, loaded, error } = useActivityLog();

  // 既定表示: 日別の内訳(カテゴリー別・タグ別)。
  const daily = useMemo(() => {
    if (!loaded) return null;
    const nowMs = Date.now();
    const todayStartMs = localMidnightUtcMs(nowMs, new Date().getTimezoneOffset());
    return aggregateDaily(activities, todayStartMs, nowMs);
  }, [loaded, activities]);

  // グラフ(期間タブ+棒グラフ)は一番下に畳んである(棒グラフは日別表に比べて情報量が薄い
  // という判断で、既定表示からは外した)。計算自体はactivitiesさえあればいつでも軽いので、
  // 開いているかどうかに関わらずuseMemoで求めておき、表示だけ出し分ける。
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [period, setPeriod] = useState<StatsPeriod>(7);

  const stats = useMemo(() => {
    if (!loaded) return null;
    const { startTime, endTime } = periodRange(period, new Date().getTimezoneOffset());
    return aggregate(activities, startTime, endTime, period);
  }, [loaded, activities, period]);

  // カテゴリーの棒はカードのchipと同じ色にする(色は「どのカテゴリーか」を指す印なので、
  // 画面をまたいで同じでなければ意味を持たない)。
  const categoryItems: BarItem[] =
    stats?.categories.map((c) => ({
      key: c.category,
      label: categoryLabel(c.category),
      minutes: c.minutes,
      color: categoryColor(c.category),
      note:
        stats.total_minutes > 0 ? `${Math.round((c.minutes / stats.total_minutes) * 100)}%` : undefined,
    })) ?? [];

  // タグには決まった色が無い。順に色を割り当てると、期間を変えて並びが入れ替わるたびに
  // 同じタグが別の色になり、色が嘘をつく。全部同じ色にして、長さだけで比べさせる。
  //
  // その色に --accent を使っているのは**暫定**。--accent は「学習」と同じ #3b82f6 なので、
  // タグが学習の活動に付いているように見える。当面タグを学習にしか付けない運用なので
  // 偶然正しいだけで、他のカテゴリーに付け始めたら何の警告もなく嘘になる。そうなったら
  // 色を変えるのではなく、棒をカテゴリー別の積み上げにする(CLAUDE.mdに条件を書いてある)。
  const tagItems: BarItem[] =
    stats?.tags.slice(0, TAG_LIMIT).map((t) => ({
      key: t.tag.toLowerCase(),
      label: `#${t.tag}`,
      minutes: t.minutes,
      color: 'var(--accent)',
    })) ?? [];
  const hiddenTagCount = Math.max(0, (stats?.tags.length ?? 0) - TAG_LIMIT);

  const tagColumns: DailyBreakdownColumn[] =
    daily?.topTags.map((tag) => ({ key: tag.toLowerCase(), label: `#${tag}` })) ?? [];

  return (
    <>
      <AppHeader title="集計" navTo="/" navLabel="記録" />
      <main>
        <p className="error-message" role="alert" hidden={!error}>
          {error ?? ''}
        </p>

        {daily === null && error ? null : (
          <div className="stats">
            <section className="stats-section">
              <h2>カテゴリー別(日別)</h2>
              {daily === null ? (
                <p className="stats-note" role="status">
                  読み込んでいます…
                </p>
              ) : (
                <DailyBreakdownTable
                  days={daily.days}
                  columns={CATEGORY_COLUMNS}
                  getMinutes={(day, key) => day.categories.find((c) => c.category === key)?.minutes ?? 0}
                  averageDenominator={daily.days.filter((d) => d.total_minutes > 0).length}
                />
              )}
            </section>

            <section className="stats-section">
              <h2>タグ別(日別)</h2>
              {daily === null ? (
                <p className="stats-note" role="status">
                  読み込んでいます…
                </p>
              ) : daily.topTags.length === 0 ? (
                <p className="stats-note">
                  タグがありません。概要に「#thai」のように書くと、ここに集計されます。
                </p>
              ) : (
                <DailyBreakdownTable
                  days={daily.days}
                  columns={tagColumns}
                  getMinutes={(day, key) => day.tags.find((t) => t.tag.toLowerCase() === key)?.minutes ?? 0}
                  averageDenominator={daily.days.filter((d) => d.total_minutes > 0).length}
                />
              )}
            </section>
          </div>
        )}

        {/* 上の日別表とは独立したセクション。期間タブの「過去30日」は移動窓、日別表は
            ローカルの暦日で1日ずつ区切った集計なので、同じ「30日」でも境界の取り方が違う。
            両者を並べて出すと数字が微妙に一致せず混乱するため連動させない。 */}
        <section className="stats-section">
          <button
            type="button"
            className="daily-toggle"
            aria-expanded={graphExpanded}
            onClick={() => setGraphExpanded((v) => !v)}
          >
            {graphExpanded ? 'グラフを閉じる' : 'グラフで見る'}
          </button>

          {graphExpanded && (
            <div className="daily-toggle__content">
              <div className="period-tabs" role="group" aria-label="集計する期間">
                {STATS_PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={'period-tab' + (p === period ? ' period-tab--active' : '')}
                    aria-pressed={p === period}
                    onClick={() => setPeriod(p)}
                  >
                    {periodLabel(p)}
                  </button>
                ))}
              </div>

              {stats === null && error ? null : (
                <div className="stats">
                  {stats === null ? (
                    <>
                      <p className="visually-hidden" role="status">
                        集計を読み込んでいます
                      </p>
                      <p className="stats-range skeleton-lines" aria-hidden="true">
                        <span className="skeleton skeleton--line" style={{ width: '17em' }} />
                      </p>
                    </>
                  ) : (
                    <p className="stats-range">
                      {formatDateTime(stats.start_time)} 〜 {formatDateTime(stats.end_time)}
                    </p>
                  )}

                  <section className="stats-section">
                    <h2>カテゴリー別</h2>
                    {stats === null ? (
                      <>
                        <p className="stats-note skeleton-lines" aria-hidden="true">
                          <span className="skeleton skeleton--line" style={{ width: '11em' }} />
                        </p>
                        <BarChartSkeleton widths={CATEGORY_SKELETON} />
                      </>
                    ) : stats.total_minutes === 0 ? (
                      <p className="stats-note">この期間の記録はありません</p>
                    ) : (
                      <>
                        <p className="stats-note">記録された合計 {formatMinutes(stats.total_minutes)}</p>
                        <BarChart items={categoryItems} />
                      </>
                    )}
                  </section>

                  <section className="stats-section">
                    <h2>タグ別</h2>
                    {stats !== null && tagItems.length === 0 ? (
                      <p className="stats-note">
                        タグがありません。概要に「#thai」のように書くと、ここに集計されます。
                      </p>
                    ) : (
                      <>
                        <p className="stats-note">
                          概要に書いた #タグ を集計しています。1つの活動に複数のタグがあれば、その長さをそれぞれに数えるので、合計は期間の長さと一致しません。
                        </p>
                        {stats === null ? (
                          <BarChartSkeleton widths={TAG_SKELETON} />
                        ) : (
                          <>
                            <BarChart items={tagItems} />
                            {hiddenTagCount > 0 && (
                              <p className="stats-note">ほかに{hiddenTagCount}個のタグがあります</p>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </section>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
