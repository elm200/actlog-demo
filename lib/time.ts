// 表示・入力まわりの時刻ヘルパー(ブラウザ専用)。分単位に切り捨てるという方針そのものは
// サーバーと共有する必要があるので ./shared/time.ts にある。

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * ISO文字列(UTC)を <input type="datetime-local"> 用のローカル時刻文字列に変換する。
 * 活動の時刻は分単位で扱う方針なので、秒は出力しない(=inputも分単位で表示される)。
 */
export function toLocalInputValue(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * <input type="datetime-local"> の値(ローカル時刻)をISO文字列(UTC)に変換する。
 * inputは分単位だが、ブラウザによっては秒を返しうるので、ここでも秒以下は切り捨てる。
 */
export function fromLocalInputValue(localValue: string): string {
  const date = new Date(localValue);
  date.setSeconds(0, 0);
  return date.toISOString();
}

/** 表示用の時刻文字列(HH:MM) */
export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 表示用の日付文字列(M/D) */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 分数を「1時間30分」のような文字列にする(カードの所要時間と集計の棒グラフで共用) */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** 分数を「3:29」のような短縮表記にする(日別表専用)。0分をどう扱うかは呼び出し側の責務 */
export function formatMinutesHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${pad(m)}`;
}

/**
 * 経過時間を「1時間30分」のような文字列にする。
 * 進行中の活動では現在時刻との差になるが、その活動が実際に閉じられるときの終了時刻も
 * 分単位に切り捨てられるので、表示も切り捨て(四捨五入しない)で揃える。
 */
export function formatDuration(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return formatMinutes(Math.max(0, Math.floor((end - start) / 60000)));
}

/** 集計期間の表示用(「8/8 15:04」) */
export function formatDateTime(isoString: string): string {
  return `${formatDate(isoString)} ${formatTime(isoString)}`;
}
