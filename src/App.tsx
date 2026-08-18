import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { ActivityLogProvider } from '@/hooks/useActivityLog';
import { HomePage } from './HomePage';
import { DashboardPage } from './DashboardPage';

/**
 * 記録と集計を1つのHTMLに載せ、遷移をクライアント側で行う(SPA)。
 *
 * MPA(HTMLを画面ごとに分ける)でも体感はほぼ同じだったが、「ほとんど変わらないが確かに
 * 少し違う」という差が残ったので、Next.js版と同じ滑らかさを取りにいく構成にしている。
 *
 * `ActivityLogProvider`をここ(`<Outlet />`より上)に置くことで、`/`⇄`/dashboard`の
 * 行き来でアンマウントされず、状態(activities・裏検証)を共有し続ける。
 */
function Root() {
  return (
    <ActivityLogProvider>
      {/*
        SPAではスクロール位置の面倒をブラウザが見てくれなくなる。これが無いと、
        縦に長い記録画面の途中から集計に飛んだとき、集計がスクロールされた状態で開く。
        MPAではタダで正しかった挙動なので、消すと静かに劣化する。
      */}
      <ScrollRestoration />
      <Outlet />
      {/* データがこの端末の外に出ないことを、気にする人向けに一言だけ添えておく */}
      <footer className="app-footer">データはこの端末のブラウザ内にのみ保存されます。サーバーには送信されません。</footer>
    </ActivityLogProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/dashboard', element: <DashboardPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
