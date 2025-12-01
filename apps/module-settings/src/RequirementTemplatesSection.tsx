import { useEffect, useMemo, useState } from 'react';
import type {
  RequirementFieldType,
  RequirementTemplateGroup,
  RequirementTemplateRow,
} from '@aintel/shared/types/project';
import { Button, Card, Input, Textarea } from '@aintel/ui';
import {
  createRequirementTemplateGroup,
  deleteRequirementTemplateGroup,
  fetchRequirementTemplates,
  updateRequirementTemplateGroup,
} from './api';

type CategoryOption = { id: string; name: string; slug: string; color?: string };

type EditableRow = RequirementTemplateRow & { optionsText?: string };
type EditableGroup = RequirementTemplateGroup & { rows: EditableRow[] };

const fieldTypeOptions: RequirementFieldType[] = ['number', 'text', 'select', 'boolean'];

function normalizeOptions(value: string): string[] | undefined {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

async function fetchCategories(): Promise<CategoryOption[]> {
  const response = await fetch('/api/categories');
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.error ?? 'Napaka pri nalaganju kategorij.');
  }
  return (payload.data ?? []).map((cat: any) => ({
    id: cat.id ?? cat._id ?? cat.slug,
    name: cat.name ?? cat.slug ?? 'Neimenovana kategorija',
    slug: cat.slug ?? cat.id ?? '',
    color: cat.color,
  }));
}

export function RequirementTemplatesSection() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'sl', { sensitivity: 'base' })),
    [categories]
  );

  useEffect(() => {
    fetchCategories()
      .then((cats) => setCategories(cats))
      .catch((err) => setError(err instanceof Error ? err.message : 'Napaka pri kategorijah.'));
  }, []);

  const loadTemplates = async (categorySlug?: string) => {
    setLoading(true);
    try {
      const data = await fetchRequirementTemplates(categorySlug);
      setGroups(
        data.map((group) => ({
          ...group,
          variantSlug: group.variantSlug ?? 'default',
          rows: (group.rows ?? []).map((row) => ({
            ...row,
            optionsText: row.options?.join(', ') ?? '',
          })),
        }))
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju template-ov.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates(selectedCategory || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  const ensureCategory = (current?: string) => {
    if (current) return current;
    if (selectedCategory) return selectedCategory;
    return sortedCategories[0]?.slug ?? '';
  };

  const handleAddGroup = () => {
    const categorySlug = ensureCategory('');
    const tempId = `temp-${Date.now()}`;
    setGroups((prev) => [
      ...prev,
      { id: tempId, label: 'Nova skupina', categorySlug, variantSlug: 'default', rows: [] },
    ]);
  };

  const handleGroupChange = (groupId: string, patch: Partial<EditableGroup>) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  };

  const handleAddRow = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              rows: [
                ...(g.rows ?? []),
                {
                  id: `rtrow-${Date.now()}`,
                  label: '',
                  fieldType: 'text',
                  options: [],
                  optionsText: '',
                },
              ],
            }
          : g
      )
    );
  };

  const handleRowChange = (groupId: string, rowId: string, patch: Partial<EditableRow>) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              rows: g.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
            }
          : g
      )
    );
  };

  const handleDeleteRow = (groupId: string, rowId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              rows: g.rows.filter((row) => row.id !== rowId),
            }
          : g
      )
    );
  };

  const persistGroup = async (group: EditableGroup) => {
    const payload: Omit<RequirementTemplateGroup, 'id'> = {
      label: group.label.trim(),
      categorySlug: ensureCategory(group.categorySlug),
      variantSlug: group.variantSlug || 'default',
      rows: (group.rows ?? []).map((row) => ({
        id: row.id,
        label: row.label.trim(),
        fieldType: row.fieldType ?? 'text',
        options: normalizeOptions(row.optionsText ?? '') ?? row.options,
        defaultValue: row.defaultValue,
        helpText: row.helpText,
        productCategorySlug: row.productCategorySlug ?? undefined,
        formulaConfig: row.formulaConfig
          ? {
              baseFieldId: row.formulaConfig.baseFieldId,
              multiplyBy:
                row.formulaConfig.multiplyBy === undefined
                  ? undefined
                  : Number(row.formulaConfig.multiplyBy),
              notes: row.formulaConfig.notes,
            }
          : null,
      })),
    };

    setSavingId(group.id);
    try {
      const saved =
        group.id.startsWith('temp-')
          ? await createRequirementTemplateGroup(payload)
          : await updateRequirementTemplateGroup(group.id, payload);

      setGroups((prev) =>
        prev.map((g) =>
          g.id === group.id
            ? {
                ...saved,
                rows: (saved.rows ?? []).map((row) => ({
                  ...row,
                  optionsText: row.options?.join(', ') ?? '',
                })),
              }
            : g
        )
      );
      setError(null);
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : 'Napaka pri shranjevanju template-a.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (groupId.startsWith('temp-')) {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      return;
    }
    setSavingId(groupId);
    try {
      await deleteRequirementTemplateGroup(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Napaka pri brisanju template-a.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card title="Zahtevni template-i">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm font-medium text-foreground">
          Kategorija
          <select
            className="ml-2 rounded border border-border px-2 py-1 text-sm bg-white"
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
          >
            <option value="">Vse kategorije</option>
            {sortedCategories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={handleAddGroup} variant="outline">
          Dodaj skupino
        </Button>
        {loading && <span className="text-sm text-muted-foreground">Nalagam template-e ...</span>}
      </div>

      {error && <div className="mb-3 text-sm text-destructive">{error}</div>}

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={(group as any)._id ?? group.id} className="rounded border border-border p-4 space-y-3 bg-white">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Naziv skupine"
                value={group.label}
                onChange={(event) => handleGroupChange(group.id, { label: event.target.value })}
              />
              <label className="text-sm font-medium text-foreground">
                Kategorija
                <select
                  className="mt-1 w-full rounded border border-border px-2 py-2 text-sm"
                  value={group.categorySlug}
                  onChange={(event) => handleGroupChange(group.id, { categorySlug: event.target.value })}
                >
                  {sortedCategories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Varianta"
                value={group.variantSlug}
                onChange={(event) => handleGroupChange(group.id, { variantSlug: event.target.value })}
                placeholder="npr. default"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Naziv</th>
                    <th className="px-3 py-2 text-left">Tip</th>
                    <th className="px-3 py-2 text-left">Možnosti (CSV)</th>
                    <th className="px-3 py-2 text-left">Privzeta vrednost</th>
                    <th className="px-3 py-2 text-left">Pomoč / Opis</th>
                    <th className="px-3 py-2 text-left">Kategorija produkta</th>
                    <th className="px-3 py-2 text-left">Formula (osnova)</th>
                    <th className="px-3 py-2 text-left">Množilnik</th>
                    <th className="px-3 py-2 text-left">Opombe formule</th>
                    <th className="px-3 py-2 text-right">Akcije</th>
                  </tr>
                </thead>
                <tbody>
                  {(group.rows ?? []).map((row) => (
                    <tr key={row._id ?? row.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Input
                          value={row.label}
                          onChange={(event) =>
                            handleRowChange(group.id, row.id, { label: event.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded border border-border px-2 py-2 text-sm"
                          value={row.fieldType}
                          onChange={(event) =>
                            handleRowChange(group.id, row.id, {
                              fieldType: event.target.value as RequirementFieldType,
                            })
                          }
                        >
                          {fieldTypeOptions.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.optionsText ?? ''}
                          onChange={(event) => {
                            const optionsText = event.target.value;
                            handleRowChange(group.id, row.id, {
                              optionsText,
                              options: normalizeOptions(optionsText),
                            });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.defaultValue ?? ''}
                          onChange={(event) =>
                            handleRowChange(group.id, row.id, { defaultValue: event.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Textarea
                          value={row.helpText ?? ''}
                          onChange={(event) =>
                            handleRowChange(group.id, row.id, { helpText: event.target.value })
                          }
                          rows={2}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.productCategorySlug ?? ''}
                          onChange={(event) =>
                            handleRowChange(group.id, row.id, {
                              productCategorySlug: event.target.value,
                            })
                          }
                          placeholder="npr. dvc"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.formulaConfig?.baseFieldId ?? ''}
                          onChange={(event) =>
                            handleRowChange(group.id, row.id, {
                              formulaConfig: {
                                ...row.formulaConfig,
                                baseFieldId: event.target.value,
                              },
                            })
                          }
                          placeholder="ID vrstice"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          value={row.formulaConfig?.multiplyBy ?? ''}
                          onChange={(event) =>
                            handleRowChange(group.id, row.id, {
                              formulaConfig: {
                                ...row.formulaConfig,
                                baseFieldId: row.formulaConfig?.baseFieldId ?? '',
                                multiplyBy: Number(event.target.value),
                                notes: row.formulaConfig?.notes,
                              },
                            })
                          }
                          placeholder="1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.formulaConfig?.notes ?? ''}
                          onChange={(event) =>
                            handleRowChange(group.id, row.id, {
                              formulaConfig: {
                                ...row.formulaConfig,
                                baseFieldId: row.formulaConfig?.baseFieldId ?? '',
                                notes: event.target.value,
                                multiplyBy: row.formulaConfig?.multiplyBy,
                              },
                            })
                          }
                          placeholder="Opomba"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleDeleteRow(group.id, row.id)}
                        >
                          Izbriši
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => handleAddRow(group.id)}>
                Dodaj vrstico
              </Button>
              <Button
                type="button"
                onClick={() => persistGroup(group)}
                disabled={savingId === group.id}
              >
                {savingId === group.id ? 'Shranjujem ...' : 'Shrani skupino'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleDeleteGroup(group.id)}
                disabled={savingId === group.id}
              >
                Izbriši skupino
              </Button>
            </div>
          </div>
        ))}

        {!loading && groups.length === 0 && (
          <div className="text-sm text-muted-foreground">Ni nastavljenih template-ov za izbrano kategorijo.</div>
        )}
      </div>
    </Card>
  );
}
