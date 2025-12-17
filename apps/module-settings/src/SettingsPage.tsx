import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Card, ColorPicker, FileUpload, Input } from '@aintel/ui';
import { applySettingsTheme, saveSettings } from './api';
import { DocumentPreview } from './components/DocumentPreview';
import { DocumentSettingsTab } from './components/DocumentSettingsTab';
import { OfferPreview } from './components/OfferPreview';
import { useSettingsData } from './hooks/useSettings';
import {
  DocumentTypeKey,
  NoteDto,
  SettingsDto,
  OfferPdfPreviewPayload,
} from './types';

interface StatusBanner {
  variant: 'success' | 'error';
  text: string;
}

type FormSaveScope = 'company' | 'documents';

type DocumentTabKey = DocumentTypeKey;

const documentTabs: { key: DocumentTabKey; label: string; implemented: boolean }[] = [
  { key: 'offer', label: 'Ponudba', implemented: true },
  { key: 'invoice', label: 'Račun', implemented: true },
  { key: 'workOrder', label: 'Delovni nalog', implemented: true },
  { key: 'materialOrder', label: 'Naročilnica', implemented: true },
  { key: 'deliveryNote', label: 'Dobavnica', implemented: true },
  { key: 'workOrderConfirmation', label: 'Potrdilo del. naloga', implemented: true },
  { key: 'creditNote', label: 'Dobropis', implemented: true }
];

const DOCUMENT_PREVIEW_TYPES: Record<DocumentTabKey, OfferPdfPreviewPayload['docType']> = {
  offer: 'OFFER',
  invoice: 'INVOICE',
  workOrder: 'WORK_ORDER',
  materialOrder: 'PURCHASE_ORDER',
  deliveryNote: 'DELIVERY_NOTE',
  workOrderConfirmation: 'WORK_ORDER_CONFIRMATION',
  creditNote: 'CREDIT_NOTE',
};

const createEmptyNoteDefaults = (): Record<DocumentTabKey, string[]> => ({
  offer: [],
  invoice: [],
  workOrder: [],
  materialOrder: [],
  deliveryNote: [],
  workOrderConfirmation: [],
  creditNote: []
});

const sanitizeNoteDefaults = (
  defaults: Partial<Record<DocumentTabKey, string[]>> | undefined,
  notes: NoteDto[]
): Record<DocumentTabKey, string[]> => {
  const result = createEmptyNoteDefaults();
  const order = notes.map((note) => note.id);
  const orderMap = new Map(order.map((id, index) => [id, index]));

  documentTabs.forEach((tab) => {
    const raw = defaults?.[tab.key];
    if (!Array.isArray(raw)) {
      result[tab.key] = [];
      return;
    }
    const seen = new Set<string>();
    result[tab.key] = raw
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value && orderMap.has(value) && !seen.has(value) && seen.add(value))
      .sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
  });

  return result;
};

const dummyProject = {
  title: 'Pametna razsvetljava - ponudba',
  description: 'Zamenjava svetil in integracija pametnega krmiljenja.',
  items: [
    { name: 'LED panel 60x60', quantity: 12, price: 85 },
    { name: 'Monta za in konfiguracija', quantity: 8, price: 45 }
  ]
};

type DummyProject = typeof dummyProject;

const DEFAULT_NUMBER_PATTERNS: Record<DocumentTabKey, string> = {
  offer: 'PONUDBA-{YYYY}-{SEQ:000}',
  invoice: 'RACUN-{YYYY}-{SEQ:000}',
  materialOrder: 'NAROCILO-{YYYY}-{SEQ:000}',
  deliveryNote: 'DOBAVNICA-{YYYY}-{SEQ:000}',
  workOrder: 'DELO-{YYYY}-{SEQ:000}',
  workOrderConfirmation: 'POTRDILO-{YYYY}-{SEQ:000}',
  creditNote: 'DOBROPIS-{YYYY}-{SEQ:000}',
};
const NUMBER_TOKEN_REGEX = /\{([^}]+)\}/g;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Datoteke ni mogoče prebrati.'));
    reader.readAsDataURL(file);
  });
}

function formatNumberPreview(
  pattern: string,
  sequence = 1,
  referenceDate: Date = new Date(),
  docType: DocumentTabKey = 'offer'
) {
  const fallback = DEFAULT_NUMBER_PATTERNS[docType] ?? DEFAULT_NUMBER_PATTERNS.offer;
  const safePattern = pattern?.trim() || fallback;
  const date = referenceDate instanceof Date && !Number.isNaN(referenceDate.valueOf()) ? referenceDate : new Date();
  const year = date.getFullYear();
  const shortYear = String(year).slice(-2).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seqValue = Math.max(0, sequence);

  return safePattern.replace(NUMBER_TOKEN_REGEX, (match, raw) => {
    const token = String(raw ?? '').trim().toUpperCase();
    switch (token) {
      case 'YYYY':
        return String(year);
      case 'YY':
        return shortYear;
      case 'MM':
        return month;
      case 'DD':
        return day;
      default:
        if (token.startsWith('SEQ')) {
          const paddingMatch = token.match(/SEQ:(0{1,6})/);
          const padding = paddingMatch?.[1] ?? '000';
          return String(seqValue).padStart(padding.length, '0');
        }
        return match;
    }
  });
}

export const SettingsPage: React.FC = () => {
  const { settings, loading, error, refresh } = useSettingsData();
  const [form, setForm] = useState<SettingsDto>(settings);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [savingScope, setSavingScope] = useState<FormSaveScope | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [activeDocumentTab, setActiveDocumentTab] = useState<DocumentTabKey>('offer');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const numberPatterns = useMemo(() => {
    return {
      offer: form.documentNumbering?.offer?.pattern ?? DEFAULT_NUMBER_PATTERNS.offer,
      invoice: form.documentNumbering?.invoice?.pattern ?? DEFAULT_NUMBER_PATTERNS.invoice,
      workOrder: form.documentNumbering?.workOrder?.pattern ?? DEFAULT_NUMBER_PATTERNS.workOrder,
      materialOrder: form.documentNumbering?.materialOrder?.pattern ?? DEFAULT_NUMBER_PATTERNS.materialOrder,
      deliveryNote: form.documentNumbering?.deliveryNote?.pattern ?? DEFAULT_NUMBER_PATTERNS.deliveryNote,
      workOrderConfirmation:
        form.documentNumbering?.workOrderConfirmation?.pattern ?? DEFAULT_NUMBER_PATTERNS.workOrderConfirmation,
      creditNote: form.documentNumbering?.creditNote?.pattern ?? DEFAULT_NUMBER_PATTERNS.creditNote,
    };
  }, [form.documentNumbering]);

  const numberExamples = useMemo(() => {
    const now = new Date();
    return Object.keys(DOCUMENT_PREVIEW_TYPES).reduce((acc, key) => {
      const docKey = key as DocumentTabKey;
      acc[docKey] = formatNumberPreview(numberPatterns[docKey], 1, now, docKey);
      return acc;
    }, {} as Record<DocumentTabKey, string>);
  }, [numberPatterns]);

  const activeNumberPattern = numberPatterns[activeDocumentTab];
  const activeNumberExample = numberExamples[activeDocumentTab];

  const totalPreview = useMemo(
    () => dummyProject.items.reduce((sum, item) => sum + item.quantity * item.price, 0),
    []
  );

  const notes = form.notes ?? [];
  const noteDefaultsByDoc = useMemo(
    () => sanitizeNoteDefaults(form.noteDefaultsByDoc, notes),
    [form.noteDefaultsByDoc, notes]
  );

  const offerDefaultNotes = useMemo(() => {
    const defaults = noteDefaultsByDoc.offer ?? [];
    const map = new Map(notes.map((note) => [note.id, note]));
    return defaults
      .map((id) => map.get(id))
      .filter((note): note is NoteDto => Boolean(note));
  }, [noteDefaultsByDoc, notes]);

  const addressLines = useMemo(
    () =>
      [
        form.address,
        [form.postalCode, form.city].filter(Boolean).join(' ').trim(),
      ]
        .map((line) => line?.trim())
        .filter((line) => !!line),
    [form.address, form.postalCode, form.city]
  );

  const handleFieldChange = <K extends keyof Omit<SettingsDto, 'documentPrefix'>>(
    field: K,
    value: Omit<SettingsDto, 'documentPrefix'>[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePatternChange = (docKey: DocumentTabKey, value: string) => {
    const nextValue = value.slice(0, 80);
    setForm((prev) => ({
      ...prev,
      documentNumbering: {
        ...prev.documentNumbering,
        [docKey]: {
          pattern: nextValue,
          reset: prev.documentNumbering?.[docKey]?.reset ?? 'yearly',
          yearOverride: prev.documentNumbering?.[docKey]?.yearOverride ?? null,
          seqOverride: prev.documentNumbering?.[docKey]?.seqOverride ?? null,
        },
      },
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

  const handleNotesChange = (nextNotes: NoteDto[]) => {
    setForm((prev) => {
      const sanitizedDefaults = sanitizeNoteDefaults(prev.noteDefaultsByDoc, nextNotes);
      return {
        ...prev,
        notes: nextNotes,
        noteDefaultsByDoc: sanitizedDefaults
      };
    });
  };

  const handleNoteDefaultsChange = (docKey: DocumentTabKey, defaults: string[]) => {
    setForm((prev) => {
      const notes = prev.notes ?? [];
      const sanitized = sanitizeNoteDefaults(prev.noteDefaultsByDoc, notes);
      sanitized[docKey] = defaults;
      return {
        ...prev,
        noteDefaultsByDoc: sanitized
      };
    });
  };

  const persistSettings = async (scope: FormSaveScope) => {
    setSavingScope(scope);
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
      setSavingScope((current) => (current === scope ? null : current));
    }
  };

  const handleCompanySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.companyName.trim() || !form.address.trim()) {
      setStatus({ variant: 'error', text: 'Naziv podjetja in naslov sta obvezna.' });
      return;
    }
    await persistSettings('company');
  };

  const handleDocumentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await persistSettings('documents');
  };

  const companySaving = savingScope === 'company';
  const documentSaving = savingScope === 'documents';
  const activeDocumentMeta = documentTabs.find((tab) => tab.key === activeDocumentTab) ?? documentTabs[0];

  return (
    <section className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Nastavitve</h1>
        <p className="text-muted-foreground">
          Centralno upravljanje podjetja in dokumentnih predlog na enem mestu.
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

      {error && (
        <div className="rounded-md border border-destructive px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">
          Nalagam nastavitve ...
        </div>
      )}

      <CompanySettingsForm
        form={form}
        handleFieldChange={handleFieldChange}
        handleLogoUpload={handleLogoUpload}
        handleSubmit={handleCompanySubmit}
        saving={companySaving}
        loading={loading}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Dokumenti</h2>
            <p className="text-sm text-muted-foreground">
              Upravljaj številčenje, privzete tekste in predoglede dokumentov.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {documentTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveDocumentTab(tab.key)}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition ${
                activeDocumentTab === tab.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeDocumentMeta?.implemented ? (
          <DocumentSettingsTab
            docType={activeDocumentTab}
            label={activeDocumentMeta?.label ?? 'Dokument'}
            pattern={activeNumberPattern}
            patternExample={activeNumberExample}
            onPatternChange={(value) => handlePatternChange(activeDocumentTab, value)}
            notes={notes}
            activeDocDefaults={noteDefaultsByDoc[activeDocumentTab] ?? []}
            onDocDefaultsChange={(defaults) => handleNoteDefaultsChange(activeDocumentTab, defaults)}
            onNotesChange={handleNotesChange}
            onSubmit={handleDocumentSubmit}
            saving={documentSaving}
            loading={loading}
            previewVisible={previewVisible}
            onTogglePreview={() => setPreviewVisible((prev) => !prev)}
            preview={
              activeDocumentTab === 'offer' ? (
                <OfferPreview
                  form={form}
                  addressLines={addressLines}
                  offerNumberExample={activeNumberExample}
                  dummyProject={dummyProject}
                  totalPreview={totalPreview}
                  offerDefaultNotes={offerDefaultNotes}
                  onUpdateField={(field, value) => handleFieldChange(field, value)}
                />
              ) : (
                <DocumentPreview docType={DOCUMENT_PREVIEW_TYPES[activeDocumentTab]} visible={previewVisible} />
              )
            }
          />
        ) : (
          <Card title={activeDocumentMeta?.label ?? 'Dokument'}>
            <p className="text-sm text-muted-foreground">Nastavitve za ta dokument še niso na voljo.</p>
          </Card>
        )}
      </section>
    </section>
  );
};

interface CompanySettingsFormProps {
  form: SettingsDto;
  handleFieldChange: <K extends keyof Omit<SettingsDto, 'documentPrefix'>>(
    field: K,
    value: Omit<SettingsDto, 'documentPrefix'>[K]
  ) => void;
  handleLogoUpload: (file: File | null) => Promise<void> | void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  loading: boolean;
}

const CompanySettingsForm: React.FC<CompanySettingsFormProps> = ({
  form,
  handleFieldChange,
  handleLogoUpload,
  handleSubmit,
  saving,
  loading
}) => (
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
        <Input
          label="Spletna stran"
          value={form.website ?? ''}
          onChange={(event) => handleFieldChange('website', event.target.value)}
        />
        <Input
          label="Ulica"
          value={form.address}
          onChange={(event) => handleFieldChange('address', event.target.value)}
        />
        <Input
          label="Poštna številka"
          value={form.postalCode ?? ''}
          onChange={(event) => handleFieldChange('postalCode', event.target.value)}
        />
        <Input
          label="Mesto"
          value={form.city ?? ''}
          onChange={(event) => handleFieldChange('city', event.target.value)}
        />
        <Input
          label="Država"
          value={form.country ?? ''}
          onChange={(event) => handleFieldChange('country', event.target.value)}
        />
        <Input
          label="TRR / IBAN"
          value={form.iban ?? ''}
          onChange={(event) => handleFieldChange('iban', event.target.value)}
        />
        <Input
          label="Davčna številka"
          value={form.vatId ?? ''}
          onChange={(event) => handleFieldChange('vatId', event.target.value)}
        />
        <Input
          label="Direktor"
          value={form.directorName ?? ''}
          onChange={(event) => handleFieldChange('directorName', event.target.value)}
        />
      </div>
    </Card>

    <Card title="Izgled podjetja">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
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
      </div>
    </Card>

    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={saving || loading}>
        {saving ? 'Shranjujem ...' : 'Shrani podjetje'}
      </Button>
    </div>
  </form>
);
