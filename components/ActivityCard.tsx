import type { FormEvent } from 'react';
import type { Activity, ActivityPatch } from '@/lib/activity';
import { CATEGORY_DEFS, categoryLabel, categoryColor, type Category } from '@/lib/categories';
import { toLocalInputValue, fromLocalInputValue, formatTime, formatDate, formatDuration } from '@/lib/time';
import { normalizeSummary, SUMMARY_MAX_LENGTH } from '@/lib/shared/summary';
import { EditActionButton } from './EditActionButton';

export type ListHandlers = {
  onEdit: (id: number) => void;
  onCancel: () => void;
  onSave: (id: number, patch: ActivityPatch) => void;
  onDelete: (id: number) => void;
  onInsert: (beforeId: number) => void;
};

type ViewCardProps = {
  activity: Activity;
  /** trueなら直後(古い側)に活動があり、間に挿入できる */
  hasOlderNeighbor: boolean;
} & Pick<ListHandlers, 'onEdit' | 'onInsert'>;

/**
 * 幅を揃えるためだけの見えない文字。
 *
 * カードごとに日付や時刻の桁数が違うと(「8/9」と「12/14」、進行中の「19:02〜」と
 * 「18:14〜18:59」)、その右にある概要の開始位置がカードごとにずれる。足りない桁のぶんを
 * 見えない文字で埋めて、どのカードでも同じ幅になるようにする。
 *
 * 幅の数値をCSSに直接書かない(chipのようにはできない)のは、桁の幅がフォントで変わるため。
 * 実際に同じ文字を置いて埋めれば、どのフォントでも必ず一致する。
 */
function WidthFiller({ text }: { text: string }) {
  return (
    <span className="card__filler" aria-hidden="true">
      {text}
    </span>
  );
}

/** 閲覧用のカード内容 */
function ViewCard({ activity, hasOlderNeighbor, onEdit, onInsert }: ViewCardProps) {
  const date = formatDate(activity.start_time);
  // formatDateは「M/D」なので、スラッシュ1つを除いた残りが日付の桁数。最大(MM/DD)は4桁
  const dateFiller = '0'.repeat(4 - (date.length - 1));

  return (
    <div className="card__row" onClick={() => onEdit(activity.id)}>
      <span className="chip" style={{ backgroundColor: 'var(--cat-color)' }}>
        {categoryLabel(activity.category)}
      </span>
      <span className="card__date">
        {date}
        {dateFiller !== '' && <WidthFiller text={dateFiller} />}
      </span>
      {/* 進行中の活動は終了時刻を出さず「14:10〜」で止める。進行中であることは
          カードの枠の色(card--active)と上の状態表示で分かるので、文字で言う必要がない。
          ただし幅は終了時刻がある行と揃える(でないと右の概要だけが左に寄る)。 */}
      <span className="card__time">
        {formatTime(activity.start_time)}〜
        {activity.end_time ? formatTime(activity.end_time) : <WidthFiller text="00:00" />}
      </span>
      {/* 概要は任意項目。空のときは要素ごと出さない(空の隙間で行が間延びしないように) */}
      {activity.summary !== '' && <span className="card__summary">{activity.summary}</span>}
      <span className="card__duration">{formatDuration(activity.start_time, activity.end_time)}</span>
      {hasOlderNeighbor ? (
        <button
          type="button"
          className="card__insert-icon"
          title="この間に活動を追加"
          aria-label="この間に活動を追加"
          onClick={(event) => {
            event.stopPropagation();
            onInsert(activity.id);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 7.5v9M7.5 12h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        // 一番古い活動には「+」が無い(その先に挿入する相手がいない)。下書きを開いている間も
        // 全カードから消える。詰めてしまうと所要時間の右端がそのカードだけずれるので、
        // 同じclassの空要素で場所だけ確保する(WidthFillerと同じ考え方。大きさの数値を
        // 書き写さずに済むよう、classを共有して見えなくするだけにしてある)。
        <span className="card__insert-icon card__insert-icon--empty" aria-hidden="true" />
      )}
    </div>
  );
}

type EditCardProps = {
  activity: Activity;
  /** まだDBに存在しない下書き。消すのは「キャンセル」の役目なので削除ボタンを出さない */
  isDraft: boolean;
} & Pick<ListHandlers, 'onSave' | 'onCancel' | 'onDelete'>;

/**
 * 編集用のカード内容(フォーム)。
 *
 * 入力欄は非制御(defaultValue)にしてある。stateに毎打鍵を吸い上げないことで、
 * 楽観的更新で一覧が何度描き直されても入力中の値が上書きされない。
 * vanilla JS版でカードごとの`signature`比較が担っていた役割を、Reactの差分更新が
 * そのまま肩代わりする形になる。
 */
function EditCard({ activity, isDraft, onSave, onCancel, onDelete }: EditCardProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const category = data.get('category') as Category;
    const startLocal = data.get('start_time') as string;
    onSave(activity.id, {
      category,
      start_time: fromLocalInputValue(startLocal),
      // サーバーと同じ関数で正規化しておく。楽観的更新では保存前の値をそのまま画面に出すので、
      // ここで正規化しないと「保存直後の表示」と「サーバーが保存した値」がずれる。
      summary: normalizeSummary(data.get('summary')),
    });
  }

  function handleDelete() {
    if (window.confirm('この記録を削除しますか?\n直前の活動の記録がこの時間帯を引き継ぎます。')) {
      onDelete(activity.id);
    }
  }

  return (
    <form className="card__edit" onSubmit={handleSubmit}>
      <select name="category" defaultValue={activity.category}>
        {CATEGORY_DEFS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {/*
        end_timeは編集の対象にしない(次の活動のstart_timeから導出される値なので、
        この活動自体が持つ編集可能なフィールドではない)。ある活動の「終了」を変えたければ、
        次の活動のカードを開いて、その「開始」を編集する。
      */}
      <label>
        開始
        <input
          type="datetime-local"
          name="start_time"
          defaultValue={toLocalInputValue(activity.start_time)}
          required
        />
      </label>
      {/* 概要は任意項目なので、時刻より下に置く。 */}
      <label>
        概要
        <input
          type="text"
          name="summary"
          defaultValue={activity.summary}
          maxLength={SUMMARY_MAX_LENGTH}
          placeholder="メモ"
          autoComplete="off"
        />
      </label>
      <div className="card__edit-actions">
        <EditActionButton type="submit" label="保存" icon="save" />
        <EditActionButton type="button" label="キャンセル" icon="cancel" onClick={onCancel} />
        {!isDraft && (
          <EditActionButton type="button" label="削除" icon="delete" className="danger" onClick={handleDelete} />
        )}
      </div>
    </form>
  );
}

/**
 * 読み込み中に置くカードの影(skeleton)。ViewCard と**同じ列構成**で組む。
 *
 * 全面に1本の帯を敷くほうが作るのは楽だが、それだと読み込み中だけこの一覧の列
 * (chip・日付・時刻・概要・所要時間)が消え、届いた瞬間に別のレイアウトが現れる。
 * 列をなぞっておけば「同じものが、まだ値の入っていない状態で待っている」に見える。
 *
 * chipだけは帯ではなく**本物の`.chip`に全角2文字**を入れて作る。カテゴリー名はすべて
 * 全角2文字なので、同じ要素に同じ文字数を置けば幅も行の高さも必ず一致する
 * (WidthFiller と同じ考え方)。日付や時刻の帯は em 指定なので近い幅どまりだが、
 * 影と本物が同時に画面に出ることはないので、列がぴたり揃う必要があるのはカード内だけ。
 *
 * @param summaryWidth 概要の帯の長さ(%)。**概要だけ**は本物も長さがばらばらなので行ごとに
 *   変える。他の列は本当に固定幅なので、そちらまで変えると本物と別物に見える。
 *   `null` は概要の無いカード(概要は任意項目で、本物も要素ごと出さない)。狭い画面では
 *   概要が2行目に落ちるぶんカードが高くなるので、全部を概要ありにすると影だけが背高になる。
 */
export function ActivityCardSkeleton({ summaryWidth }: { summaryWidth: number | null }) {
  return (
    <div className="card" aria-hidden="true">
      <div className="card__row">
        <span className="chip chip--skeleton skeleton">　　</span>
        <span className="card__date skeleton-lines">
          <span className="skeleton skeleton--line" style={{ width: '2.8em' }} />
        </span>
        <span className="card__time skeleton-lines">
          <span className="skeleton skeleton--line" style={{ width: '6.2em' }} />
        </span>
        {summaryWidth !== null && (
          <span className="card__summary skeleton-lines">
            <span className="skeleton skeleton--line" style={{ width: `${summaryWidth}%` }} />
          </span>
        )}
        <span className="card__duration skeleton-lines">
          <span className="skeleton skeleton--line" style={{ width: '3.2em' }} />
        </span>
        {/* 本物のカードには「+」がある。押せるものを影に出すわけにはいかないので、
            場所だけ確保する既存の空要素を借りて右端の位置を合わせる */}
        <span className="card__insert-icon card__insert-icon--empty" />
      </div>
    </div>
  );
}

type Props = {
  activity: Activity;
  isEditing: boolean;
  isDraft: boolean;
  hasOlderNeighbor: boolean;
  handlers: ListHandlers;
};

/** 活動記録カード1枚。閲覧と編集を切り替える。 */
export function ActivityCard({ activity, isEditing, isDraft, hasOlderNeighbor, handlers }: Props) {
  const className =
    'card' + (activity.end_time === null ? ' card--active' : '') + (isEditing ? ' card--editing' : '');

  return (
    <div className={className} style={{ '--cat-color': categoryColor(activity.category) }}>
      {isEditing ? (
        <EditCard
          activity={activity}
          isDraft={isDraft}
          onSave={handlers.onSave}
          onCancel={handlers.onCancel}
          onDelete={handlers.onDelete}
        />
      ) : (
        <ViewCard
          activity={activity}
          hasOlderNeighbor={hasOlderNeighbor}
          onEdit={handlers.onEdit}
          onInsert={handlers.onInsert}
        />
      )}
    </div>
  );
}
