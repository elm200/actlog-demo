import { CATEGORY_DEFS, type Category } from '@/lib/categories';

type Props = {
  activeCategory: Category | null;
  onSelect: (category: Category) => void;
};

/** カテゴリーボタン。進行中のカテゴリーだけをハイライトする。 */
export function CategoryButtons({ activeCategory, onSelect }: Props) {
  return (
    <section className="category-buttons" aria-label="カテゴリー">
      {CATEGORY_DEFS.map((c) => (
        <button
          key={c.id}
          type="button"
          className={'cat-btn' + (c.id === activeCategory ? ' cat-btn--active' : '')}
          style={{ '--cat-color': c.color }}
          onClick={() => onSelect(c.id)}
        >
          {c.label}
        </button>
      ))}
    </section>
  );
}
