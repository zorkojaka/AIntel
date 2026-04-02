import { useEffect, useMemo, useState } from 'react';
import type { CommunicationAttachmentRecord, CommunicationMessage } from '@aintel/shared/types/communication';
import { ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { fetchCommunicationMessage, fetchOfferMessages } from './api';

function formatTimestamp(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '-';
  return new Intl.DateTimeFormat('sl-SI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(status: CommunicationMessage['status']) {
  return status === 'sent' ? 'Poslano' : 'Napaka';
}

function statusClassName(status: CommunicationMessage['status']) {
  return status === 'sent'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
    : 'border-destructive/30 bg-destructive/10 text-destructive';
}

function DetailField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={multiline ? 'whitespace-pre-wrap text-sm text-foreground' : 'text-sm text-foreground'}>
        {value || '-'}
      </div>
    </div>
  );
}

interface OfferSentMessagesTableProps {
  projectId: string;
  offerId: string | null;
  refreshKey?: number;
}

export function OfferSentMessagesTable({
  projectId,
  offerId,
  refreshKey = 0,
}: OfferSentMessagesTableProps) {
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CommunicationMessage>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!offerId) {
        setMessages([]);
        return;
      }
      setLoading(true);
      try {
        const next = await fetchOfferMessages(projectId, offerId);
        if (!active) return;
        setMessages(next);
      } catch {
        if (!active) return;
        setMessages([]);
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
  }, [offerId, projectId, refreshKey]);

  useEffect(() => {
    let active = true;
    const loadDetail = async () => {
      if (!expandedId || details[expandedId]) {
        return;
      }
      try {
        const detail = await fetchCommunicationMessage(projectId, expandedId);
        if (!active) return;
        setDetails((prev) => ({ ...prev, [expandedId]: detail }));
      } catch {
        if (!active) return;
      }
    };
    void loadDetail();
    return () => {
      active = false;
    };
  }, [details, expandedId, projectId]);

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Poslana sporočila</CardTitle>
        <CardDescription>Zgodovina poslanih emailov za izbrano verzijo ponudbe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Nalagam sporočila ...</p> : null}
        {!loading && !offerId ? (
          <p className="text-sm text-muted-foreground">Najprej izberi ali shrani ponudbo.</p>
        ) : null}
        {!loading && offerId && messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Za to ponudbo še ni poslanih sporočil.</p>
        ) : null}
        {hasMessages ? (
          <div className="space-y-3">
            {messages.map((message) => {
              const isExpanded = expandedId === message.id;
              const detail = details[message.id] ?? message;
              const recipients = message.to.join(', ') || '-';
              const subject = message.subjectFinal || '-';
              const template = message.templateKey ?? 'Brez predloge';
              const attachments = message.selectedAttachments;

              return (
                <div key={message.id} className="rounded-lg border border-border/70 bg-card">
                  <button
                    type="button"
                    onClick={() => setExpandedId((prev) => (prev === message.id ? null : message.id))}
                    className="w-full px-4 py-3 text-left"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                          <span className="text-sm font-medium text-foreground">
                            {formatTimestamp(message.sentAt ?? message.createdAt)}
                          </span>
                          <Badge className={statusClassName(message.status)}>{statusLabel(message.status)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {message.sentByUserId ? `Poslal: ${message.sentByUserId}` : 'Pošiljatelj ni naveden'}
                          </span>
                        </div>

                        <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Prejemnik
                            </div>
                            <div className="break-words text-sm text-foreground">{recipients}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Zadeva
                            </div>
                            <div className="line-clamp-2 break-words text-sm text-foreground">{subject}</div>
                          </div>
                        </div>

                        <div className="grid gap-2 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Predloga
                            </div>
                            <div className="break-words text-sm text-muted-foreground">{template}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Priloge
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {attachments.length > 0 ? (
                                attachments.slice(0, 3).map((attachment) => (
                                  <span
                                    key={`${message.id}-${attachment.refId}-${attachment.filename}`}
                                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
                                  >
                                    <Paperclip className="h-3 w-3 shrink-0" />
                                    <span className="max-w-[220px] truncate md:max-w-[260px]">{attachment.filename}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">Brez prilog</span>
                              )}
                              {attachments.length > 3 ? (
                                <span className="text-xs text-muted-foreground">+{attachments.length - 3} več</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end md:pl-4">
                        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          {isExpanded ? 'Skrij podrobnosti' : 'Pokaži podrobnosti'}
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-border/70 px-4 py-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <DetailField label="To" value={detail.to.join(', ') || '-'} />
                        <DetailField label="Template" value={detail.templateKey ?? 'Brez predloge'} />
                        {detail.cc?.length ? <DetailField label="Cc" value={detail.cc.join(', ')} /> : null}
                        {detail.bcc?.length ? <DetailField label="Bcc" value={detail.bcc.join(', ')} /> : null}
                        <DetailField label="Ustvarjeno" value={formatTimestamp(detail.createdAt)} />
                        <DetailField label="Poslano" value={formatTimestamp(detail.sentAt ?? null)} />
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                        <div className="space-y-4">
                          <DetailField label="Zadeva" value={detail.subjectFinal} multiline />
                          <div className="space-y-1">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Vsebina
                            </div>
                            <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 px-3 py-3 text-sm text-foreground">
                              {detail.bodyFinal || '-'}
                            </div>
                          </div>
                          {detail.errorMessage ? (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
                              <span className="font-medium">Napaka:</span> {detail.errorMessage}
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-1">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Priloge
                          </div>
                          <div className="space-y-2">
                            {detail.selectedAttachments.length > 0 ? (
                              detail.selectedAttachments.map((attachment) => (
                                <div
                                  key={`${detail.id}-${attachment.refId}-${attachment.filename}`}
                                  className="rounded-md border border-border bg-background px-3 py-2"
                                >
                                  <div className="break-words text-sm text-foreground">{attachment.filename}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">{attachment.type}</div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                                Brez prilog
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
