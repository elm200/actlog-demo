import type { ReactNode } from 'react';

/** 編集フォームのボタンに使うアイコン(24x24のviewBox、線はcurrentColor) */
const EDIT_ACTION_ICONS = {
  save: (
    <path
      d="M5 12.5l4.5 4.5L19 7.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  cancel: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  delete: (
    <path
      d="M4.5 7h15M9.5 7V5.5a1 1 0 011-1h3a1 1 0 011 1V7M10 11v6M14 11v6M6.5 7l.8 12a1 1 0 001 .95h7.4a1 1 0 001-.95L17.5 7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
} satisfies Record<string, ReactNode>;

type Props = {
  type: 'submit' | 'button';
  label: string;
  icon: keyof typeof EDIT_ACTION_ICONS;
  className?: string;
  onClick?: () => void;
};

/**
 * 編集フォームのボタン1つ分。モバイルでは「キャンセル」が折り返して2行になり読みにくいので、
 * アイコンと文言の両方を出しておき、幅の狭い画面ではCSSで文言だけを隠す(globals.cssの
 * `.card__edit-actions .btn-label`)。アイコンだけになっても意味が分かるよう、
 * ボタン自身にaria-label/titleを必ず持たせる。
 */
export function EditActionButton({ type, label, icon, className, onClick }: Props) {
  return (
    <button type={type} className={className} title={label} aria-label={label} onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {EDIT_ACTION_ICONS[icon]}
      </svg>
      <span className="btn-label">{label}</span>
    </button>
  );
}
