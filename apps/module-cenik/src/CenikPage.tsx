import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Card, DataTable, Input } from '@aintel/ui';

type Product = {
  _id?: string;
  ime: string;
  kategorija: string;
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

const emptyProduct = (): Product => ({
  ime: '',
  kategorija: '',
  nabavnaCena: 0,
  prodajnaCena: 0,
  kratekOpis: '',
  dolgOpis: '',
  povezavaDoSlike: '',
  proizvajalec: '',
  dobavitelj: '',
  povezavaDoProdukta: '',
  naslovDobavitelja: '',
  casovnaNorma: ''
});

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value);

async function parseEnvelope<T>(response: Response) {
  const payload: ApiEnvelope<T> = await response.json();
  if (!payload.success) {
    throw new Error(payload.error ?? 'Napaka pri komunikaciji s strežnikom.');
  }
  return payload.data;
}

export const CenikPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusBanner | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cenik/products');
      const data = await parseEnvelope<Product[]>(response);
      setProducts(data);
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

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.kategorija))).filter(Boolean),
    [products]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = filterCategory ? product.kategorija === filterCategory : true;
      const matchesSearch = searchQuery
        ? product.ime.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      return matchesCategory && matchesSearch;
    });
  }, [products, filterCategory, searchQuery]);

  const startEdit = (product?: Product) => {
    setEditingProduct(product ? { ...product } : emptyProduct());
  };

  const handleDelete = async (productId: string | undefined) => {
    if (!productId) return;
    if (!globalThis.confirm('Ali želiš izbrisati ta produkt?')) return;
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
    if (!editingProduct.ime || !editingProduct.kategorija) {
      setStatus({ variant: 'error', text: 'Ime in kategorija sta obvezni.' });
      return;
    }

    setSaving(true);
    const draft: Product = { ...editingProduct };
    const method = editingProduct._id ? 'PUT' : 'POST';
    const url = editingProduct._id
      ? `/api/cenik/products/${editingProduct._id}`
      : '/api/cenik/products';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
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

  const handleCancel = () => setEditingProduct(null);

  return (
    <section className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Faza 3: Cenik produktov in storitev</p>
        <h1 className="text-3xl font-semibold text-foreground">Cenik</h1>
        <p className="text-sm text-muted-foreground">
          Preglej seznam produktov, filtriraj po kategoriji, dodaj nove izdelke ali posodobi obstoječe.
        </p>
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
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Išči po imenu..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <label className="flex flex-col text-xs text-muted-foreground">
            Kategorija
            <select
              className="mt-1 rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              value={filterCategory}
              onChange={(event) => setFilterCategory(event.target.value)}
            >
              <option value="">Vse kategorije</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto">
            <Button type="button" onClick={() => startEdit()}>
              + Dodaj produkt
            </Button>
          </div>
        </div>
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
                  { header: 'Kategorija', accessor: 'kategorija' },
                  {
                    header: 'Prodajna cena',
                    accessor: (row: Product) => formatCurrency(row.prodajnaCena)
                  },
                  { header: 'Proizvajalec', accessor: 'proizvajalec' },
                  { header: 'Opis', accessor: 'kratekOpis' },
                  {
                    header: 'Akcije',
                    accessor: (row: Product) => (
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => startEdit(row)}>
                          Uredi
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDelete(row._id)}
                          disabled={deletingId === row._id}
                        >
                          Izbriši
                        </Button>
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

      {editingProduct && (
        <Card title={editingProduct._id ? 'Uredi produkt' : 'Dodaj produkt'}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Ime"
                placeholder="Naziv produkta"
                value={editingProduct.ime}
                onChange={(event) => updateField('ime', event.target.value)}
                required
              />
              <Input
                label="Kategorija"
                placeholder="material / storitev"
                value={editingProduct.kategorija}
                onChange={(event) => updateField('kategorija', event.target.value)}
                required
              />
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
                Prekliči
              </Button>
            </div>
          </form>
        </Card>
      )}
    </section>
  );
};
