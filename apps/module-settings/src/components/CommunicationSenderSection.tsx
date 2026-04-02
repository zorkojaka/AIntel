import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Input, Textarea } from '@aintel/ui';
import { renderCommunicationFooterPreviewHtml } from '../../../../shared/utils/communication-footer';
import type { CommunicationSenderSettings, SettingsDto } from '../types';

interface CommunicationSenderSectionProps {
  value: CommunicationSenderSettings | null;
  company: Pick<SettingsDto, 'companyName' | 'website' | 'address' | 'email' | 'phone' | 'logoUrl'>;
  onSave: (value: CommunicationSenderSettings) => Promise<void>;
}

const FOOTER_TOKENS = [
  { label: 'Ime pošiljatelja', token: '{{sender.name}}' },
  { label: 'Email pošiljatelja', token: '{{sender.email}}' },
  { label: 'Telefon', token: '{{sender.phone}}' },
  { label: 'Funkcija', token: '{{sender.role}}' },
  { label: 'Naziv podjetja', token: '{{company.name}}' },
  { label: 'Spletna stran', token: '{{company.website}}' },
  { label: 'Naslov podjetja', token: '{{company.address}}' },
  { label: 'Email podjetja', token: '{{company.email}}' },
  { label: 'Telefon podjetja', token: '{{company.phone}}' },
  { label: 'Logo', token: '{{company.logo}}' },
] as const;

export const CommunicationSenderSection: React.FC<CommunicationSenderSectionProps> = ({
  value,
  company,
  onSave,
}) => {
  const normalizedCompany = useMemo(
    () => ({
      companyName: company?.companyName ?? '',
      website: company?.website ?? '',
      address: company?.address ?? '',
      email: company?.email ?? '',
      phone: company?.phone ?? '',
      logoUrl: company?.logoUrl ?? '',
    }),
    [company]
  );
  const [form, setForm] = useState<CommunicationSenderSettings>({
    senderName: '',
    senderEmail: '',
    senderPhone: '',
    senderRole: '',
    defaultCc: '',
    defaultBcc: '',
    replyToEmail: '',
    emailFooterTemplate: '',
    enabled: false,
  });
  const [saving, setSaving] = useState(false);
  const footerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!value) {
      return;
    }
    setForm({
      senderName: value.senderName ?? '',
      senderEmail: value.senderEmail ?? '',
      senderPhone: value.senderPhone ?? '',
      senderRole: value.senderRole ?? '',
      defaultCc: value.defaultCc ?? '',
      defaultBcc: value.defaultBcc ?? '',
      replyToEmail: value.replyToEmail ?? '',
      emailFooterTemplate: value.emailFooterTemplate ?? '',
      enabled: Boolean(value.enabled),
    });
  }, [value]);

  const previewHtml = useMemo(
    () =>
      renderCommunicationFooterPreviewHtml(form.emailFooterTemplate, {
        sender: {
          name: form.senderName,
          email: form.senderEmail,
          phone: form.senderPhone,
          role: form.senderRole,
        },
        company: {
          name: normalizedCompany.companyName,
          website: normalizedCompany.website,
          address: normalizedCompany.address,
          email: normalizedCompany.email,
          phone: normalizedCompany.phone,
          logoUrl: normalizedCompany.logoUrl,
        },
      }),
    [form, normalizedCompany]
  );

  const insertToken = (token: string) => {
    const textarea = footerRef.current;
    const currentValue = form.emailFooterTemplate ?? '';
    if (!textarea) {
      setForm((prev) => ({
        ...prev,
        emailFooterTemplate: `${currentValue}${currentValue ? '\n' : ''}${token}`,
      }));
      return;
    }

    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
    setForm((prev) => ({ ...prev, emailFooterTemplate: nextValue }));

    requestAnimationFrame(() => {
      const nextCursor = start + token.length;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        senderName: form.senderName.trim(),
        senderEmail: form.senderEmail.trim(),
        senderPhone: form.senderPhone?.trim() || null,
        senderRole: form.senderRole?.trim() || null,
        defaultCc: form.defaultCc?.trim() || null,
        defaultBcc: form.defaultBcc?.trim() || null,
        replyToEmail: form.replyToEmail?.trim() || null,
        emailFooterTemplate: form.emailFooterTemplate ?? '',
        enabled: Boolean(form.enabled),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Card title="Pošiljatelj emailov">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Privzeto ime pošiljatelja"
            value={form.senderName}
            onChange={(event) => setForm((prev) => ({ ...prev, senderName: event.target.value }))}
            required
          />
          <Input
            label="Privzeti email pošiljatelja"
            type="email"
            value={form.senderEmail}
            onChange={(event) => setForm((prev) => ({ ...prev, senderEmail: event.target.value }))}
            required
          />
          <Input
            label="Privzeti telefon pošiljatelja"
            value={form.senderPhone ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, senderPhone: event.target.value }))}
          />
          <Input
            label="Privzeta funkcija pošiljatelja"
            value={form.senderRole ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, senderRole: event.target.value }))}
          />
          <Input
            label="Privzeti CC"
            value={form.defaultCc ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, defaultCc: event.target.value }))}
            placeholder="npr. prodaja@podjetje.si, vodja@podjetje.si"
          />
          <Input
            label="Privzeti BCC"
            value={form.defaultBcc ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, defaultBcc: event.target.value }))}
            placeholder="npr. moj@email.si"
          />
          <Input
            label="Reply-To email"
            type="email"
            value={form.replyToEmail ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, replyToEmail: event.target.value }))}
          />
          <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            Omogoči pošiljanje emailov iz backend sistema
          </label>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Trenutno prijavljen uporabnik lahko pri pošiljanju prepiše ime, funkcijo, email in telefon. Tukaj nastavljate privzete fallback vrednosti in privzeti CC/BCC.
        </div>

        <div className="mt-4 space-y-3">
          <Textarea
            ref={footerRef}
            label="Globalni email footer"
            rows={7}
            value={form.emailFooterTemplate ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, emailFooterTemplate: event.target.value }))}
            placeholder={'{{company.logo}}\n{{sender.name}}\n{{sender.role}}\n{{sender.phone}}\n{{sender.email}}\n{{company.name}}'}
          />

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Vstavi placeholder</div>
            <div className="flex flex-wrap gap-2">
              {FOOTER_TOKENS.map((entry) => (
                <button
                  key={entry.token}
                  type="button"
                  onClick={() => insertToken(entry.token)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  <span>{entry.label}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">{entry.token}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Footer se doda samodejno enkrat pri pošiljanju. Manjkajoče vrednosti se varno izpustijo.
          </p>
        </div>

        <div className="mt-5 rounded-md border border-border bg-muted/20 p-4">
          <div className="mb-2 text-sm font-medium text-foreground">Predogled footerja</div>
          {previewHtml ? (
            <div
              className="rounded-md border border-border bg-background p-4 text-sm"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <div className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              Footer je prazen ali trenutno nima podatkov za prikaz.
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Shranjujem ...' : 'Shrani pošiljatelja'}
          </Button>
        </div>
      </Card>
    </form>
  );
};
