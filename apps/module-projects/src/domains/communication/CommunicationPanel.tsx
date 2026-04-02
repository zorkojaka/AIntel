import { useEffect, useMemo, useState } from 'react';
import type { CommunicationEvent } from '@aintel/shared/types/communication';
import { Mail, ShieldCheck, Signature, StickyNote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { fetchCommunicationFeed } from './api';

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }
  return new Intl.DateTimeFormat('sl-SI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getEventIcon(type: CommunicationEvent['type']) {
  if (type === 'email_sent' || type === 'email_failed') return Mail;
  if (type === 'offer_confirmed') return ShieldCheck;
  if (type === 'signature_completed') return Signature;
  return StickyNote;
}

interface CommunicationPanelProps {
  projectId: string;
  refreshKey?: number;
}

export function CommunicationPanel({ projectId, refreshKey = 0 }: CommunicationPanelProps) {
  const [events, setEvents] = useState<CommunicationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const next = await fetchCommunicationFeed(projectId, 10);
        if (!active) return;
        setEvents(next);
      } catch {
        if (!active) return;
        setEvents([]);
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
  }, [projectId, refreshKey]);

  const empty = useMemo(() => !loading && events.length === 0, [events.length, loading]);

  return (
    <Card className="p-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-sm font-semibold">Komunikacija</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {loading ? <p className="text-sm text-muted-foreground">Nalagam komunikacijo ...</p> : null}
        {empty ? <p className="text-sm text-muted-foreground">Za ta projekt še ni komunikacijskih zapisov.</p> : null}
        {events.map((event) => {
          const Icon = getEventIcon(event.type);
          const isExpanded = expandedId === event.id;
          return (
            <div key={event.id} className="rounded-lg border border-border/70 px-3 py-3">
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === event.id ? null : event.id))}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{event.title}</span>
                  <span className="block text-xs text-muted-foreground">{formatTimestamp(event.timestamp)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{event.description}</span>
                </span>
              </button>
              {isExpanded ? (
                <div className="mt-3 space-y-2 border-t pt-3 text-xs text-muted-foreground">
                  {event.user ? <div>Uporabnik: {event.user}</div> : null}
                  {event.metadata?.to ? <div>Prejemnik: {event.metadata.to}</div> : null}
                  {event.metadata?.subject ? <div>Zadeva: {event.metadata.subject}</div> : null}
                  {event.metadata?.attachments ? <div>Priloge: {event.metadata.attachments}</div> : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {events.length > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setExpandedId(null)}>
            Strni podrobnosti
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
