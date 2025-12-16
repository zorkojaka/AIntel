import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Card, ColorPicker, FileUpload, Input, Textarea } from '@aintel/ui';
import { applySettingsTheme, saveSettings } from './api';
import { useSettingsData } from './hooks/useSettings';
import {
  DocumentTypeKey,
  NoteDto,
  NoteCategory,
  SettingsDto,
} from './types';

interface StatusBanner {
  variant: 'success' | 'error';
  text: string;
}

type FormSaveScope = 'company' | 'documents';

type DocumentTabKey = DocumentTypeKey;

const documentTabs: { key: DocumentTabKey; label: string; implemented: boolean }[] = [
  { key: 'offer', label: 'Ponudba', implemented: true },
  { key: 'invoice', label: 'Račun', implemented: false },
  { key: 'workOrder', label: 'Delovni nalog', implemented: false },
  { key: 'materialOrder', label: 'Naročilnica', implemented: false },
  { key: 'deliveryNote', label: 'Dobavnica', implemented: false },
  { key: 'workOrderConfirmation', label: 'Potrdilo del. naloga', implemented: false },
  { key: 'creditNote', label: 'Dobropis', implemented: false }
];

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

const generateNoteId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const dummyProject = {
  title: 'Pametna razsvetljava - ponudba',
  description: 'Zamenjava svetil in integracija pametnega krmiljenja.',
  items: [
    { name: 'LED panel 60x60', quantity: 12, price: 85 },
    { name: 'Monta za in konfiguracija', quantity: 8, price: 45 }
  ]
};

type DummyProject = typeof dummyProject;

const DEFAULT_NUMBER_PATTERN = 'PONUDBA-{YYYY}-{SEQ:000}';
const NUMBER_TOKEN_REGEX = /\{([^}]+)\}/g;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Datoteke ni mogoče prebrati.'));
    reader.readAsDataURL(file);
  });
}

function formatNumberPreview(pattern: string, sequence = 1, referenceDate: Date = new Date()) {
  const safePattern = pattern?.trim() || DEFAULT_NUMBER_PATTERN;
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

  const offerNumberPattern = form.documentNumbering?.offer?.pattern ?? DEFAULT_NUMBER_PATTERN;
  const offerNumberExample = useMemo(() => formatNumberPreview(offerNumberPattern, 1), [offerNumberPattern]);

  const totalPreview = useMemo(
    () => dummyProject.items.reduce((sum, item) => sum + item.quantity * item.price, 0),
    []
  );

  const notes = form.notes ?? [];
  const noteDefaultsByDoc = useMemo(
    () => sanitizeNoteDefaults(form.noteDefaultsByDoc, notes),
    [form.noteDefaultsByDoc, notes]
  );

  const handleFieldChange = <K extends keyof Omit<SettingsDto, 'documentPrefix'>>(
    field: K,
    value: Omit<SettingsDto, 'documentPrefix'>[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleOfferPatternChange = (value: string) => {
    const nextValue = value.slice(0, 80);
    setForm((prev) => ({
      ...prev,
      documentNumbering: {
        ...prev.documentNumbering,
        offer: {
          pattern: nextValue,
          reset: prev.documentNumbering?.offer?.reset ?? 'yearly',
          yearOverride: prev.documentNumbering?.offer?.yearOverride ?? null,
          seqOverride: prev.documentNumbering?.offer?.seqOverride ?? null,
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
  useEffect(() => {
    if (activeDocumentTab !== 'offer') {
      setPreviewVisible(false);
    }
  }, [activeDocumentTab]);

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
          <DocumentSettingsSection
            form={form}
            notes={notes}
            noteDefaultsByDoc={noteDefaultsByDoc}
            activeDocumentKey={activeDocumentTab}
            activeDocumentLabel={activeDocumentMeta?.label ?? 'Dokument'}
            handleFieldChange={handleFieldChange}
            handleNotesChange={handleNotesChange}
            handleNoteDefaultsChange={handleNoteDefaultsChange}
            handleSubmit={handleDocumentSubmit}
            saving={documentSaving}
            loading={loading}
            previewVisible={previewVisible}
            onTogglePreview={() => setPreviewVisible((prev) => !prev)}
            offerNumberPattern={offerNumberPattern}
            offerNumberExample={offerNumberExample}
            onOfferPatternChange={handleOfferPatternChange}
            totalPreview={totalPreview}
            dummyProject={dummyProject}
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

interface DocumentSettingsSectionProps {
  form: SettingsDto;
  notes: NoteDto[];
  noteDefaultsByDoc: Record<DocumentTabKey, string[]>;
  activeDocumentKey: DocumentTabKey;
  activeDocumentLabel: string;
  handleFieldChange: <K extends keyof Omit<SettingsDto, 'documentPrefix'>>(
    field: K,
    value: Omit<SettingsDto, 'documentPrefix'>[K]
  ) => void;
  handleNotesChange: (notes: NoteDto[]) => void;
  handleNoteDefaultsChange: (docKey: DocumentTabKey, defaults: string[]) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  loading: boolean;
  previewVisible: boolean;
  onTogglePreview: () => void;
  offerNumberPattern: string;
  offerNumberExample: string;
  onOfferPatternChange: (value: string) => void;
  totalPreview: number;
  dummyProject: DummyProject;
}


const DocumentSettingsSection: React.FC<DocumentSettingsSectionProps> = ({
  form,
  notes,
  noteDefaultsByDoc,
  activeDocumentKey,
  activeDocumentLabel,
  handleFieldChange,
  handleNotesChange,
  handleNoteDefaultsChange,
  handleSubmit,
  saving,
  loading,
  previewVisible,
  onTogglePreview,
  offerNumberPattern,
  offerNumberExample,
  onOfferPatternChange,
  totalPreview,
  dummyProject,
}) => {
  const [editingField, setEditingField] = useState<{
    field: 'email' | 'phone' | 'website' | 'vatId' | 'iban';
    value: string;
  } | null>(null);
  const [showNumberingHelp, setShowNumberingHelp] = useState(false);

  const openHotspot = (field: 'email' | 'phone' | 'website' | 'vatId' | 'iban', value?: string | null) => {
    setEditingField({ field, value: value ?? '' });
  };

  const closeHotspot = () => setEditingField(null);

  const applyHotspotValue = () => {
    if (!editingField) return;
    handleFieldChange(editingField.field, editingField.value);
    closeHotspot();
  };

  const hotspotLabelMap: Record<'email' | 'phone' | 'website' | 'vatId' | 'iban', string> = {
    email: 'Email podjetja',
    phone: 'Telefon podjetja',
    website: 'Spletna stran podjetja',
    vatId: 'Davčna številka',
    iban: 'TRR / IBAN',
  };

  const hotspotPlaceholderMap: Record<'email' | 'phone' | 'website' | 'vatId' | 'iban', string> = {
    email: 'Dodaj email',
    phone: 'Dodaj telefon',
    website: 'Dodaj spletno stran',
    vatId: 'Dodaj davčno številko',
    iban: 'Dodaj IBAN',
  };
  const addressLines = [
    form.address,
    [form.postalCode, form.city].filter(Boolean).join(' ').trim(),
  ]
    .map((line) => line?.trim())
    .filter((line) => !!line);

  const sortedNotes = useMemo(
    () =>
      notes
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((note, index) => ({ ...note, sortOrder: index })),
    [notes]
  );

  const noteMap = useMemo(() => new Map(sortedNotes.map((note) => [note.id, note])), [sortedNotes]);
  const activeDocDefaults = noteDefaultsByDoc[activeDocumentKey] ?? [];
  const offerDefaultNotes = useMemo(() => {
    const defaults = noteDefaultsByDoc.offer ?? [];
    return defaults
      .map((id) => noteMap.get(id))
      .filter((note): note is NoteDto => Boolean(note));
  }, [noteDefaultsByDoc, noteMap]);

  const vatLine = form.vatId ? `DDV: ${form.vatId}` : '';
  const ibanLine = form.iban ? `IBAN: ${form.iban}` : '';

  const contactLineItems: React.ReactNode[] = [];
  if (form.email) {
    contactLineItems.push(
      <button
        key="email"
        type="button"
        className="rounded px-1 text-xs font-medium text-foreground/80 hover:text-primary hover:underline"
        onClick={() => openHotspot('email', form.email)}
      >
        {form.email}
      </button>
    );
  }
  if (form.phone) {
    contactLineItems.push(
      <button
        key="phone"
        type="button"
        className="rounded px-1 text-xs font-medium text-foreground/80 hover:text-primary hover:underline"
        onClick={() => openHotspot('phone', form.phone)}
      >
        {form.phone}
      </button>
    );
  }
  if (form.website) {
    contactLineItems.push(
      <button
        key="website"
        type="button"
        className="rounded px-1 text-xs font-medium text-foreground/80 hover:text-primary hover:underline"
        onClick={() => openHotspot('website', form.website)}
      >
        {form.website}
      </button>
    );
  }

  const financeLineItems: React.ReactNode[] = [];
  if (form.vatId) {
    financeLineItems.push(
      <button
        key="vat"
        type="button"
        className="rounded px-1 text-xs font-medium text-foreground/80 hover:text-primary hover:underline"
        onClick={() => openHotspot('vatId', form.vatId)}
      >
        {`DDV: ${form.vatId}`}
      </button>
    );
  }
  if (form.iban) {
    financeLineItems.push(
      <button
        key="iban"
        type="button"
        className="rounded px-1 text-xs font-medium text-foreground/80 hover:text-primary hover:underline"
        onClick={() => openHotspot('iban', form.iban)}
      >
        {`IBAN: ${form.iban}`}
      </button>
    );
  }

  const buildBulletLine = (items: React.ReactNode[], key: string) => {
    if (!items.length) return null;
    return (
      <p className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        {items.map((item, index) => (
          <React.Fragment key={`${key}-${index}`}>
            {index > 0 && <span aria-hidden="true">·</span>}
            {item}
          </React.Fragment>
        ))}
      </p>
    );
  };

  const contactLine = buildBulletLine(contactLineItems, 'contact');
  const financeLine = buildBulletLine(financeLineItems, 'finance');

  const previewCommentPlaceholder = 'Komentar se ureja neposredno na ponudbi.';
  const previewCommentText = previewCommentPlaceholder.trim();
  const previewCommentBlock = previewCommentText ? (
    <div className="mt-6 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-sm font-semibold text-foreground">Komentar</p>
      <p className="text-sm text-muted-foreground">{previewCommentText}</p>
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <form className="space-y-6" onSubmit={handleSubmit}>
        {activeDocumentKey === 'offer' && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
            <label className="text-sm font-medium text-foreground">Številčenje ponudbe</label>
            <Textarea
              rows={2}
              className="min-h-[48px] w-full resize-none font-mono text-base leading-relaxed"
              value={offerNumberPattern}
              onChange={(event) => onOfferPatternChange(event.target.value)}
              placeholder="PONUDBA-{YYYY}-{SEQ:000}"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Podprti tokeni: {'{YYYY}, {YY}, {MM}, {DD}, {SEQ:000}'}</span>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[11px] text-foreground transition hover:bg-background"
                  onClick={() => setShowNumberingHelp((prev) => !prev)}
                  aria-label="Pomoč pri številčenju"
                >
                  ?
                </button>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 font-mono text-[11px] text-foreground">
                Primer: {offerNumberExample}
              </span>
            </div>
            {showNumberingHelp && (
              <div className="rounded-md border border-dashed border-border bg-background/70 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Primeri:</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>PONUDBA-{`{YYYY}`}-{`{SEQ:000}`} → PONUDBA-2025-001</li>
                  <li>O-{`{YY}`}{`{MM}`}-{`{SEQ:0000}`} → O-2512-0001</li>
                  <li>PRJ-{`{SEQ:000}`} → PRJ-001</li>
                </ul>
              </div>
            )}
          </div>
        )}

        <NotesManager
          notes={sortedNotes}
          activeDocumentLabel={activeDocumentLabel}
          activeDocDefaults={activeDocDefaults}
          onDocDefaultsChange={(defaults) => handleNoteDefaultsChange(activeDocumentKey, defaults)}
          onNotesChange={handleNotesChange}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving || loading}>
            {saving ? 'Shranjujem ...' : 'Shrani dokument'}
          </Button>
          <Button type="button" variant="ghost" onClick={onTogglePreview}>
            {previewVisible ? 'Skrij PDF predogled' : 'Predogled PDF'}
          </Button>
        </div>
      </form>

      {previewVisible && (
        <Card title="PDF predogled">
          <div className="overflow-auto rounded-md border border-border bg-slate-50 p-4">
            <div className="mx-auto w-[794px] bg-white p-8 shadow-sm">
              <div className="flex items-start justify-between gap-8">
                <div
                  className="flex items-center justify-center rounded-md border border-border bg-white"
                  style={{ width: 180, height: 80 }}
                >
                  {form.logoUrl ? (
                    <img
                      src={form.logoUrl}
                      alt="Logotip v predogledu"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">Logo</div>
                  )}
                </div>
                <div className="text-right text-sm">
                  <p className="text-lg font-semibold text-foreground" style={{ color: form.primaryColor }}>
                    {form.companyName}
                  </p>
                  {addressLines.map((line) => (
                    <p key={line} className="text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <div className="rounded-md border border-primary/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Stranka</p>
                  <div className="mt-3 space-y-1 text-sm">
                    <p>Davčna: SI12345678</p>
                    <p>Janez Novak</p>
                    <p>Pod hribom 12</p>
                    <p>1000 Ljubljana</p>
                  </div>
                </div>
                <div className="rounded-md border border-border p-4 text-sm">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <p className="uppercase tracking-wide text-muted-foreground">Dokument</p>
                    <p className="font-semibold">Ponudba</p>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p>
                      <span className="text-muted-foreground">Št.:</span> {offerNumberExample}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Datum:</span> 12. 02. 2025
                    </p>
                    <p>
                      <span className="text-muted-foreground">Veljavnost:</span> 30 dni
                    </p>
                    <p>
                      <span className="text-muted-foreground">Rok plačila:</span> 15 dni
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-2">
                <h3 className="text-xl font-semibold text-foreground">{dummyProject.title}</h3>
                <p className="text-sm text-muted-foreground">{dummyProject.description}</p>
              </div>

              <table className="mt-6 w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="w-2/5 border border-border px-3 py-2 text-left">Postavka</th>
                    <th className="w-1/5 border border-border px-3 py-2 text-right">Količina</th>
                    <th className="w-1/5 border border-border px-3 py-2 text-right">Cena</th>
                    <th className="w-1/5 border border-border px-3 py-2 text-right">Znesek</th>
                  </tr>
                </thead>
                <tbody>
                  {dummyProject.items.map((item) => {
                    const itemTotal = item.quantity * item.price;
                    return (
                      <tr key={item.name}>
                        <td className="border border-border px-3 py-2">{item.name}</td>
                        <td className="border border-border px-3 py-2 text-right">{item.quantity}</td>
                        <td className="border border-border px-3 py-2 text-right">
                          {new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(item.price)}
                        </td>
                        <td className="border border-border px-3 py-2 text-right">
                          {new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(itemTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {['Skupaj brez DDV', 'Popust', 'DDV', 'Skupaj z DDV'].map((label, index) => (
                    <tr key={label}>
                      <td className="border border-border px-3 py-2 text-right font-semibold" colSpan={3}>
                        {label}
                      </td>
                      <td className="border border-border px-3 py-2 text-right font-semibold">
                        {new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(
                          index === 1 ? 0 : totalPreview
                        )}
                      </td>
                    </tr>
                  ))}
                </tfoot>
              </table>

              {previewCommentBlock}

              <div className="mt-8 flex justify-end">
                <div className="w-[45%] min-w-[280px] space-y-3 text-sm">
                  <p className="font-semibold text-foreground text-right">Podpis</p>
                  <div className="text-right text-muted-foreground">
                    <p>Direktor: {form.directorName || 'Dodajte direktorja v nastavitvah podjetja.'}</p>
                    <div className="mt-6 border-b border-border" />
                  </div>
                </div>
              </div>

              {offerDefaultNotes.length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="font-semibold text-foreground">Opombe</p>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {offerDefaultNotes.map((note) => (
                      <li key={note.id}>{note.text || note.title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(contactLine || financeLine) && (
                <div className="mt-6 border-t border-border pt-3 space-y-1">
                  {contactLine}
                  {financeLine}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {editingField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-md border border-border bg-background p-5 shadow-lg">
            <h4 className="text-lg font-semibold text-foreground">{hotspotLabelMap[editingField.field]}</h4>
            <Input
              autoFocus
              value={editingField.value}
              onChange={(event) =>
                setEditingField((prev) => (prev ? { ...prev, value: event.target.value } : prev))
              }
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeHotspot}>
                Prekliči
              </Button>
              <Button type="button" onClick={applyHotspotValue}>
                Uporabi
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface NotesManagerProps {
  notes: NoteDto[];
  activeDocumentLabel: string;
  activeDocDefaults: string[];
  onDocDefaultsChange: (defaults: string[]) => void;
  onNotesChange: (notes: NoteDto[]) => void;
}

const noteCategoryLabels: Record<NoteCategory, string> = {
  payment: 'Plačilni pogoji',
  delivery: 'Dostava',
  note: 'Opomba',
  costs: 'Dodatni stroški',
};

const NotesManager: React.FC<NotesManagerProps> = ({
  notes,
  activeDocumentLabel,
  activeDocDefaults,
  onDocDefaultsChange,
  onNotesChange,
}) => {
  const [modalState, setModalState] = useState<{
    id?: string;
    title: string;
    text: string;
    category: NoteCategory;
  } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const openModal = (note?: NoteDto) => {
    setModalError(null);
    setModalState({
      id: note?.id,
      title: note?.title ?? '',
      text: note?.text ?? '',
      category: note?.category ?? 'note',
    });
  };

  const closeModal = () => {
    setModalState(null);
    setModalError(null);
  };

  const saveNote = () => {
    if (!modalState) return;
    const title = modalState.title.trim();
    const text = modalState.text.trim();
    if (!title || !text) {
      setModalError('Naslov in besedilo sta obvezna.');
      return;
    }

    if (modalState.id) {
      const updated = notes.map((note) =>
        note.id === modalState.id ? { ...note, title, text, category: modalState.category } : note
      );
      onNotesChange(updated.map((note, index) => ({ ...note, sortOrder: index })));
    } else {
      const updated = [
        ...notes,
        {
          id: generateNoteId(),
          title,
          text,
          category: modalState.category,
          sortOrder: notes.length,
        },
      ];
      onNotesChange(updated.map((note, index) => ({ ...note, sortOrder: index })));
    }

    closeModal();
  };

  const deleteNote = (id: string) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Želite izbrisati opombo?')
    ) {
      return;
    }
    const updated = notes.filter((note) => note.id !== id).map((note, index) => ({ ...note, sortOrder: index }));
    onNotesChange(updated);
  };

  const moveNote = (id: string, direction: -1 | 1) => {
    const index = notes.findIndex((note) => note.id === id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= notes.length) return;
    const updated = [...notes];
    const [removed] = updated.splice(index, 1);
    updated.splice(target, 0, removed);
    onNotesChange(updated.map((note, idx) => ({ ...note, sortOrder: idx })));
  };

  const toggleDefault = (id: string, checked: boolean) => {
    const selected = new Set(activeDocDefaults);
    if (checked) {
      selected.add(id);
    } else {
      selected.delete(id);
    }
    const ordered = notes.map((note) => note.id).filter((noteId) => selected.has(noteId));
    onDocDefaultsChange(ordered);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`Privzete opombe za ${activeDocumentLabel}`}>
        <div className="max-h-64 space-y-3 overflow-auto">
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground">Ni dodanih opomb.</p>
          )}
          {notes.map((note) => (
            <label key={note.id} className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={activeDocDefaults.includes(note.id)}
                onChange={(event) => toggleDefault(note.id, event.target.checked)}
              />
              <div className="space-y-1">
                <p className="font-medium text-foreground">{note.title}</p>
                <p className="text-xs text-muted-foreground">{note.text}</p>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Opombe (knjižnica)">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Upravljaj vse opombe, ki jih lahko dodaš na dokument.</p>
          <Button type="button" onClick={() => openModal()}>
            Dodaj opombo
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground">Začni z dodajanjem prve opombe.</p>
          )}
          {notes.map((note, index) => (
            <div key={note.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{note.title}</p>
                  <p className="text-xs text-muted-foreground">{noteCategoryLabels[note.category]}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    onClick={() => moveNote(note.id, -1)}
                    disabled={index === 0}
                  >
                    Gor
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    onClick={() => moveNote(note.id, 1)}
                    disabled={index === notes.length - 1}
                  >
                    Dol
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground"
                    onClick={() => openModal(note)}
                  >
                    Uredi
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-destructive hover:text-destructive/80"
                    onClick={() => deleteNote(note.id)}
                  >
                    Izbriši
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{note.text}</p>
            </div>
          ))}
        </div>

        {modalState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg space-y-4 rounded-md border border-border bg-background p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-foreground">
                {modalState.id ? 'Uredi opombo' : 'Dodaj opombo'}
              </h3>
              {modalError && <p className="text-sm text-destructive">{modalError}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Naslov"
                  value={modalState.title}
                  onChange={(event) => setModalState((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                />
                <label className="text-sm font-medium text-foreground">
                  Kategorija
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                    value={modalState.category}
                    onChange={(event) =>
                      setModalState((prev) => (prev ? { ...prev, category: event.target.value as NoteCategory } : prev))
                    }
                  >
                    {Object.entries(noteCategoryLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Textarea
                label="Besedilo opombe"
                rows={5}
                value={modalState.text}
                onChange={(event) => setModalState((prev) => (prev ? { ...prev, text: event.target.value } : prev))}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeModal}>
                  Preklic
                </Button>
                <Button type="button" onClick={saveNote}>
                  Shrani
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
