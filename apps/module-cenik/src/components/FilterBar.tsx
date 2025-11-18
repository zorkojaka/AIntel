import { useEffect, useState } from 'react';

type FilterValue = { q: string; category: string | null };

type Props = {
  categories: string[];
  value?: FilterValue;
  onChange: (v: FilterValue) => void;
  onAddProduct: () => void;
  className?: string;
};

export default function FilterBar({
  categories,
  value = { q: '', category: null },
  onChange,
  onAddProduct,
  className = ''
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
  {/* Iskalnik */}
  <div className="relative flex-1 min-w-[200px]">
    <input
      type="search"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Escape') reset(); }}
      placeholder="Išči po imenu…"
      className="w-full rounded-lg border px-3 py-2 pr-9 outline-none focus:ring"
      aria-label="Išči po imenu"
    />
    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60">🔍</span>
  </div>

  {/* Kategorija */}
  <select
    value={cat ?? ''}
    onChange={(e) => setCat(e.target.value || null)}
    className="w-48 rounded-lg border px-3 py-2 outline-none focus:ring"
    aria-label="Kategorija"
    title="Kategorija"
  >
    <option value="">Vse kategorije</option>
    {categories.map((c) => (
      <option key={c} value={c}>{c}</option>
    ))}
  </select>

  {/* Reset */}
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

  {/* Dodaj produkt */}
  <button
    type="button"
    onClick={onAddProduct}
    className="rounded-xl px-4 py-2 font-medium text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 filter-add-button"
  >
    + Dodaj produkt
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
