import { useEffect, useState } from 'react';
import type { OfferGenerationRule } from '@aintel/shared/types/project';
import { Button, Card, Input } from '@aintel/ui';
import {
  fetchOfferRules,
  createOfferRule,
  updateOfferRule,
  deleteOfferRule,
} from './api';

type EditableRule = OfferGenerationRule;

export function OfferRulesSection() {
  const [rules, setRules] = useState<EditableRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await fetchOfferRules();
      setRules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri nalaganju pravil.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleAddRule = () => {
    setRules((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        label: 'Novo pravilo',
        categorySlug: '',
        variantSlug: '',
        targetProductCategorySlug: '',
        conditionExpression: '',
        quantityExpression: '1',
        productSelectionMode: 'auto-first',
      },
    ]);
  };

  const handleChange = (id: string, patch: Partial<EditableRule>) => {
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const persistRule = async (rule: EditableRule) => {
    const payload: Omit<OfferGenerationRule, 'id'> = {
      label: rule.label.trim(),
      categorySlug: rule.categorySlug.trim(),
      variantSlug: rule.variantSlug.trim(),
      targetProductCategorySlug: rule.targetProductCategorySlug.trim(),
      conditionExpression: rule.conditionExpression?.toString().trim() || undefined,
      quantityExpression: rule.quantityExpression.trim() || '1',
      productSelectionMode: rule.productSelectionMode ?? 'auto-first',
    };

    if (!payload.label || !payload.categorySlug || !payload.variantSlug || !payload.targetProductCategorySlug) {
      setError('Izpolni vsa obvezna polja.');
      return;
    }

    setSavingId(rule.id);
    try {
      const saved =
        rule.id.startsWith('temp-')
          ? await createOfferRule(payload)
          : await updateOfferRule(rule.id, payload);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? saved : r)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri shranjevanju pravila.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('temp-')) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    setSavingId(id);
    try {
      await deleteOfferRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri brisanju pravila.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card title="Pravila za generiranje ponudbe">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Nastavi pravila za generiranje predlog postavk iz zahtev.
          </p>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <Button variant="outline" onClick={handleAddRule} disabled={loading}>
          Dodaj pravilo
        </Button>
      </div>
      {loading && <div className="text-sm text-muted-foreground">Nalagam pravila ...</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-left">Naziv</th>
              <th className="px-3 py-2 text-left">Kategorija</th>
              <th className="px-3 py-2 text-left">Varianta</th>
              <th className="px-3 py-2 text-left">Produkt kategorija</th>
              <th className="px-3 py-2 text-left">Pogoj</th>
              <th className="px-3 py-2 text-left">Količina</th>
              <th className="px-3 py-2 text-left">Način</th>
              <th className="px-3 py-2 text-right">Akcije</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <Input
                    value={rule.label}
                    onChange={(e) => handleChange(rule.id, { label: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={rule.categorySlug}
                    onChange={(e) => handleChange(rule.id, { categorySlug: e.target.value })}
                    placeholder="slug"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={rule.variantSlug}
                    onChange={(e) => handleChange(rule.id, { variantSlug: e.target.value })}
                    placeholder="varianta"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={rule.targetProductCategorySlug}
                    onChange={(e) =>
                      handleChange(rule.id, { targetProductCategorySlug: e.target.value })
                    }
                    placeholder="kategorija produkta"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={rule.conditionExpression ?? ''}
                    onChange={(e) => handleChange(rule.id, { conditionExpression: e.target.value })}
                    placeholder="npr. values.numCameras > 0"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={rule.quantityExpression}
                    onChange={(e) => handleChange(rule.id, { quantityExpression: e.target.value })}
                    placeholder="npr. values.numCameras"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    className="w-full rounded border border-border px-2 py-2 text-sm"
                    value={rule.productSelectionMode}
                    onChange={(event) =>
                      handleChange(rule.id, {
                        productSelectionMode: event.target.value as OfferGenerationRule['productSelectionMode'],
                      })
                    }
                  >
                    <option value="auto-first">auto-first</option>
                    <option value="manual">manual</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => persistRule(rule)} disabled={savingId === rule.id}>
                    Shrani
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)} disabled={savingId === rule.id}>
                    Izbriši
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
