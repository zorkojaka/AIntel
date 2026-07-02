import { useEffect, useMemo, useState } from "react";
import type { CommunicationSenderSettings, CommunicationTemplate } from "@aintel/shared/types/communication";
import { renderCommunicationFooterText } from "../../../../../shared/utils/communication-footer";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  fetchCommunicationSenderSettings,
  fetchCommunicationTemplates,
  sendInvoiceCommunicationEmail,
} from "./api";

interface InvoiceCommunicationComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  invoiceVersionId: string | null;
  customerName: string;
  customerEmail: string;
  projectName: string;
  invoiceNumber: string;
  invoiceTotal: number;
  companyName: string;
  onSent: () => Promise<void> | void;
}

function replacePlaceholders(template: string, context: Record<string, string>) {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key) => context[key.trim()] ?? "");
}

function formatTotal(value: number) {
  return new Intl.NumberFormat("sl-SI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function buildDefaultSubject(invoiceNumber: string) {
  return `Račun ${invoiceNumber || ""}`.trim();
}

function buildDefaultBody(invoiceNumber: string) {
  return [
    "Spoštovani,",
    "",
    `v priponki vam pošiljamo račun${invoiceNumber ? ` ${invoiceNumber}` : ""}.`,
    "",
    "Lep pozdrav",
  ].join("\n");
}

export function InvoiceCommunicationComposeDialog({
  open,
  onOpenChange,
  projectId,
  invoiceVersionId,
  customerName,
  customerEmail,
  projectName,
  invoiceNumber,
  invoiceTotal,
  companyName,
  onSent,
}: InvoiceCommunicationComposeDialogProps) {
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [senderSettings, setSenderSettings] = useState<CommunicationSenderSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewLink, setReviewLink] = useState("");

  const normalizedCustomerEmail = useMemo(() => customerEmail.trim(), [customerEmail]);
  const invoiceTotalLabel = `${formatTotal(invoiceTotal)} EUR`;

  const placeholderContext = useMemo(
    () => ({
      "customer.name": customerName || "",
      "customer.email": normalizedCustomerEmail,
      "project.name": projectName || "",
      "invoice.number": invoiceNumber || "",
      "invoice.total": invoiceTotalLabel,
      "company.name": companyName || "",
      "sender.name": senderSettings?.senderName ?? "",
      "sender.email": senderSettings?.senderEmail ?? "",
      "sender.phone": senderSettings?.senderPhone ?? "",
      "sender.role": senderSettings?.senderRole ?? "",
      "review.link": reviewLink,
    }),
    [companyName, customerName, invoiceNumber, invoiceTotalLabel, normalizedCustomerEmail, projectName, senderSettings, reviewLink]
  );

  const renderedFooter = useMemo(
    () =>
      renderCommunicationFooterText(senderSettings?.emailFooterTemplate, {
        sender: {
          name: senderSettings?.senderName ?? "",
          email: senderSettings?.senderEmail ?? "",
          phone: senderSettings?.senderPhone ?? "",
          role: senderSettings?.senderRole ?? "",
        },
        company: {
          name: companyName || "",
          website: "",
          address: "",
          email: "",
          phone: "",
          logoUrl: "",
        },
      }),
    [companyName, senderSettings]
  );

  useEffect(() => {
    if (!open) return;

    let active = true;
    const load = async () => {
      setLoading(true);
      setInitError(null);
      setSendError(null);
      setSent(false);

      try {
        const [nextTemplates, nextSender] = await Promise.all([
          fetchCommunicationTemplates("invoice_send"),
          fetchCommunicationSenderSettings(),
        ]);
        let nextReviewLink = "";
        try {
          const reviewResponse = await fetch(`/api/projects/${projectId}/review-link`, { credentials: "include" });
          const reviewPayload = await reviewResponse.json();
          nextReviewLink = reviewPayload?.data?.url ?? "";
        } catch {
          nextReviewLink = "";
        }
        if (!active) return;
        setReviewLink(nextReviewLink);

        const activeTemplates = nextTemplates.filter((entry) => entry.isActive);
        const defaultTemplate = activeTemplates[0] ?? null;
        const initialContext = {
          "customer.name": customerName || "",
          "customer.email": normalizedCustomerEmail,
          "project.name": projectName || "",
          "invoice.number": invoiceNumber || "",
          "invoice.total": invoiceTotalLabel,
          "company.name": companyName || "",
          "sender.name": nextSender?.senderName ?? "",
          "sender.email": nextSender?.senderEmail ?? "",
          "sender.phone": nextSender?.senderPhone ?? "",
          "sender.role": nextSender?.senderRole ?? "",
          "review.link": nextReviewLink,
        };

        setTemplates(activeTemplates);
        setSenderSettings(nextSender);
        setSelectedTemplateId(defaultTemplate?.id ?? "");
        setTo(normalizedCustomerEmail);
        setCc(nextSender?.defaultCc ?? "");
        setBcc(nextSender?.defaultBcc ?? "");
        setSubject(defaultTemplate ? replacePlaceholders(defaultTemplate.subjectTemplate, initialContext) : buildDefaultSubject(invoiceNumber));
        setBody(defaultTemplate ? replacePlaceholders(defaultTemplate.bodyTemplate, initialContext) : buildDefaultBody(invoiceNumber));
        setIsDirty(false);
      } catch (error) {
        if (!active) return;
        setTemplates([]);
        setSenderSettings(null);
        setSelectedTemplateId("");
        setTo(normalizedCustomerEmail);
        setCc("");
        setBcc("");
        setSubject(buildDefaultSubject(invoiceNumber));
        setBody(buildDefaultBody(invoiceNumber));
        setIsDirty(false);
        setInitError(error instanceof Error ? error.message : "Inicializacija komunikacije ni uspela.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [companyName, customerName, invoiceNumber, invoiceTotalLabel, normalizedCustomerEmail, open, projectName, reloadKey]);

  const selectedTemplate = useMemo(
    () => templates.find((entry) => entry.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );

  const applyTemplate = (template: CommunicationTemplate | null) => {
    if (!template) {
      setSelectedTemplateId("");
      setSubject(buildDefaultSubject(invoiceNumber));
      setBody(buildDefaultBody(invoiceNumber));
      setIsDirty(false);
      return;
    }
    if (isDirty && !window.confirm("Trenutno sporočilo je bilo ročno urejeno. Prepišem vsebino s predlogo?")) {
      return;
    }
    setSelectedTemplateId(template.id);
    setSubject(replacePlaceholders(template.subjectTemplate, placeholderContext));
    setBody(replacePlaceholders(template.bodyTemplate, placeholderContext));
    setIsDirty(false);
  };

  const senderDisabled = !senderSettings?.enabled;
  const missingCustomerEmail = !normalizedCustomerEmail;

  const handleSend = async () => {
    if (!invoiceVersionId) return;
    setSending(true);
    setSendError(null);
    setSent(false);
    try {
      await sendInvoiceCommunicationEmail(projectId, invoiceVersionId, {
        to,
        cc,
        bcc,
        templateId: selectedTemplate?.id ?? null,
        templateKey: selectedTemplate?.key ?? null,
        subject,
        body,
        selectedAttachments: ["invoice_pdf"],
      });
      setSent(true);
      toast.success("Email z računom je bil uspešno poslan.");
      await onSent();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Emaila z računom ni bilo mogoče poslati.";
      setSendError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !sending && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-4 pb-3 pt-4 pr-12 sm:px-6 sm:pt-6">
          <DialogTitle>Pošlji email z računom</DialogTitle>
          <DialogDescription>Sestavi sporočilo, preveri prejemnike in pošlji račun iz backend sistema.</DialogDescription>
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
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{sendError}</div>
              ) : null}
              {sent ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Email z računom je bil uspešno poslan.
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Predloga</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => applyTemplate(templates.find((entry) => entry.id === event.target.value) ?? null)}
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
                  <div>Pošiljatelj: {senderSettings?.senderName || "-"}</div>
                  <div>Email: {senderSettings?.senderEmail || "-"}</div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2 text-sm">
                  <span className="font-medium">To</span>
                  <Input value={to} onChange={(event) => { setTo(event.target.value); setIsDirty(true); }} />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Cc</span>
                  <Input value={cc} onChange={(event) => { setCc(event.target.value); setIsDirty(true); }} />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Bcc</span>
                  <Input value={bcc} onChange={(event) => { setBcc(event.target.value); setIsDirty(true); }} />
                </label>
              </div>
              <label className="space-y-2 text-sm">
                <span className="font-medium">Zadeva</span>
                <Input value={subject} onChange={(event) => { setSubject(event.target.value); setIsDirty(true); }} />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium">Vsebina</span>
                <Textarea rows={10} value={body} onChange={(event) => { setBody(event.target.value); setIsDirty(true); }} />
              </label>
              <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <div>Priloga: Račun {invoiceNumber || invoiceVersionId}.pdf</div>
                {renderedFooter ? <div className="mt-2 whitespace-pre-wrap border-t border-border pt-2">{renderedFooter}</div> : null}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Prekliči
          </Button>
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || sending || sent || senderDisabled || !invoiceVersionId || !to.trim() || !subject.trim() || !body.trim()}
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {sending ? "Pošiljam" : sent ? "Poslano" : "Pošlji"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
