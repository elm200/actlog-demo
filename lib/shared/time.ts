// lib/shared/ は、ブラウザ(Client Component)とサーバー(Route Handler)の両方から
// importされるディレクトリ。ここに置けるのはDOMにもnodeにも依存しない純粋な
// ドメインロジックだけで、片方しか使わないものは置かないこと。
//
// 配信はNext.jsのバンドラが面倒を見るので、置き場所はpublic/の下である必要がない
// (vanilla JS版ではブラウザから取得させるためにpublic/js/shared/に置いていた)。
// ディレクトリを分けている理由は依存関係を目に見えるようにするため。ここに置いたものは
// 「サーバーからも使われている」ことが読み取れる状態を保つ。

/**
 * 活動の開始・終了時刻は分単位で扱う(秒以下は切り捨て)。このアプリで記録する活動に
 * 1分未満のものは存在しないため、秒を持つと編集フォームが煩雑になるだけで得がない。
 * 丸めではなく切り捨てに統一しておくと、「表示されている時刻」と「保存されている時刻」が
 * 常に一致し、隣接する活動の境界を厳密な`=`で突き合わせるロジックも壊れない。
 *
 * @param value ISO文字列など、Dateが解釈できる値
 * @returns 秒以下を0にしたISO文字列。解釈できない値ならnull
 */
export function floorToMinute(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

/**
 * 現在時刻を分単位に切り捨てたISO文字列。
 * 楽観的更新で「サーバーがこれから記録するであろう開始時刻」を先読みするために使う。
 * サーバー側は`date_trunc('minute', now())`で同じ値を作る(app/api/activities/route.ts)。
 */
export function nowFlooredToMinute(): string {
  const date = new Date();
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}
