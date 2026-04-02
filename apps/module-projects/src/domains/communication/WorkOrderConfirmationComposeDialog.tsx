import { useEffect, useMemo, useState } from 'react';
import type { CommunicationSenderSettings, CommunicationTemplate } from '@aintel/shared/types/communication';
import { renderCommunicationFooterText } from '../../../../../shared/utils/communication-footer';
import { Loader2 } from 'lucide-react';
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
  fetchCommunicationSenderSettings,
  fetchCommunicationTemplates,
  sendWorkOrderConfirmationCommunicationEmail,
} from './api';

interface WorkOrderConfirmationComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  workOrderId: string | null;
  customerName: string;
  customerEmail: string;
  projectName: string;
  workOrderIdentifier: string;
  confirmationDate: string;
  confirmationSignedAt?: string | null;
  canSendConfirmation?: boolean;
  companyName: string;
  onSent: () => Promise<void> | void;
}

function replacePlaceholders(template: string, context: Record<string, string>) {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, key) => context[key.trim()] ?? '');
}

export function WorkOrderConfirmationComposeDialog({
  open,
  onOpenChange,
  projectId,
  workOrderId,
  customerName,
  customerEmail,
  projectName,
  workOrderIdentifier,
  confirmationDate,
  confirmationSignedAt,
  canSendConfirmation,
  companyName,
  onSent,
}: WorkOrderConfirmationComposeDialogProps) {
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [senderSettings, setSenderSettings] = useState<CommunicationSenderSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const normalizedCustomerEmail = useMemo(() => customerEmail.trim(), [customerEmail]);
  const isSigned = Boolean(canSendConfirmation && confirmationSignedAt);

  const placeholderContext = useMemo(
    () => ({
      'customer.name': customerName || '',
      'customer.email': normalizedCustomerEmail,
      'project.name': projectName || '',
      'workOrder.identifier': workOrderIdentifier || '',
      'confirmation.date': confirmationDate || '',
      'company.name': companyName || '',
      'sender.name': senderSettings?.senderName ?? '',
      'sender.email': senderSettings?.senderEmail ?? '',
      'sender.phone': senderSettings?.senderPhone ?? '',
      'sender.role': senderSettings?.senderRole ?? '',
    }),
    [companyName, confirmationDate, customerName, normalizedCustomerEmail, projectName, senderSettings, workOrderIdentifier]
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
          fetchCommunicationTemplates('work_order_confirmation_send'),
          fetchCommunicationSenderSettings(),
        ]);
        if (!active) return;

        const activeTemplates = nextTemplates.filter((entry) => entry.isActive);
        const defaultTemplate = activeTemplates[0] ?? null;
        const initialContext = {
          'customer.name': customerName || '',
          'customer.email': normalizedCustomerEmail,
          'project.name': projectName || '',
          'workOrder.identifier': workOrderIdentifier || '',
          'confirmation.date': confirmationDate || '',
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
  }, [companyName, confirmationDate, customerName, normalizedCustomerEmail, open, projectName, reloadKey, workOrderIdentifier]);

  const selectedTemplate = useMemo(
    () => templates.find((entry) => entry.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );

  const applyTemplate = (template: CommunicationTemplate | null, force = false) => {
    if (!template) {
      setSelectedTemplateId('');
      if (force || !isDirty) {
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
    setIsDirty(false);
  };

  const senderDisabled = !senderSettings?.enabled;
  const missingCustomerEmail = !normalizedCustomerEmail;

  const handleSend = async () => {
    if (!workOrderId) {
      return;
    }

    setSending(true);
    try {
      await sendWorkOrderConfirmationCommunicationEmail(projectId, workOrderId, {
        to,
        cc,
        bcc,
        templateId: selectedTemplate?.id ?? null,
        templateKey: selectedTemplate?.key ?? null,
        subject,
        body,
        selectedAttachments: ['work_order_confirmation_pdf'],
      });
      toast.success('Email successfully sent');
      await onSent();
      onOpenChange(false);
    } catch (err: any) {
      if (err?.code === 'WORK_ORDER_NOT_SIGNED') {
        toast.error('Delovni nalog še ni podpisan');
        return;
      }

      toast.error(err?.message || 'Napaka pri pošiljanju');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pošlji email s potrdilom stranki</DialogTitle>
          <DialogDescription>
            Sporočilo uporablja namensko predlogo za potrdilo delovnega naloga in pripne podpisan PDF iz backend sistema.
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
            {!isSigned ? (
              <div className="rounded-md border border-orange-300 bg-orange-50 px-4 py-3 text-xs text-orange-900">
                Najprej podpiši delovni nalog.
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
            <label className="space-y-2 text-sm">
              <span className="font-medium">Vsebina</span>
              <Textarea
                rows={12}
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  setIsDirty(true);
                }}
              />
            </label>
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <div>Priloga: Potrdilo delovnega naloga {workOrderIdentifier || projectId}.pdf</div>
              {renderedFooter ? <div className="mt-2 whitespace-pre-wrap border-t border-border pt-2">{renderedFooter}</div> : null}
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
            disabled={loading || sending || senderDisabled || !to.trim() || !subject.trim() || !body.trim() || !workOrderId || !isSigned}
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pošiljam...
              </>
            ) : (
              'Pošlji email'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
