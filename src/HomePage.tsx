import { DRAFT_ID } from '@/lib/activity';
import { useActivityLog } from '@/hooks/useActivityLog';
import { AppHeader } from '@/components/AppHeader';
import { CategoryButtons } from '@/components/CategoryButtons';
import { CurrentStatus } from '@/components/CurrentStatus';
import { ActivityList, ActivityListSkeleton } from '@/components/ActivityList';
import type { ListHandlers } from '@/components/ActivityCard';

export function HomePage() {
  const log = useActivityLog();

  // useCallback/useMemoで包まない: このhookはレンダーのたびに新しい関数を返す
  // (hooks/useActivityLog.tsx参照。React.memoされた子は無いので、参照の安定性は不要)。
  const handlers: ListHandlers = {
    onEdit: log.beginEdit,
    onCancel: log.cancelEdit,
    onSave: log.save,
    onDelete: log.remove,
    onInsert: log.beginInsert,
  };

  return (
    <>
      <AppHeader title="actlog" navTo="/dashboard" navLabel="集計" />
      <main>
        <CurrentStatus current={log.current} loaded={log.loaded} />
        <CategoryButtons activeCategory={log.current?.category ?? null} onSelect={log.select} />
        <p className="error-message" role="alert" hidden={!log.error}>
          {log.error ?? ''}
        </p>
        {/* 取得前は空の一覧ではなく影を出す。「進行中」と同じ判断(loaded)で切り替えるので、
            上下2箇所のスケルトンが同時に出て同時に消える。遅らせて点滅を防ぐ手もあるが、
            片方だけ遅らせると上下でタイミングがずれてかえって落ち着かない。 */}
        {log.loaded ? (
          <ActivityList
            activities={log.visibleActivities}
            editingId={log.editingId}
            draftId={log.draft ? DRAFT_ID : null}
            handlers={handlers}
          />
        ) : (
          <ActivityListSkeleton />
        )}
      </main>
    </>
  );
}
