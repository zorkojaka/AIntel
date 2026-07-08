import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@aintel/ui';
import { Eye, EyeOff, RefreshCw, Star } from 'lucide-react';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

// ECO-33: kuracija spletne izložbe. Isti izbor in vrstni red kot javni
// GET /api/public/products (getWebIzdelki): skupine kamere/ajax/blebox,
// kandidati = aktivni produkti s ceno > 0 in sliko; vrstni red
// vrstniRed → izpostavljen → prodane količine (salesStats) → cena.

type Merchandising = {
  published?: boolean;
  featured?: boolean;
  vrstniRed?: number;
  oznaka?: string;
};

type SalesStats = {
  soldQty?: number;
  soldQty365?: number;
  offersCount?: number;
  salesRank?: number;
  boughtWith?: Array<{ productId: string; ime: string; count: number }>;
};

type IzlozbaProduct = {
  _id: string;
  ime: string;
  prodajnaCena: number;
  kratekOpis?: string;
  povezavaDoSlike?: string;
  categorySlugs?: string[];
  classification?: { productType?: string };
  aaData?: { image?: string };
  isActive?: boolean;
  isService?: boolean;
  merchandising?: Merchandising;
  salesStats?: SalesStats;
};

const SKUPINE: Array<{ key: string; label: string; pripada: (p: IzlozbaProduct) => boolean }> = [
  { key: 'kamere', label: 'Kamere in videonadzor', pripada: (p) => p.classification?.productType === 'kamera' },
  { key: 'ajax', label: 'Ajax alarm', pripada: (p) => (p.categorySlugs ?? []).includes('ajax') },
  { key: 'blebox', label: 'Blebox pametni dom', pripada: (p) => (p.categorySlugs ?? []).includes('blebox') },
];

const WEB_LIMIT = 8;

function jeKandidat(p: IzlozbaProduct) {
  return (
    p.isActive !== false &&
    p.isService !== true &&
    (p.prodajnaCena ?? 0) > 0 &&
    Boolean(p.povezavaDoSlike || p.aaData?.image)
  );
}

function primerjajZaPrikaz(a: IzlozbaProduct, b: IzlozbaProduct) {
  const aOrder = a.merchandising?.vrstniRed;
  const bOrder = b.merchandising?.vrstniRed;
  if (typeof aOrder === 'number' || typeof bOrder === 'number') {
    if (typeof aOrder !== 'number') return 1;
    if (typeof bOrder !== 'number') return -1;
    if (aOrder !== bOrder) return aOrder - bOrder;
  }
  const featured = Number(Boolean(b.merchandising?.featured)) - Number(Boolean(a.merchandising?.featured));
  if (featured !== 0) return featured;
  const sold = (b.salesStats?.soldQty ?? 0) - (a.salesStats?.soldQty ?? 0);
  if (sold !== 0) return sold;
  return (b.prodajnaCena ?? 0) - (a.prodajnaCena ?? 0);
}

export function IzlozbaPanel() {
  const [products, setProducts] = useState<IzlozbaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const nalozi = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cenik/products');
      const data = await parseApiEnvelope<IzlozbaProduct[]>(response, 'Napaka pri nalaganju cenika');
      setProducts(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri nalaganju');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void nalozi();
  }, []);

  const shraniMerchandising = async (productId: string, sprememba: Partial<Merchandising> & { vrstniRed?: number | null }) => {
    setSavingId(productId);
    const prejsnje = products;
    setProducts((current) =>
      current.map((p) =>
        p._id === productId
          ? {
              ...p,
              merchandising: {
                ...p.merchandising,
                ...Object.fromEntries(Object.entries(sprememba).map(([k, v]) => [k, v === null ? undefined : v])),
              },
            }
          : p,
      ),
    );
    try {
      const response = await fetch(`/api/cenik/products/${productId}/merchandising`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sprememba),
      });
      await parseApiEnvelope(response, 'Shranjevanje ni uspelo');
    } catch (err) {
      setProducts(prejsnje);
      setError(err instanceof Error ? err.message : 'Shranjevanje ni uspelo');
    } finally {
      setSavingId(null);
    }
  };

  const skupine = useMemo(() => {
    const iskanje = search.trim().toLowerCase();
    return SKUPINE.map((skupina) => {
      const kandidati = products
        .filter((p) => skupina.pripada(p) && jeKandidat(p))
        .filter((p) => !iskanje || p.ime.toLowerCase().includes(iskanje))
        .sort(primerjajZaPrikaz);
      return { ...skupina, kandidati };
    });
  }, [products, search]);

  if (loading) {
    return <div className="rounded-xl border border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">Nalagam izložbo …</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Spletna izložba</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Kaj in v kakšnem vrstnem redu kaže stran (/izdelki in konfigurator). Privzeti vrstni red = največ prodajano
              (iz sprejetih ponudb); z »Vrstni red« ali »Izpostavljen« ga povoziš. Prvih {WEB_LIMIT} gre na stran.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Išči po imenu …"
              className="h-9 rounded-md border border-border/60 bg-background px-3 text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => void nalozi()}>
              <RefreshCw className="mr-1 h-4 w-4" /> Osveži
            </Button>
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      {skupine.map((skupina) => (
        <div key={skupina.key} className="rounded-xl border border-border/60">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
            <div className="text-sm font-semibold text-foreground">{skupina.label}</div>
            <div className="text-xs text-muted-foreground">
              {skupina.kandidati.filter((p) => p.merchandising?.published !== false).length} objavljenih od {skupina.kandidati.length} kandidatov
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {skupina.kandidati.length === 0 ? (
              <div className="px-4 py-4 text-sm text-muted-foreground">Ni kandidatov (aktiven + cena &gt; 0 + slika).</div>
            ) : null}
            {skupina.kandidati.map((p, index) => {
              const m = p.merchandising ?? {};
              const objavljen = m.published !== false;
              const naStrani = objavljen && skupina.kandidati.filter((x) => x.merchandising?.published !== false).indexOf(p) < WEB_LIMIT;
              const soldQty = p.salesStats?.soldQty ?? 0;
              const boughtWith = (p.salesStats?.boughtWith ?? []).slice(0, 3);
              return (
                <div key={p._id} className={`flex flex-wrap items-center gap-3 px-4 py-2 ${objavljen ? '' : 'opacity-50'}`}>
                  <div className="w-8 text-right text-xs text-muted-foreground">{index + 1}.</div>
                  <div className="min-w-[220px] flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {p.ime}
                      {naStrani ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">na strani</span>
                      ) : null}
                      {m.oznaka ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{m.oznaka}</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.prodajnaCena.toFixed(2)} € brez DDV
                      {soldQty > 0 ? ` · prodano ${soldQty} kos (${p.salesStats?.offersCount ?? 0} ponudb)` : ' · še brez prodaje'}
                      {boughtWith.length > 0 ? ` · kupljeno skupaj z: ${boughtWith.map((b) => b.ime).join(', ')}` : ''}
                    </div>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Vrstni red (prazno = samodejno po prodaji)">
                    Vrstni red
                    <input
                      type="number"
                      className="h-8 w-16 rounded-md border border-border/60 bg-background px-2 text-sm"
                      value={typeof m.vrstniRed === 'number' ? m.vrstniRed : ''}
                      placeholder="auto"
                      disabled={savingId === p._id}
                      onChange={(event) => {
                        const raw = event.target.value;
                        void shraniMerchandising(p._id, { vrstniRed: raw === '' ? null : Number(raw) });
                      }}
                    />
                  </label>
                  <input
                    type="text"
                    className="h-8 w-28 rounded-md border border-border/60 bg-background px-2 text-sm"
                    defaultValue={m.oznaka ?? ''}
                    placeholder="oznaka"
                    title="Oznaka na strani (npr. akcija, novo, priporočamo)"
                    disabled={savingId === p._id}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value !== (m.oznaka ?? '')) void shraniMerchandising(p._id, { oznaka: value });
                    }}
                  />
                  <Button
                    variant={m.featured ? 'default' : 'outline'}
                    size="sm"
                    title="Izpostavljen — pred vsemi neizpostavljenimi"
                    disabled={savingId === p._id}
                    onClick={() => void shraniMerchandising(p._id, { featured: !m.featured })}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    title={objavljen ? 'Objavljen na strani — klikni za skritje' : 'Skrit s strani — klikni za objavo'}
                    disabled={savingId === p._id}
                    onClick={() => void shraniMerchandising(p._id, { published: !objavljen })}
                  >
                    {objavljen ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
