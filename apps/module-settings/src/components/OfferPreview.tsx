import React, { useMemo, useState } from 'react';
import { Button, Card, Input } from '@aintel/ui';
import type { NoteDto, SettingsDto } from '../types';

interface DummyProject {
  title: string;
  description: string;
  items: Array<{ name: string; quantity: number; price: number }>;
}

interface OfferPreviewProps {
  form: SettingsDto;
  addressLines: string[];
  offerNumberExample: string;
  dummyProject: DummyProject;
  totalPreview: number;
  offerDefaultNotes: NoteDto[];
  onUpdateField: (field: 'email' | 'phone' | 'website' | 'vatId' | 'iban', value: string) => void;
}

export const OfferPreview: React.FC<OfferPreviewProps> = ({
  form,
  addressLines,
  offerNumberExample,
  dummyProject,
  totalPreview,
  offerDefaultNotes,
  onUpdateField,
}) => {
  const [editingField, setEditingField] = useState<{
    field: 'email' | 'phone' | 'website' | 'vatId' | 'iban';
    value: string;
  } | null>(null);

  const openHotspot = (field: 'email' | 'phone' | 'website' | 'vatId' | 'iban', value?: string | null) => {
    setEditingField({ field, value: value ?? '' });
  };

  const closeHotspot = () => setEditingField(null);

  const applyHotspotValue = () => {
    if (!editingField) return;
    onUpdateField(editingField.field, editingField.value);
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

  const buildBulletLine = (items: React.ReactNode[]) => {
    if (!items.length) return null;
    return (
      <p className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        {items.flatMap((item, index) => [item, index < items.length - 1 ? <span key={`dot-${index}`}>•</span> : null])}
      </p>
    );
  };

  const contactLine = buildBulletLine(contactLineItems.filter(Boolean));
  const financeLine = buildBulletLine(financeLineItems.filter(Boolean));
  const previewCommentPlaceholder = 'Komentar se ureja neposredno na ponudbi.';
  const previewCommentText = previewCommentPlaceholder.trim();
  const previewCommentBlock = previewCommentText ? (
    <div className="mt-6 rounded-md bg-muted/40 p-3">
      <p className="text-sm font-semibold text-foreground">Komentar</p>
      <p className="text-sm text-muted-foreground">{previewCommentText}</p>
    </div>
  ) : null;

  return (
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

      {editingField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-md border border-border bg-background p-5 shadow-lg">
            <h4 className="text-lg font-semibold text-foreground">{hotspotLabelMap[editingField.field]}</h4>
            <Input
              autoFocus
              value={editingField.value}
              placeholder={hotspotPlaceholderMap[editingField.field]}
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
    </Card>
  );
};
