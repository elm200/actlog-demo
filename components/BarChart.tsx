import { formatMinutes } from '@/lib/time';

export type BarItem = {
  key: string;
  label: string;
  minutes: number;
  /**
   * 棒の色。**省略できない**。既定値を持たせると、色に意味を持たせないつもりの棒に
   * 意味のある色(--accent は「学習」と同じ値)が黙って入る事故が起きる。実際に起きた。
   */
  color: string;
  /** 値の右に添える補足(カテゴリー別の割合など) */
  note?: string;
};

/**
 * 横棒グラフ。ライブラリは入れず、divの幅だけで描く(依存関係を増やさない方針)。
 *
 * 名前と値は棒の**上に文字として**置いてある。棒に重ねると、値が短い棒からはみ出す・
 * 長い名前が切れるといった場所ごとの調整が要るうえ、狭い画面で必ず破綻する。
 * 上に出しておけば幅がいくらでも読めるし、色が分からなくても(色覚の差、印刷、
 * 読み上げ)名前と値が全部そろう。棒は大小を一目で比べるためだけの飾りなので
 * `aria-hidden`にしてある。
 *
 * 棒の長さは**その図の中の最大値**を基準にする。期間を7日と30日で切り替えると
 * 絶対値は数倍変わるが、割合の見え方は保たれる。
 */
export function BarChart({ items }: { items: BarItem[] }) {
  const max = Math.max(...items.map((item) => item.minutes), 1);

  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.key} className="bar">
          <div className="bar__head">
            <span className="bar__label">{item.label}</span>
            <span className="bar__value">
              {formatMinutes(item.minutes)}
              {item.note && <span className="bar__note">{item.note}</span>}
            </span>
          </div>
          <div className="bar__track" aria-hidden="true">
            {/* 0分の項目では棒を描かない(幅0の要素を置くと角丸だけが点として残る)。
                1分でも記録があれば min-width で必ず見える太さにする。 */}
            {item.minutes > 0 && (
              <div
                className="bar__fill"
                style={{ width: `${(item.minutes / max) * 100}%`, backgroundColor: item.color }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 読み込み中に本物の棒グラフの位置に置く影(skeleton)。
 *
 * 本物と**同じ骨組み**(`.bars` > `.bar` > `.bar__head` + `.bar__track`)で組んである。
 * 別の作りにすると行の高さがずれ、データが届いた瞬間に下の内容が飛ぶ。この2つが
 * 同じファイルにあるのは、片方だけ構造を変えたときに気づけるようにするため。
 *
 * `widths` は棒の基準の長さ(%)。集計は多い順に並ぶので、渡す側も**降順**にする
 * (ランダムな長さにすると、届いた本物と並びの印象が変わって画面が落ち着かない)。
 * 揺れ幅と速さはCSS(`.bar__fill--skeleton`)にあり、行ごとに位相をずらしている。
 */
export function BarChartSkeleton({ widths }: { widths: number[] }) {
  return (
    <ul className="bars" aria-hidden="true">
      {widths.map((width, index) => (
        <li key={index} className="bar">
          <div className="bar__head">
            <span className="skeleton-lines">
              <span className="skeleton skeleton--line" style={{ width: '4.5em' }} />
            </span>
            <span className="skeleton-lines">
              <span className="skeleton skeleton--line" style={{ width: '3em' }} />
            </span>
          </div>
          <div className="bar__track">
            <div
              className="skeleton bar__fill--skeleton"
              style={{ width: `${width}%`, animationDelay: `${index * -0.35}s` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
