import { Link } from 'react-router';
import { useActivityLog } from '@/hooks/useActivityLog';

type Props = {
  title: string;
  navTo: string;
  navLabel: string;
};

/**
 * 記録画面・集計画面で共通のヘッダー。タイトルと画面切り替えリンクに加えて、
 * 手動更新ボタンを出す(SWR: 通常は自動で裏検証されるが、「今すぐ最新を見たい」という
 * 明示的な経路として用意する)。`refreshing`(裏検証・手動更新のいずれかが進行中)の間は
 * アイコンを回転させ、押している間に何が起きているか分かるようにする。
 */
export function AppHeader({ title, navTo, navLabel }: Props) {
  const { refresh, refreshing } = useActivityLog();

  return (
    <header className="app-header">
      <h1>{title}</h1>
      <div className="app-header__actions">
        <button
          type="button"
          className={'refresh-button' + (refreshing ? ' refresh-button--spinning' : '')}
          onClick={() => void refresh()}
          disabled={refreshing}
          title="最新の情報に更新"
          aria-label="最新の情報に更新"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12a7 7 0 0112.5-4.2M19 12a7 7 0 01-12.5 4.2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M17.5 4.5v3.5H14M6.5 19.5V16H10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <Link className="app-header__link" to={navTo}>
          {navLabel}
        </Link>
      </div>
    </header>
  );
}
