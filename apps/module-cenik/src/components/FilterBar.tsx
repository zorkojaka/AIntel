import { useEffect, useState } from 'react';

type CategoryOption = {
  slug: string;
  name: string;
};

type FilterValue = { q: string; category: string | null };

type Props = {
  categories: CategoryOption[];
  value?: FilterValue;
  onChange: (v: FilterValue) => void;
  onAddProduct: () => void;
  addLabel?: string;
  className?: string;
};

export default function FilterBar({
  categories,
  value = { q: '', category: null },
  onChange,
  onAddProduct,
  addLabel = '+ Dodaj produkt',
  className = '',
}: Props) {
  const [q, setQ] = useState(value.q ?? '');
  const [cat, setCat] = useState<string | null>(value.category ?? null);

  const debouncedQ = useDebounce(q, 250);
  useEffect(() => {
    onChange({ q: debouncedQ.trim(), category: cat });
  }, [debouncedQ, cat, onChange]);

  function reset() {
    setQ('');
    setCat(null);
    onChange({ q: '', category: null });
  }

  return (
    <div
      className={`flex w-full flex-wrap items-center gap-2 rounded-xl bg-white/60 p-2 ${className}`}
      role="search"
      aria-label="Iskanje in filtriranje"
    >
      <div className="relative min-w-[200px] flex-[1_1_100%] md:flex-1">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') reset();
          }}
          placeholder="Išči po imenu…"
          className="w-full rounded-lg border px-3 py-2 pr-9 outline-none focus:ring"
          aria-label="Išči po imenu"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60">⌕</span>
      </div>

      <select
        value={cat ?? ''}
        onChange={(e) => setCat(e.target.value || null)}
        className="min-w-[180px] flex-1 rounded-lg border px-3 py-2 outline-none focus:ring md:w-48 md:flex-none"
        aria-label="Kategorija"
        title="Kategorija"
      >
        <option value="">Vse kategorije</option>
        {categories.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={reset}
        disabled={!q && !cat}
        className="rounded-lg border px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
        aria-label="Ponastavi filtre"
        title="Ponastavi filtre"
      >
        Reset
      </button>

      <button
        type="button"
        onClick={onAddProduct}
        className="w-full rounded-xl px-4 py-2 font-medium text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 filter-add-button md:w-auto"
      >
        {addLabel}
      </button>
    </div>
  );
}

function useDebounce<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setV(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return v;
}
