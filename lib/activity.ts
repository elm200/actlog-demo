import type { Category } from './categories.ts';

/**
 * 活動記録のドメイン型。クライアント・サーバーの双方から参照する。
 *
 * `id`は`number`。DBの`activities.id`は`bigint`でドライバは文字列を返すが、
 * `lib/db.ts`の`normalizeActivityRow`が境界で数値に直すので、ここから先に
 * 文字列のidは流れてこない。**`Activity`を作るのはあの関数だけに保つこと。**
 */
export type Activity = {
  id: number;
  category: Category;
  start_time: string;
  end_time: string | null;
  /**
   * 活動の概要(任意)。未入力は空文字で表す。
   * 「未入力」の表現をnullと空文字の2通りにしないため、DB側も not null default '' にしてある。
   */
  summary: string;
};

/**
 * 活動の編集・保存時にフォームから渡される値。
 * end_timeは持たない(導出値であり、編集できるのはstart_timeだけ。
 * ある活動の「終了」を変えたければ、次の活動のstart_timeを編集する)。
 */
export type ActivityPatch = {
  category: Category;
  start_time: string;
  summary: string;
};

/**
 * 「+」で追加しようとしている、まだDBに存在しない活動。
 * 保存するまでサーバーには一切送らないので、キャンセルすれば何も残らない。
 * `beforeId`は挿入位置より新しい側の活動のid(この活動の1つ古い側に入る)。
 */
export type Draft = {
  beforeId: number;
  activity: Activity;
};

/**
 * 下書きの活動に与える仮のid。DBのidは常に正なので衝突しない。
 * 同時に開ける下書きは1つだけなので固定値でよい。
 */
export const DRAFT_ID = -1;
