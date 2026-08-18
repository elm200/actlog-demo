// カテゴリー定義の唯一の場所。vanilla JS版ではブラウザ用(表示名・色)とサーバー用
// (検証)で2ファイルに分かれていたが、Next.jsではどちらからも同じモジュールをimport
// できるので1つにまとめてある。

export type Category = 'learning' | 'work' | 'rest' | 'social' | 'sleep';

export type CategoryDef = {
  id: Category;
  label: string;
  color: string;
};

export const CATEGORY_DEFS: CategoryDef[] = [
  { id: 'learning', label: '学習', color: '#3b82f6' },
  { id: 'work', label: '仕事', color: '#f59e0b' },
  { id: 'rest', label: '休息', color: '#6b7280' },
  { id: 'social', label: '社交', color: '#ec4899' },
  { id: 'sleep', label: '睡眠', color: '#6366f1' },
];

export const CATEGORIES: Category[] = CATEGORY_DEFS.map((c) => c.id);

export function categoryLabel(id: Category): string {
  return CATEGORY_DEFS.find((c) => c.id === id)?.label ?? id;
}

export function categoryColor(id: Category): string {
  return CATEGORY_DEFS.find((c) => c.id === id)?.color ?? '#999999';
}

/** リクエストボディなど、信頼できない値がカテゴリーかどうかを判定する */
export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && CATEGORIES.includes(value as Category);
}
