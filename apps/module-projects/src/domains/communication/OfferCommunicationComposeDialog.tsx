import { useEffect, useMemo, useState } from 'react';
import type {
  CommunicationAttachmentType,
  CommunicationSenderSettings,
  CommunicationTemplate,
} from '@aintel/shared/types/communication';
import { renderCommunicationFooterText } from '../../../../../shared/utils/communication-footer';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { fetchCommunicationSenderSettings, fetchCommunicationTemplates, sendOfferCommunicationEmail } from './api';

interface OfferCommunicationComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  offerId: string | null;
  customerName: string;
  customerEmail: string;
  projectName: string;
  offerNumber: string;
  offerTotal: number;
  companyName: string;
  onSent: () => Promise<void> | void;
}

function replacePlaceholders(template: string, context: Record<string, string>) {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, key) => context[key.trim()] ?? '');
}

function formatTotal(value: number) {
  return new Intl.NumberFormat('sl-SI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

const ATTACHMENT_OPTIONS: Array<{ value: CommunicationAttachmentType; label: string }> = [
  { value: 'offer_pdf', label: 'PDF ponudbe' },
  { value: 'project_pdf', label: 'PDF projekta' },
];

export function OfferCommunicationComposeDialog({
  open,
  onOpenChange,
  projectId,
  offerId,
  customerName,
  customerEmail,
  projectName,
  offerNumber,
  offerTotal,
  companyName,
  onSent,
}: OfferCommunicationComposeDialogProps) {
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [senderSettings, setSenderSettings] = useState<CommunicationSenderSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<CommunicationAttachmentType[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const normalizedCustomerEmail = useMemo(() => customerEmail.trim(), [customerEmail]);

  const placeholderContext = useMemo(
    () => ({
      'customer.name': customerName || '',
      'customer.email': normalizedCustomerEmail,
      'project.name': projectName || '',
      'offer.number': offerNumber || '',
      'offer.total': `${formatTotal(offerTotal)} EUR`,
      'company.name': companyName || '',
      'sender.name': senderSettings?.senderName ?? '',
      'sender.email': senderSettings?.senderEmail ?? '',
      'sender.phone': senderSettings?.senderPhone ?? '',
      'sender.role': senderSettings?.senderRole ?? '',
    }),
    [companyName, customerName, normalizedCustomerEmail, offerNumber, offerTotal, projectName, senderSettings]
  );

  const renderedFooter = useMemo(
    () =>
      renderCommunicationFooterText(senderSettings?.emailFooterTemplate, {
        sender: {
          name: senderSettings?.senderName ?? '',
          email: senderSettings?.senderEmail ?? '',
          phone: senderSettings?.senderPhone ?? '',
          role: senderSettings?.senderRole ?? '',
        },
        company: {
          name: companyName || '',
          website: '',
          address: '',
          email: '',
          phone: '',
          logoUrl: '',
        },
      }),
    [
      companyName,
      senderSettings?.emailFooterTemplate,
      senderSettings?.senderEmail,
      senderSettings?.senderName,
      senderSettings?.senderPhone,
      senderSettings?.senderRole,
    ]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setInitError(null);

      try {
        const [nextTemplates, nextSender] = await Promise.all([
          fetchCommunicationTemplates('offer_send'),
          fetchCommunicationSenderSettings(),
        ]);
        if (!active) return;

        const activeTemplates = nextTemplates.filter((entry) => entry.isActive);
        const defaultTemplate = activeTemplates[0] ?? null;
        const initialContext = {
          'customer.name': customerName || '',
          'customer.email': normalizedCustomerEmail,
          'project.name': projectName || '',
          'offer.number': offerNumber || '',
          'offer.total': `${formatTotal(offerTotal)} EUR`,
          'company.name': companyName || '',
          'sender.name': nextSender?.senderName ?? '',
          'sender.email': nextSender?.senderEmail ?? '',
          'sender.phone': nextSender?.senderPhone ?? '',
          'sender.role': nextSender?.senderRole ?? '',
        };

        setTemplates(activeTemplates);
        setSenderSettings(nextSender);
        setSelectedTemplateId(defaultTemplate?.id ?? '');
        setTo(normalizedCustomerEmail);
        setCc(nextSender?.defaultCc ?? '');
        setBcc(nextSender?.defaultBcc ?? '');
        setSubject(defaultTemplate ? replacePlaceholders(defaultTemplate.subjectTemplate, initialContext) : '');
        setBody(defaultTemplate ? replacePlaceholders(defaultTemplate.bodyTemplate, initialContext) : '');
        setSelectedAttachments(defaultTemplate?.defaultAttachments ?? ['offer_pdf']);
        setIsDirty(false);
      } catch (error) {
        if (!active) return;

        setTemplates([]);
        setSenderSettings(null);
        setSelectedTemplateId('');
        setTo(normalizedCustomerEmail);
        setCc('');
        setBcc('');
        setSubject('');
        setBody('');
        setSelectedAttachments(['offer_pdf']);
        setIsDirty(false);
        setInitError(error instanceof Error ? error.message : 'Inicializacija komunikacije ni uspela.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [companyName, customerName, normalizedCustomerEmail, offerNumber, offerTotal, open, projectName, reloadKey]);

  const selectedTemplate = useMemo(
    () => templates.find((entry) => entry.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );

  const applyTemplate = (template: CommunicationTemplate | null, force = false) => {
    if (!template) {
      setSelectedTemplateId('');
      if (force || !isDirty) {
        setSelectedAttachments([]);
        setSubject('');
        setBody('');
      }
      return;
    }

    if (isDirty && !force) {
      const confirmed = window.confirm('Trenutno sporočilo je bilo ročno urejeno. Prepišem vsebino s predlogo?');
      if (!confirmed) {
        return;
      }
    }

    setSelectedTemplateId(template.id);
    setSubject(replacePlaceholders(template.subjectTemplate, placeholderContext));
    setBody(replacePlaceholders(template.bodyTemplate, placeholderContext));
    setSelectedAttachments(template.defaultAttachments ?? []);
    setIsDirty(false);
  };

  const toggleAttachment = (value: CommunicationAttachmentType, checked: boolean) => {
    setSelectedAttachments((prev) =>
      checked ? Array.from(new Set([...prev, value])) : prev.filter((entry) => entry !== value)
    );
    setIsDirty(true);
  };

  const attachmentsDisabled = !offerId;
  const senderDisabled = !senderSettings?.enabled;
  const missingCustomerEmail = !normalizedCustomerEmail;

  const handleSend = async () => {
    if (!offerId) {
      return;
    }

    setSending(true);
    try {
      await sendOfferCommunicationEmail(projectId, offerId, {
        to,
        cc,
        bcc,
        templateId: selectedTemplate?.id ?? null,
        templateKey: selectedTemplate?.key ?? null,
        subject,
        body,
        selectedAttachments,
      });
      await onSent();
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pošlji email stranki</DialogTitle>
          <DialogDescription>
            Sestavi sporočilo, izberi predlogo in pošlji priloge iz backend sistema.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Nalagam predloge in pošiljatelja ...
          </div>
        ) : (
          <div className="space-y-4">
            {initError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <div>{initError}</div>
                <Button type="button" variant="outline" className="mt-3" onClick={() => setReloadKey((value) => value + 1)}>
                  Poskusi znova
                </Button>
              </div>
            ) : null}
            {senderDisabled ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Pošiljanje ni omogočeno. Najprej nastavi pošiljatelja v nastavitvah komunikacije.
              </div>
            ) : null}
            {missingCustomerEmail ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Primarni email stranke ni nastavljen. Polje <strong>To</strong> ostaja prazno, dokler ne vnesete prejemnika.
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Predloga</span>
                <select
                  value={selectedTemplateId}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) {
                      setSelectedTemplateId('');
                      setSubject('');
                      setBody('');
                      setSelectedAttachments([]);
                      return;
                    }
                    applyTemplate(templates.find((entry) => entry.id === value) ?? null);
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Brez predloge</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <div>Pošiljatelj: {senderSettings?.senderName || '-'}</div>
                <div>Email: {senderSettings?.senderEmail || '-'}</div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm">
                <span className="font-medium">To</span>
                <Input
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setIsDirty(true);
                  }}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium">Cc</span>
                <Input
                  value={cc}
                  onChange={(event) => {
                    setCc(event.target.value);
                    setIsDirty(true);
                  }}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium">Bcc</span>
                <Input
                  value={bcc}
                  onChange={(event) => {
                    setBcc(event.target.value);
                    setIsDirty(true);
                  }}
                />
              </label>
            </div>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Zadeva</span>
              <Input
                value={subject}
                onChange={(event) => {
                  setSubject(event.target.value);
                  setIsDirty(true);
                }}
              />
            </label>
            <div className="space-y-2">
              <div className="text-sm font-medium">Vsebina</div>
              <Textarea
                rows={10}
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  setIsDirty(true);
                }}
              />
              {renderedFooter ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <div className="mb-2 font-medium text-foreground">Footer bo dodan samodejno</div>
                  <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{renderedFooter}</pre>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Priloge</div>
              <div className="flex flex-wrap gap-3">
                {ATTACHMENT_OPTIONS.map((attachment) => (
                  <label
                    key={attachment.value}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      attachmentsDisabled ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAttachments.includes(attachment.value)}
                      disabled={attachmentsDisabled}
                      onChange={(event) => toggleAttachment(attachment.value, event.target.checked)}
                    />
                    {attachment.label}
                  </label>
                ))}
              </div>
              {attachmentsDisabled ? (
                <p className="text-xs text-muted-foreground">Priloge bodo na voljo po shranjevanju ponudbe.</p>
              ) : null}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Prekliči
          </Button>
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || sending || senderDisabled || !offerId || !to.trim() || !subject.trim() || !body.trim()}
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Pošlji
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
