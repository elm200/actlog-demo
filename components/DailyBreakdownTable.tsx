import { formatDate, formatMinutesHM } from '@/lib/time';
import type { DailyStat } from '@/lib/stats';

export type DailyBreakdownColumn = {
  key: string;
  label: string;
  /** 指定したら数値セルの文字色にする(カテゴリー表で categoryColor() を渡す用) */
  color?: string;
};

/** 0分は空欄にする(1マスも記録の無いセルを "0:00" で埋めると、実際に記録がある
    セルとの区別がつきにくくなる) */
function cellText(minutes: number): string {
  return minutes === 0 ? '' : formatMinutesHM(minutes);
}

/**
 * 日別の内訳表。カテゴリー別・タグ別の両方から使う汎用コンポーネント(列の中身と
 * 色付けの有無だけが違い、構造は同じなので1つにまとめてある)。
 *
 * 日ごとの行に「合計」列は置かない。カテゴリーは1日24時間を必ず割り当てる前提なので
 * 合計は常に24:00になり自明、タグは1つの活動が複数タグに全額計上されるため
 * 「日の合計」という数字自体に意味が薄い。
 *
 * 先頭(thead側)に DAILY_DAYS 日ぶんの合計行を置く。tbody 側の縞模様(ゼブラ)と
 * 衝突しないよう、あえて thead に入れてある。
 */
export function DailyBreakdownTable({
  days,
  columns,
  getMinutes,
  averageDenominator,
}: {
  days: DailyStat[];
  columns: DailyBreakdownColumn[];
  getMinutes: (day: DailyStat, columnKey: string) => number;
  /** 指定したら「合計」の下に「平均」行を出す。分母(日数)は呼び出し側が決める。 */
  averageDenominator?: number;
}) {
  const totals = columns.map((col) => days.reduce((sum, day) => sum + getMinutes(day, col.key), 0));

  return (
    <div className="daily-table-wrap">
      <table className="daily-table">
        <thead>
          <tr>
            <th scope="col">日付</th>
            {columns.map((col) => (
              <th scope="col" key={col.key}>
                {col.label}
              </th>
            ))}
          </tr>
          <tr className="daily-table__summary">
            <th scope="row">合計</th>
            {columns.map((col, index) => (
              <td key={col.key} style={col.color ? { color: col.color } : undefined}>
                {cellText(totals[index])}
              </td>
            ))}
          </tr>
          {averageDenominator !== undefined && averageDenominator > 0 && (
            <tr className="daily-table__average">
              <th scope="row">平均</th>
              {columns.map((col, index) => (
                <td key={col.key} style={col.color ? { color: col.color } : undefined}>
                  {cellText(Math.round(totals[index] / averageDenominator))}
                </td>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.start_time}>
              <th scope="row">{formatDate(day.start_time)}</th>
              {columns.map((col) => (
                <td key={col.key} style={col.color ? { color: col.color } : undefined}>
                  {cellText(getMinutes(day, col.key))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
