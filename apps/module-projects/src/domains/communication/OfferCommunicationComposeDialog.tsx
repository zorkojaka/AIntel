import { useEffect, useMemo, useState } from 'react';
import type {
  CommunicationAttachmentType,
  CommunicationMessage,
  CommunicationSenderSettings,
  CommunicationTemplate,
} from '@aintel/shared/types/communication';
import { renderCommunicationFooterText } from '../../../../../shared/utils/communication-footer';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  createCommunicationTemplate,
  fetchCommunicationSenderSettings,
  fetchCommunicationTemplates,
  fetchFollowUpDefaults,
  sendOfferCommunicationEmail,
} from './api';
import type { OfferVersionSummary } from '@aintel/shared/types/offers';

type SendStatus = 'idle' | 'sending' | 'queued' | 'sent' | 'failed';
type SendProgressContext = { offerId: string; subject: string; startedAtMs: number };
type SavedOfferEmailDraft = {
  templateId?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  selectedAttachments: CommunicationAttachmentType[];
  selectedOfferIds: string[];
  savedAt: string;
};

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
  offerVersions: OfferVersionSummary[];
  companyName: string;
  onSent: (result?: { queued?: boolean }, context?: SendProgressContext) => Promise<CommunicationMessage | null | void> | CommunicationMessage | null | void;
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

function templateKeyFromName(name: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `offer-send-${slug || 'predloga'}-${Date.now()}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function buildSavedDraftKey(projectId: string, offerId: string | null) {
  return `aintel:offer-email-draft:${projectId}:${offerId || 'unsaved'}`;
}

function readSavedOfferEmailDraft(key: string): SavedOfferEmailDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedOfferEmailDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : '',
      to: typeof parsed.to === 'string' ? parsed.to : '',
      cc: typeof parsed.cc === 'string' ? parsed.cc : '',
      bcc: typeof parsed.bcc === 'string' ? parsed.bcc : '',
      subject: typeof parsed.subject === 'string' ? parsed.subject : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
      selectedAttachments: Array.isArray(parsed.selectedAttachments)
        ? parsed.selectedAttachments.filter((entry): entry is CommunicationAttachmentType => entry === 'offer_pdf' || entry === 'project_pdf')
        : [],
      selectedOfferIds: Array.isArray(parsed.selectedOfferIds)
        ? parsed.selectedOfferIds.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        : [],
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
}

function formatSavedDraftTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('sl-SI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const ATTACHMENT_OPTIONS: Array<{ value: CommunicationAttachmentType; label: string }> = [
  { value: 'offer_pdf', label: 'PDF ponudbe' },
  { value: 'project_pdf', label: 'Opisi produktov' },
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
  offerVersions,
  companyName,
  onSent,
}: OfferCommunicationComposeDialogProps) {
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [senderSettings, setSenderSettings] = useState<CommunicationSenderSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [sendStatusText, setSendStatusText] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [isTemplateNameDialogOpen, setIsTemplateNameDialogOpen] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<CommunicationAttachmentType[]>([]);
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [savedDraftAt, setSavedDraftAt] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Follow-up ob pošiljanju: off → skrito, manual → neizbrano (potrdiš s kljukico),
  // auto → predizbrano. Dnevi predizpolnjeni iz nastavitev kolesa, ročno uredljivi.
  const [followUpMode, setFollowUpMode] = useState<'off' | 'manual' | 'auto'>('off');
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(7);

  const normalizedCustomerEmail = useMemo(() => customerEmail.trim(), [customerEmail]);
  const savedDraftKey = useMemo(() => buildSavedDraftKey(projectId, offerId), [offerId, projectId]);

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
        const [nextTemplates, nextSender, followUpDefaults] = await Promise.all([
          fetchCommunicationTemplates('offer_send'),
          fetchCommunicationSenderSettings(),
          fetchFollowUpDefaults().catch(() => ({ mode: 'off' as const, days: 7 })),
        ]);
        if (!active) return;

        setFollowUpMode(followUpDefaults.mode);
        setFollowUpDays(followUpDefaults.days);
        setFollowUpEnabled(followUpDefaults.mode === 'auto');

        const activeTemplates = nextTemplates.filter((entry) => entry.isActive);
        const defaultTemplate = activeTemplates[0] ?? null;
        const savedDraft = readSavedOfferEmailDraft(savedDraftKey);
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
        setSelectedTemplateId(savedDraft?.templateId ?? defaultTemplate?.id ?? '');
        setTo(savedDraft?.to ?? normalizedCustomerEmail);
        setCc(savedDraft?.cc ?? nextSender?.defaultCc ?? '');
        setBcc(savedDraft?.bcc ?? nextSender?.defaultBcc ?? '');
        setSubject(savedDraft?.subject ?? (defaultTemplate ? replacePlaceholders(defaultTemplate.subjectTemplate, initialContext) : ''));
        setBody(savedDraft?.body ?? (defaultTemplate ? replacePlaceholders(defaultTemplate.bodyTemplate, initialContext) : ''));
        setSelectedAttachments(savedDraft?.selectedAttachments ?? defaultTemplate?.defaultAttachments ?? ['offer_pdf']);
        setSelectedOfferIds(savedDraft?.selectedOfferIds.length ? savedDraft.selectedOfferIds : offerId ? [offerId] : []);
        setSavedDraftAt(savedDraft?.savedAt || null);
        setIsDirty(Boolean(savedDraft));
        setSendError(null);
        setSendStatus('idle');
        setSendStatusText('');
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
        setSelectedOfferIds(offerId ? [offerId] : []);
        setSavedDraftAt(null);
        setIsDirty(false);
        setSendError(null);
        setSendStatus('idle');
        setSendStatusText('');
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
  }, [companyName, customerName, normalizedCustomerEmail, offerId, offerNumber, offerTotal, open, projectName, reloadKey, savedDraftKey]);

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

  const toggleOfferVersion = (versionId: string, checked: boolean) => {
    setSelectedOfferIds((prev) =>
      checked ? Array.from(new Set([...prev, versionId])) : prev.filter((entry) => entry !== versionId)
    );
    setIsDirty(true);
  };

  const openSaveTemplateDialog = () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Zadeva in vsebina sta obvezni za shranjevanje predloge.');
      return;
    }
    setTemplateNameDraft(selectedTemplate?.name ? `${selectedTemplate.name} kopija` : `${offerNumber || 'Ponudba'} email`);
    setIsTemplateNameDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    const templateName = templateNameDraft.trim();
    if (!templateName) {
      toast.error('Ime predloge je obvezno.');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error('Zadeva in vsebina sta obvezni za shranjevanje predloge.');
      return;
    }

    setSavingTemplate(true);
    try {
      const created = await createCommunicationTemplate({
        key: templateKeyFromName(templateName),
        name: templateName,
        category: 'offer_send',
        subjectTemplate: subject,
        bodyTemplate: body,
        defaultAttachments: selectedAttachments,
        isActive: true,
      });
      setTemplates((prev) => [...prev.filter((entry) => entry.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name, 'sl')));
      setSelectedTemplateId(created.id);
      setIsTemplateNameDialogOpen(false);
      setIsDirty(false);
      toast.success('Predloga shranjena.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Predloge ni bilo mogoče shraniti.'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSaveDraft = () => {
    if (!offerId) {
      toast.error('Osnutek lahko shraniš po shranjevanju ponudbe.');
      return;
    }
    const savedAt = new Date().toISOString();
    const draft: SavedOfferEmailDraft = {
      templateId: selectedTemplateId,
      to,
      cc,
      bcc,
      subject,
      body,
      selectedAttachments,
      selectedOfferIds,
      savedAt,
    };
    try {
      window.localStorage.setItem(savedDraftKey, JSON.stringify(draft));
      setSavedDraftAt(savedAt);
      setIsDirty(false);
      toast.success('Osnutek emaila shranjen.');
    } catch {
      toast.error('Osnutka emaila ni bilo mogoče shraniti.');
    }
  };

  const clearSavedDraft = () => {
    try {
      window.localStorage.removeItem(savedDraftKey);
    } catch {
      // Local draft cleanup is best-effort only.
    }
    setSavedDraftAt(null);
  };

  const attachmentsDisabled = !offerId;
  const offerSelectionDisabled = !offerId;
  const senderDisabled = !senderSettings?.enabled;
  const missingCustomerEmail = !normalizedCustomerEmail;
  const hasOfferAttachment = selectedAttachments.some((entry) => entry === 'offer_pdf' || entry === 'project_pdf');

  const handleSend = async () => {
    if (!offerId) {
      return;
    }

    const startedAtMs = Date.now();
    const subjectAtSend = subject.trim();
    setSendError(null);
    setSendStatus('sending');
    setSendStatusText('Pripravljam pošiljanje emaila ...');
    setSending(true);
    try {
      const result = await sendOfferCommunicationEmail(projectId, offerId, {
        to,
        cc,
        bcc,
        templateId: selectedTemplate?.id ?? null,
        templateKey: selectedTemplate?.key ?? null,
        subject,
        body,
        selectedAttachments,
        selectedOfferIds,
        ...(followUpMode !== 'off'
          ? { followUp: { enabled: followUpEnabled, days: followUpDays } }
          : {}),
      });
      if (result.queued) {
        setSendStatus('queued');
        setSendStatusText('Pošiljanje emaila se je začelo. Pripravljam PDF priponke in čakam na zaključek ...');
        setSending(false);
        const message = await onSent(result, { offerId, subject: subjectAtSend, startedAtMs });
        if (!message) return;
        if (message.status === 'sent') {
          setSendStatus('sent');
          setSendStatusText('Email je bil uspešno poslan.');
          clearSavedDraft();
          setIsDirty(false);
          return;
        }
        setSendStatus('failed');
        setSendStatusText('Pošiljanje emaila ni uspelo.');
        setSendError(message.errorMessage || 'Pošiljanje emaila ni uspelo.');
        return;
      }

      await onSent(result);
      setSendStatus('sent');
      setSendStatusText('Email je bil uspešno poslan.');
      clearSavedDraft();
      setIsDirty(false);
    } catch (error) {
      setSendStatus('failed');
      setSendStatusText('Pošiljanje emaila ni uspelo.');
      setSendError(getErrorMessage(error, 'Emaila ni bilo mogoče poslati.'));
    } finally {
      setSending(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && sending) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        hideCloseButton={sending}
        onEscapeKeyDown={(event) => {
          if (sending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader className="px-4 pb-3 pt-4 pr-12 sm:px-6 sm:pt-6">
          <DialogTitle>Pošlji email stranki</DialogTitle>
          <DialogDescription>
            Sestavi sporočilo, izberi predlogo in pošlji priloge iz backend sistema.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
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
            {sendError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {sendError}
              </div>
            ) : null}
            {sendStatus !== 'idle' ? (
              <div
                className={`rounded-md border px-4 py-3 text-sm ${
                  sendStatus === 'sent'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : sendStatus === 'failed'
                      ? 'border-destructive/30 bg-destructive/5 text-destructive'
                      : 'border-sky-200 bg-sky-50 text-sky-900'
                }`}
              >
                <div className="mb-2 flex items-center gap-2 font-medium">
                  {sendStatus === 'sending' || sendStatus === 'queued' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {sendStatusText}
                </div>
                {sendStatus === 'sending' || sendStatus === 'queued' ? (
                  <>
                    <div className="h-2 overflow-hidden rounded-full bg-sky-100">
                      <div className="h-full w-2/3 animate-pulse rounded-full bg-sky-500" />
                    </div>
                    <div className="mt-2 text-xs text-sky-800">
                      Pri ponudbah z več slikami lahko traja dlje. Okno med pošiljanjem ostane odprto do zaključka.
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            {savedDraftAt ? (
              <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                Shranjen osnutek: {formatSavedDraftTime(savedDraftAt)}
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block space-y-2 text-sm">
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openSaveTemplateDialog}
                  disabled={loading || sending || savingTemplate || !subject.trim() || !body.trim()}
                >
                  {savingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Shrani kot predlogo
                </Button>
              </div>
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
              <div className="text-sm font-medium">Verzije ponudb v emailu</div>
              <div className="grid gap-2 md:grid-cols-2">
                {offerVersions.map((version) => (
                  <label
                    key={version._id}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                      offerSelectionDisabled ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedOfferIds.includes(version._id)}
                      disabled={offerSelectionDisabled}
                      onChange={(event) => toggleOfferVersion(version._id, event.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{version.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {version.documentNumber || `Verzija ${version.versionNumber}`} - {formatTotal(version.totalWithVat ?? version.totalGrossAfterDiscount ?? version.totalGross)} EUR
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {hasOfferAttachment && selectedOfferIds.length === 0 ? (
                <p className="text-xs text-destructive">Za priloge izberi vsaj eno verzijo ponudbe.</p>
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
            {followUpMode !== 'off' ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Follow-up</div>
                <label className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={followUpEnabled}
                    onChange={(event) => setFollowUpEnabled(event.target.checked)}
                  />
                  <span>Če ne bo odgovora, me spomni čez</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={followUpDays}
                    disabled={!followUpEnabled}
                    onChange={(event) => setFollowUpDays(Math.max(1, Math.min(90, Number(event.target.value) || 1)))}
                    className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <span>dni (opravilo nastane takoj, ob odgovoru stranke se samo zapre)</span>
                </label>
              </div>
            ) : null}
          </div>
        )}
        </div>
        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={loading || sending || !offerId}>
            <Save className="mr-2 h-4 w-4" />
            Shrani osnutek
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Prekliči
          </Button>
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              loading ||
              sending ||
              sendStatus === 'queued' ||
              sendStatus === 'sent' ||
              senderDisabled ||
              !offerId ||
              !to.trim() ||
              !subject.trim() ||
              !body.trim() ||
              (hasOfferAttachment && selectedOfferIds.length === 0)
            }
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {sending ? 'Pošiljam' : sendStatus === 'sent' ? 'Poslano' : 'Pošlji'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog
      open={isTemplateNameDialogOpen}
      onOpenChange={(nextOpen) => {
        if (!savingTemplate) setIsTemplateNameDialogOpen(nextOpen);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton={savingTemplate}
        onEscapeKeyDown={(event) => {
          if (savingTemplate) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (savingTemplate) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Shrani predlogo</DialogTitle>
          <DialogDescription>
            Trenutna zadeva, vsebina in izbrane priloge bodo shranjene kot nova predloga za pošiljanje ponudb.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Ime predloge</span>
          <Input
            value={templateNameDraft}
            onChange={(event) => setTemplateNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSaveTemplate();
              }
            }}
            disabled={savingTemplate}
            autoFocus
          />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsTemplateNameDialogOpen(false)} disabled={savingTemplate}>
            Prekliči
          </Button>
          <Button type="button" onClick={() => void handleSaveTemplate()} disabled={savingTemplate || !templateNameDraft.trim()}>
            {savingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Shrani
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
