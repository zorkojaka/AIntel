import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Card, ColorPicker, DataTable, FileUpload, Input, Textarea } from '@aintel/ui';
import { applySettingsTheme, DOCUMENT_PREFIX_LABELS, saveSettings } from './api';
import { useSettingsData } from './hooks/useSettings';
import { DocumentPrefixKey, SettingsDto } from './types';
import { RequirementTemplatesSection } from './RequirementTemplatesSection';

interface StatusBanner {
  variant: 'success' | 'error';
  text: string;
}

const prefixKeys: DocumentPrefixKey[] = ['offer', 'invoice', 'order', 'deliveryNote', 'workOrder'];

const dummyProject = {
  title: 'Pametna razsvetljava – ponudba',
  description: 'Zamenjava svetil in integracija pametnega krmiljenja.',
  items: [
    { name: 'LED panel 60x60', quantity: 12, price: 85 },
    { name: 'Montaža in konfiguracija', quantity: 8, price: 45 }
  ]
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Datoteke ni mogoče prebrati.'));
    reader.readAsDataURL(file);
  });
}

export const SettingsPage: React.FC = () => {
  const { settings, loading, error, refresh } = useSettingsData();
  const [form, setForm] = useState<SettingsDto>(settings);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const prefixTable = useMemo(
    () =>
      prefixKeys.map((key) => ({
        id: key,
        dokument: DOCUMENT_PREFIX_LABELS[key],
        prefix: form.documentPrefix[key]
      })),
    [form.documentPrefix]
  );

  const totalPreview = useMemo(
    () => dummyProject.items.reduce((sum, item) => sum + item.quantity * item.price, 0),
    []
  );

  const handleFieldChange = (field: keyof Omit<SettingsDto, 'documentPrefix'>, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePrefixChange = (key: DocumentPrefixKey, value: string) => {
    setForm((prev) => ({
      ...prev,
      documentPrefix: {
        ...prev.documentPrefix,
        [key]: value
      }
    }));
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) {
      setForm((prev) => ({ ...prev, logoUrl: '' }));
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((prev) => ({ ...prev, logoUrl: dataUrl }));
    } catch (uploadError) {
      setStatus({ variant: 'error', text: uploadError instanceof Error ? uploadError.message : 'Napaka pri nalaganju logotipa.' });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.companyName.trim() || !form.address.trim()) {
      setStatus({ variant: 'error', text: 'Naziv podjetja in naslov sta obvezna.' });
      return;
    }

    setSaving(true);
    try {
      const updated = await saveSettings(form);
      applySettingsTheme(updated);
      setStatus({ variant: 'success', text: 'Nastavitve so uspešno shranjene.' });
      setForm(updated);
      await refresh();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Nastavitev ni mogoče shraniti.';
      setStatus({ variant: 'error', text: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Nastavitve</h1>
        <p className="text-muted-foreground">
          Centralno upravljanje poslovnih podatkov, barvne sheme in dokumentnih predlog za vse module AIntel.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-destructive px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {status && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            status.variant === 'success' ? 'border-success text-success' : 'border-destructive text-destructive'
          }`}
        >
          {status.text}
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">
          Nalagam nastavitve ...
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        <Card title="Osnovni podatki podjetja">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Naziv podjetja"
              value={form.companyName}
              onChange={(event) => handleFieldChange('companyName', event.target.value)}
              required
            />
            <Input
              label="Kontaktni email"
              type="email"
              value={form.email ?? ''}
              onChange={(event) => handleFieldChange('email', event.target.value)}
            />
            <Input
              label="Telefonska številka"
              value={form.phone ?? ''}
              onChange={(event) => handleFieldChange('phone', event.target.value)}
            />
            <Textarea
              label="Naslov"
              value={form.address}
              onChange={(event) => handleFieldChange('address', event.target.value)}
              rows={3}
            />
          </div>
        </Card>

        <Card title="Logotip in znamčenje">
          <div className="space-y-4">
            <FileUpload label="Naloži logotip" accept="image/*" onFileSelect={handleLogoUpload} />
            {form.logoUrl ? (
              <div className="flex items-center gap-4">
                <img
                  src={form.logoUrl}
                  alt="Logotip podjetja"
                  className="h-16 w-16 rounded-md border border-border bg-white object-contain"
                />
                <Button type="button" variant="ghost" onClick={() => handleFieldChange('logoUrl', '')}>
                  Odstrani logotip
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Logotip še ni nastavljen.</p>
            )}
          </div>
        </Card>

        <Card title="Barve in plačilni pogoji">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <ColorPicker
                label="Primarna barva"
                value={form.primaryColor ?? '#0f62fe'}
                onChange={(event) => handleFieldChange('primaryColor', event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Primarna barva se uporablja v navigaciji, gumbih in PDF predlogah.
              </p>
            </div>
            <Textarea
              label="Privzeti plačilni pogoji"
              value={form.defaultPaymentTerms ?? ''}
              onChange={(event) => handleFieldChange('defaultPaymentTerms', event.target.value)}
              rows={4}
            />
          </div>
        </Card>

        <Card title="Prefixi dokumentov">
          <div className="grid gap-4 md:grid-cols-2">
            {prefixKeys.map((key) => (
              <Input
                key={key}
                label={`${DOCUMENT_PREFIX_LABELS[key]} prefix`}
                value={form.documentPrefix[key]}
                onChange={(event) => handlePrefixChange(key, event.target.value)}
              />
            ))}
          </div>
          <div className="mt-4">
            <DataTable
              columns={[
                { header: 'Dokument', accessor: 'dokument' },
                { header: 'Prefix', accessor: 'prefix' }
              ]}
              data={prefixTable}
            />
          </div>
        </Card>

        <Card title="Izjava in opombe">
          <Textarea
            label="Omejitve odgovornosti"
            value={form.disclaimer ?? ''}
            onChange={(event) => handleFieldChange('disclaimer', event.target.value)}
            rows={5}
          />
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving || loading}>
            {saving ? 'Shranjujem ...' : 'Shrani nastavitve'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPreviewVisible((prev) => !prev)}>
            {previewVisible ? 'Skrij PDF predogled' : 'Predogled PDF'}
          </Button>
        </div>
      </form>

      {previewVisible && (
        <Card title="PDF predogled">
          <div className="space-y-4 rounded-md border border-border bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: form.primaryColor }}>
                  {form.companyName}
                </h2>
                <p className="text-sm text-muted-foreground">{form.address}</p>
                {(form.email || form.phone) && (
                  <p className="text-sm text-muted-foreground">
                    {[form.email, form.phone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="Logotip v predogledu"
                  className="h-16 w-16 rounded-md border border-border object-contain"
                />
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{`${form.documentPrefix.offer}2025-001`}</h3>
              <p className="text-sm text-muted-foreground">{dummyProject.title}</p>
              <p className="text-sm">{dummyProject.description}</p>
            </div>

            <table className="w-full table-auto border-collapse text-sm">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="border border-border px-3 py-2">Postavka</th>
                  <th className="border border-border px-3 py-2">Količina</th>
                  <th className="border border-border px-3 py-2">Cena</th>
                </tr>
              </thead>
              <tbody>
                {dummyProject.items.map((item) => (
                  <tr key={item.name}>
                    <td className="border border-border px-3 py-2">{item.name}</td>
                    <td className="border border-border px-3 py-2">{item.quantity}</td>
                    <td className="border border-border px-3 py-2">
                      {new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(
                        item.price
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="border border-border px-3 py-2 text-right font-semibold" colSpan={2}>
                    Skupaj
                  </td>
                  <td className="border border-border px-3 py-2 font-semibold">
                    {new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(totalPreview)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {form.disclaimer && (
              <p className="text-xs text-muted-foreground">{form.disclaimer}</p>
            )}
          </div>
        </Card>
      )}

      <RequirementTemplatesSection />
    </section>
  );
};
