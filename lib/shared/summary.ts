// lib/shared/ の意味は ./time.ts の冒頭を参照(ブラウザとサーバーの両方からimportされる)。
//
// 概要(summary)は「学習」「仕事」といったカテゴリーだけでは分からない対象
// (「Claude Code」「タイ語」「チェス」など)を後から書き足すための任意項目。
// 正規化をここに置いてサーバーとブラウザで共有するのは、楽観的更新のため。
// ブラウザが画面に出す値とサーバーが保存する値が食い違うと、保存した瞬間の表示と
// リロード後の表示がずれる。

/**
 * 概要の最大文字数(コードポイント単位)。
 * DB側にも同じ長さのCHECK制約(`activities_summary_length_check`)を入れてある。
 * ここの切り詰めが漏れたら静かに長い値が入るのではなく、その場でINSERT/UPDATEが失敗する。
 */
export const SUMMARY_MAX_LENGTH = 100;

/**
 * 入力された概要をDBに入れる形に正規化する。
 *
 * - 未入力・文字列でない値は空文字にする(概要は任意項目なので、無いことをnullではなく
 *   空文字で表す。null と '' の2通りの「未入力」を作らないため)
 * - 連続する空白は1つに潰して前後を削る。1行の入力欄なので通常は改行が入らないが、
 *   貼り付けでは入りうる
 * - 長すぎる入力は切り詰める。`Array.from`で数えるのはサロゲートペア(絵文字など)を
 *   途中で断ち切らないため
 */
export function normalizeSummary(value: unknown): string {
  if (typeof value !== 'string') return '';
  const collapsed = value.replace(/\s+/g, ' ').trim();
  const chars = Array.from(collapsed);
  return chars.length <= SUMMARY_MAX_LENGTH ? collapsed : chars.slice(0, SUMMARY_MAX_LENGTH).join('');
}
