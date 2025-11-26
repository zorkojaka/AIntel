import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, DataTable, Input, CategoryMultiSelect, TableRowActions } from '@aintel/ui';
import { Save, X } from 'lucide-react';
import FilterBar from './components/FilterBar';

type Product = {
  _id?: string;
  ime: string;
  nabavnaCena: number;
  prodajnaCena: number;
  kratekOpis: string;
  dolgOpis: string;
  povezavaDoSlike: string;
  proizvajalec: string;
  dobavitelj: string;
  povezavaDoProdukta: string;
  naslovDobavitelja: string;
  casovnaNorma: string;
  categorySlugs?: string[];
  isService?: boolean;
};

type StatusBanner = {
  variant: 'success' | 'error';
  text: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: string | null;
};

type Category = {
  _id: string;
  name: string;
  slug: string;
  color?: string;
  order?: number;
};

const emptyProduct = (): Product => ({
  ime: '',
  nabavnaCena: 0,
  prodajnaCena: 0,
  kratekOpis: '',
  dolgOpis: '',
  povezavaDoSlike: '',
  proizvajalec: '',
  dobavitelj: '',
  povezavaDoProdukta: '',
  naslovDobavitelja: '',
  casovnaNorma: '',
  categorySlugs: [],
  isService: false
});

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value);

const MAX_VISIBLE_CATEGORY_CHIPS = 10;

type CategoryChipRowProps = {
  slugs: string[];
  lookup: Map<string, Category>;
};

function CategoryChipRow({ slugs, lookup }: CategoryChipRowProps) {
  const [showAll, setShowAll] = useState(false);
  const visibleSlugs = showAll ? slugs : slugs.slice(0, MAX_VISIBLE_CATEGORY_CHIPS);
  const hiddenCount = slugs.length - visibleSlugs.length;

  if (slugs.length === 0) {
    return <span className="text-xs text-muted-foreground">Brez kategorij</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibleSlugs.map((slug) => (
        <span
          key={slug}
          className="rounded-full border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
        >
          {lookup.get(slug)?.name ?? slug}
        </span>
      ))}
      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          className="text-xs font-medium text-primary underline"
          onClick={() => setShowAll(true)}
        >
          +{hiddenCount} več
        </button>
      )}
    </div>
  );
}

async function parseEnvelope<T>(response: Response) {
  const payload: ApiEnvelope<T> = await response.json();
  if (!payload.success) {
    throw new Error(payload.error ?? 'Napaka pri komunikaciji s strežnikom.');
  }
  return payload.data;
}

export const CenikPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<{ q: string; category: string | null }>({ q: '', category: null });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cenik/products');
      const data = await parseEnvelope<Product[]>(response);
      setProducts(
        data.map((product) => ({
          ...product,
          categorySlugs: product.categorySlugs ?? [],
          isService: product.isService ?? false
        }))
      );
      setStatus(null);
    } catch (error) {
      setStatus({ variant: 'error', text: 'Ne morem naložiti cenika. Poskusi znova.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories');
        const data = await parseEnvelope<Category[]>(response);
        setCategories(data);
      } catch (error) {
        console.error('Ne morem naložiti kategorij.', error);
      }
    };

    fetchCategories();
  }, []);



  const categoryLookup = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => map.set(category.slug, category));
    return map;
  }, [categories]);



  const filteredProducts = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = filters.category
        ? (product.categorySlugs ?? []).includes(filters.category)
        : true;
      const matchesSearch = query ? product.ime.toLowerCase().includes(query) : true;
      return matchesCategory && matchesSearch;
    });
  }, [products, filters]);

  const startEdit = (product?: Product) => {
    setEditingProduct(
      product
        ? {
            ...product,
            categorySlugs: product.categorySlugs ?? [],
            isService: product.isService ?? false
          }
        : emptyProduct()
    );
    setIsModalOpen(true);
  };

  const handleDelete = async (productId: string | undefined) => {
    if (!productId) return;
    setDeletingId(productId);
    try {
      const response = await fetch(`/api/cenik/products/${productId}`, { method: 'DELETE' });
      await parseEnvelope<{ message: string }>(response);
      setProducts((prev) => prev.filter((product) => product._id !== productId));
      setStatus({ variant: 'success', text: 'Produkt je bil izbrisan.' });
      if (editingProduct?._id === productId) {
        setEditingProduct(null);
      }
    } catch (error) {
      setStatus({ variant: 'error', text: 'Ne morem izbrisati produkta.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProduct) {
      return;
    }
    if (!editingProduct.ime) {
      setStatus({ variant: 'error', text: 'Ime je obvezno.' });
      return;
    }

    setSaving(true);
    const { _id, ...rest } = editingProduct;
    const payload = {
      ...rest,
      categorySlugs: editingProduct.categorySlugs ?? []
    } as Omit<Product, '_id'>;
    const method = editingProduct._id ? 'PUT' : 'POST';
    const url = editingProduct._id
      ? `/api/cenik/products/${editingProduct._id}`
      : '/api/cenik/products';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await parseEnvelope<Product>(response);
      setProducts((prev) => {
        if (editingProduct._id) {
          return prev.map((product) => (product._id === data._id ? data : product));
        }
        return [data, ...prev];
      });
      setStatus({
        variant: 'success',
        text: editingProduct._id ? 'Produkt posodobljen.' : 'Produkt dodan.'
      });
      setEditingProduct(null);
      setIsModalOpen(false);
    } catch (error) {
      setStatus({
        variant: 'error',
        text: 'Napaka pri shranjevanju produkta. Preveri podatke in poskusi znova.'
      });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof Product, value: string | number) => {
    setEditingProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  return (
    <section className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Cenik</h1>
      </header>

      {status && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            status.variant === 'success' ? 'border-success text-success' : 'border-destructive text-destructive'
          }`}
        >
          {status.text}
        </div>
      )}


      <Card title="Iskanje in filtriranje">
        <FilterBar
          categories={categories}
          value={{ q: filters.q, category: filters.category }}
          onChange={setFilters}
          onAddProduct={() => startEdit()}
        />
      </Card>
      <Card title="Seznam produktov">
        {loading ? (
          <p className="text-sm text-muted-foreground">Nalaganje cenika …</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <DataTable
                columns={[
                  { header: 'Ime', accessor: 'ime' },
                  {
                    header: 'Kategorije',
                    accessor: (row: Product) => (
                      <CategoryChipRow slugs={row.categorySlugs ?? []} lookup={categoryLookup} />
                    )
                  },
                  {
                    header: 'Prodajna cena',
                    accessor: (row: Product) => formatCurrency(row.prodajnaCena)
                  },
                  { header: 'Proizvajalec', accessor: 'proizvajalec' },
                  { header: 'Opis', accessor: 'kratekOpis' },
                  {
                    header: 'Akcije',
                    accessor: (row: Product) => (
                      <div className="flex justify-end">
                        <TableRowActions
                          onEdit={() => startEdit(row)}
                          onDelete={() => handleDelete(row._id)}
                          deleteConfirmTitle="Izbriši produkt"
                          deleteConfirmMessage="Si prepričan, da želiš izbrisati ta produkt?"
                        />
                      </div>
                    )
                  }
                ]}
                data={filteredProducts}
              />
            </div>
            {filteredProducts.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">Ni najdenih produktov.</p>
            )}
          </div>
        )}
      </Card>

      {isModalOpen && editingProduct && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-3xl rounded-xl bg-card p-6 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-foreground">
                {editingProduct._id ? 'Uredi produkt' : 'Dodaj produkt'}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Shrani"
                  onClick={() => formRef.current?.requestSubmit()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Zapri"
                  onClick={handleCancel}
                  className="inline-flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <form ref={formRef} className="space-y-4 mt-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Ime"
                  placeholder="Naziv produkta"
                  value={editingProduct.ime}
                  onChange={(event) => updateField('ime', event.target.value)}
                  required
                />
                <div className="col-span-1 md:col-span-2 flex items-center gap-3">
                  <input
                    id="is-service"
                    type="checkbox"
                    checked={Boolean(editingProduct.isService)}
                    onChange={(event) =>
                      setEditingProduct((prev) => (prev ? { ...prev, isService: event.target.checked } : prev))
                    }
                    className="h-4 w-4 rounded border border-border bg-card focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <label htmlFor="is-service" className="text-sm font-medium text-foreground">
                    Storitev
                  </label>
                </div>
                <div className="col-span-1 md:col-span-2">
                  <CategoryMultiSelect
                    label="Kategorije"
                    categories={categories}
                    value={editingProduct.categorySlugs ?? []}
                    onChange={(slugs) =>
                      setEditingProduct((prev) => (prev ? { ...prev, categorySlugs: slugs } : prev))
                    }
                  />
                </div>
                <Input
                  label="Nabavna cena"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingProduct.nabavnaCena}
                  onChange={(event) => updateField('nabavnaCena', Number(event.target.value))}
                />
                <Input
                  label="Prodajna cena"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingProduct.prodajnaCena}
                  onChange={(event) => updateField('prodajnaCena', Number(event.target.value))}
                />
                <Input
                  label="Proizvajalec"
                  placeholder="npr. BLEBOX"
                  value={editingProduct.proizvajalec}
                  onChange={(event) => updateField('proizvajalec', event.target.value)}
                />
                <Input
                  label="Dobavitelj"
                  placeholder="npr. Inteligent"
                  value={editingProduct.dobavitelj}
                  onChange={(event) => updateField('dobavitelj', event.target.value)}
                />
                <Input
                  label="Povezava do slike"
                  placeholder="https://..."
                  value={editingProduct.povezavaDoSlike}
                  onChange={(event) => updateField('povezavaDoSlike', event.target.value)}
                />
                <Input
                  label="Povezava do produkta"
                  placeholder="https://..."
                  value={editingProduct.povezavaDoProdukta}
                  onChange={(event) => updateField('povezavaDoProdukta', event.target.value)}
                />
                <Input
                  label="Naslov dobavitelja"
                  placeholder="naslov"
                  value={editingProduct.naslovDobavitelja}
                  onChange={(event) => updateField('naslovDobavitelja', event.target.value)}
                />
                <Input
                  label="Časovna norma"
                  placeholder="npr. 30 min"
                  value={editingProduct.casovnaNorma}
                  onChange={(event) => updateField('casovnaNorma', event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold">Kratek opis</label>
                <textarea
                  className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  rows={2}
                  value={editingProduct.kratekOpis}
                  onChange={(event) => updateField('kratekOpis', event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold">Dolg opis</label>
                <textarea
                  className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  rows={4}
                  value={editingProduct.dolgOpis}
                  onChange={(event) => updateField('dolgOpis', event.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={saving}>
                  Shrani
                </Button>
                <Button variant="ghost" type="button" onClick={handleCancel}>
                  Zapri
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
