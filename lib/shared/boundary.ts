// ブラウザ(Client Component)とサーバー(Route Handler)の両方からimportされる
// 共有モジュール。置き場所の意図は ./time.ts の冒頭を参照。ここの関数は楽観的更新の
// ためにブラウザ側でも同じ結果を出す必要があるので、DBアクセスも乱数も現在時刻も
// 持ち込まないこと。

export type Neighbor = { id: number; start_time: string };

export type BoundaryValidation = { ok: true } | { ok: false; error: string };

/**
 * 編集・挿入後のstart_timeが、前後の活動との整合性(重複なし・未来でない)を
 * 満たすかを判定する。DBアクセスを含まない純粋関数。「現在時刻」もここでは
 * `Date.now()`等を直接読まず、呼び出し側から値として受け取る(冒頭の方針を参照)。
 *
 * 各活動はstart_timeだけを持ち、end_timeは「時間的に次の活動のstart_time」として
 * 導出される値なので、境界の検証はこのstart_time一本を前後のstart_timeと比べるだけで足りる。
 *
 * @param startTime 編集・挿入後のstart_time
 * @param prev 直前の活動(なければnull)
 * @param next 直後の活動(なければnull)
 * @param now 現在時刻(分単位に切り捨て済みのISO文字列)
 */
export function validateStartTime(
  startTime: string,
  prev: Neighbor | null,
  next: Neighbor | null,
  now: string
): BoundaryValidation {
  if (startTime > now) {
    return { ok: false, error: '開始時刻は現在時刻より後にはできません' };
  }
  if (prev && !(startTime > prev.start_time)) {
    return { ok: false, error: '直前の活動の開始時刻より後の時刻にしてください' };
  }
  if (next && !(startTime < next.start_time)) {
    return { ok: false, error: '直後の活動の開始時刻より前の時刻にしてください' };
  }
  return { ok: true };
}
