import type { Activity } from '@/lib/activity';
import { categoryLabel } from '@/lib/categories';
import { formatDuration } from '@/lib/time';

type Props = {
  current: Activity | null;
  /** 最初の一覧取得が終わったか。終わるまでは「記録なし」を出さない */
  loaded: boolean;
};

/** 「進行中」の状態表示 */
export function CurrentStatus({ current, loaded }: Props) {
  // 読み込み中は高さだけ確保して何も見せない。ここで「記録なし」を先に描いてしまうと、
  // 記録があるときでもロード直後に一瞬それが見えてしまう
  // (このページは静的にプリレンダリングされるので、初期HTMLにそのまま入る)。
  //
  // 代わりにスケルトン(光が流れる帯)を出す。テキストを消すだけだと枠が空っぽで
  // 落ち着かないため。テキスト自体は行の高さを実際の表示と一致させるために残して
  // あり、色を透明にして隠している(globals.cssの `.status--loading`)。
  if (!loaded) {
    return (
      <section className="current-status" aria-live="polite" aria-busy="true">
        <p className="status status--loading" aria-hidden="true">
          読み込み中
        </p>
      </section>
    );
  }

  return (
    <section className="current-status" aria-live="polite">
      {current ? (
        <p className="status">進行中: <strong>{categoryLabel(current.category)}</strong>({formatDuration(current.start_time, null)})</p>
      ) : (
        <p className="status status--empty">記録なし。カテゴリーを選んで開始してください。</p>
      )}
    </section>
  );
}
