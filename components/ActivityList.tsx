import type { Activity } from '@/lib/activity';
import { ActivityCard, ActivityCardSkeleton, type ListHandlers } from './ActivityCard';

type Props = {
  /** 下書きがあれば、それも本来の位置に混ぜた状態で渡すこと */
  activities: Activity[];
  editingId: number | null;
  draftId: number | null;
  handlers: ListHandlers;
};

export function ActivityList({ activities, editingId, draftId, handlers }: Props) {
  return (
    <section className="activity-list" aria-label="活動記録">
      {activities.map((activity, index) => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          isEditing={activity.id === editingId}
          isDraft={activity.id === draftId}
          // 下書きが開いている間は、他のカードの「+」を隠す。下書きは1つしか持てないので、
          // 押しても既存の下書きが消えるだけになり、入力中の内容を失う事故になる。
          hasOlderNeighbor={index < activities.length - 1 && draftId === null}
          handlers={handlers}
        />
      ))}
    </section>
  );
}

/**
 * 読み込み中に一覧の場所へ置く影(skeleton)。概要の帯の長さ(%)を並べた数だけカードを出す。
 *
 * 1枚だけ置くと「1件ある」という別の嘘になり、届いたときの跳ね方も大きい。かといって
 * 枚数は本当は分からないので、**下端をぼかして**「この先まだ続くが、何枚かは言っていない」
 * という形にする(ぼかしは CSS の `.activity-list--skeleton`)。
 *
 * 光の帯は行ごとにずらさない。集計画面の棒は「値が個別に未確定」を表すためにずらしたが、
 * ここは同じ形が並ぶ1つの面なので、ずらすとちらついて落ち着かない。
 */
const SKELETON_SUMMARY_WIDTHS: (number | null)[] = [72, 45, null, 88, 30, null, 62];

export function ActivityListSkeleton() {
  return (
    <section className="activity-list activity-list--skeleton" aria-label="活動記録" aria-busy="true">
      {/* カードは aria-hidden なので、読み込み中であることはこの1行だけが伝える */}
      <p className="visually-hidden" role="status">
        活動記録を読み込んでいます
      </p>
      {SKELETON_SUMMARY_WIDTHS.map((width, index) => (
        <ActivityCardSkeleton key={index} summaryWidth={width} />
      ))}
    </section>
  );
}
