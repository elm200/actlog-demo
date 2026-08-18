// ブラウザとサーバーの両方からimportされる共有モジュール(置き場所の意図は
// ./time.ts の冒頭を参照)。activitiesは`start_time`だけを持ち、`end_time`は
// 「時間的に次の活動のstart_time」として導出される値。DBはend_timeを一切
// 計算しない(SQLに`lead()`等は書かない)ので、これがend_time導出の唯一の実装になる。

import type { Activity } from '../activity.ts';

/**
 * 次の行のstart_timeを自分のend_timeとする(最新行はnull)。呼び出し側の並びには
 * 依存しない。
 *
 * end_timeは列として保存されておらず常にこの関数で導出するので、編集・挿入・削除は
 * 対象の行(たかだか1行)を書き換えるだけでよく、隣接する行への書き込みが要らない。
 */
export function deriveEndTimes(activities: Activity[]): Activity[] {
  const asc = [...activities].sort((a, b) =>
    a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0
  );
  const endById = new Map<number, string | null>();
  asc.forEach((a, i) => endById.set(a.id, i + 1 < asc.length ? asc[i + 1].start_time : null));
  return activities.map((a) => ({ ...a, end_time: endById.get(a.id) ?? null }));
}

/**
 * start_time降順 → 進行中を先 → id降順。楽観的に作った行も、サーバーから
 * 取り直したときと同じ位置に置くための並び順。
 */
export function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => {
    if (a.start_time !== b.start_time) return a.start_time < b.start_time ? 1 : -1;
    const aOpen = a.end_time === null ? 1 : 0;
    const bOpen = b.end_time === null ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return b.id - a.id;
  });
}
