import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Inbox, Link2, Loader2, Mail, MailQuestion, RefreshCw, XCircle } from 'lucide-react';
import {
  fetchEmailMessages,
  ignoreEmail,
  linkEmailToProject,
  runEmailIngest,
  type EmailListResponse,
  type EmailMessage,
  type EmailStatus,
} from './api';
import './styles.css';

// AIN-P1-14: resolve center — dohodna prodajna pošta znotraj AIntela.
// Kaj je prišlo, na kateri projekt spada, kaj še čaka povezavo.

const FILTERS: Array<{ value: EmailStatus | ''; label: string }> = [
  { value: '', label: 'Vse' },
  { value: 'matched', label: 'Povezano' },
  { value: 'unmatched', label: 'Čaka povezavo' },
  { value: 'ignored', label: 'Prezrto' },
];

const MATCHED_BY_LABELS: Record<string, string> = {
  reply: 'odgovor na naš mail',
  'client-email': 'e-naslov stranke',
  'document-number': 'številka dokumenta',
  manual: 'ročno povezano',
};

const dateFmt = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function PostaPage() {
  const [data, setData] = useState<EmailListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EmailStatus | ''>('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEmailMessages({ status: statusFilter || undefined, q: search || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const messages = data?.messages ?? [];
  const ingest = data?.ingest;

  const counts = useMemo(() => {
    const unmatched = messages.filter((message) => message.status === 'unmatched').length;
    return { total: messages.length, unmatched };
  }, [messages]);

  const runIngestNow = async () => {
    setIngesting(true);
    setError(null);
    try {
      await runEmailIngest();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Branje ni uspelo.');
    } finally {
      setIngesting(false);
    }
  };

  const link = async (message: EmailMessage) => {
    const projectId = window.prompt('Na kateri projekt povežem ta e-mail? (npr. PRJ-207)', message.match?.projectId ?? 'PRJ-');
    if (!projectId?.trim()) return;
    setBusyId(message._id);
    try {
      await linkEmailToProject(message._id, projectId.trim().toUpperCase());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Povezava ni uspela.');
    } finally {
      setBusyId(null);
    }
  };

  const ignore = async (message: EmailMessage) => {
    setBusyId(message._id);
    try {
      await ignoreEmail(message._id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ni uspelo.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="posta-stran">
      <div className="posta-glava">
        <div>
          <h1>Pošta</h1>
          <p className="posta-podnaslov">
            Dohodna prodajna pošta ({ingest?.user ?? 'nabiralnik ni nastavljen'}) — kaj je prišlo, kam spada, kaj čaka
            povezavo.
          </p>
        </div>
        <div className="posta-glava__akcije">
          <button type="button" className="gumb-sekundarni" onClick={() => void load()}>
            <RefreshCw size={15} /> Osveži
          </button>
          <button type="button" className="gumb-primarni" onClick={() => void runIngestNow()} disabled={ingesting || !ingest?.configured}>
            {ingesting ? <Loader2 size={15} className="vrti" /> : <Inbox size={15} />} Preberi nabiralnik
          </button>
        </div>
      </div>

      {ingest && !ingest.configured ? (
        <div className="posta-obvestilo">
          Nabiralnik še ni nastavljen (IMAP podatki v backend .env) ali pa je pravilo »Branje prodajnega nabiralnika«
          izklopljeno v Nastavitve → Opravila.
        </div>
      ) : null}
      {ingest?.lastError ? <div className="posta-napaka">Zadnja napaka branja: {ingest.lastError}</div> : null}
      {error ? <div className="posta-napaka">{error}</div> : null}

      <div className="posta-filtri">
        {FILTERS.map((filter) => (
          <button
            key={filter.value || 'all'}
            type="button"
            className={statusFilter === filter.value ? 'is-active' : ''}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
        <input
          type="search"
          placeholder="Išči po pošiljatelju ali zadevi …"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="posta-stevec">
          {counts.total} sporočil{counts.unmatched > 0 ? ` · ${counts.unmatched} čaka povezavo` : ''}
          {ingest?.lastRunAt ? ` · zadnje branje ${dateFmt.format(new Date(ingest.lastRunAt))}` : ''}
        </span>
      </div>

      {loading ? (
        <div className="posta-nalaganje">
          <Loader2 size={18} className="vrti" /> Nalagam …
        </div>
      ) : messages.length === 0 ? (
        <p className="posta-prazno">Ni sporočil za izbrani filter.</p>
      ) : (
        <div className="posta-seznam">
          {messages.map((message) => {
            const open = openId === message._id;
            const busy = busyId === message._id;
            return (
              <div key={message._id} className={`posta-sporocilo posta-sporocilo--${message.status}`}>
                <button type="button" className="posta-sporocilo__glava" onClick={() => setOpenId(open ? null : message._id)}>
                  {message.status === 'matched' ? (
                    <CheckCircle2 size={15} className="posta-ikona posta-ikona--ok" />
                  ) : message.status === 'ignored' ? (
                    <XCircle size={15} className="posta-ikona posta-ikona--muted" />
                  ) : (
                    <MailQuestion size={15} className="posta-ikona posta-ikona--warn" />
                  )}
                  <span className="posta-sporocilo__od">{message.fromName || message.fromAddress}</span>
                  <span className="posta-sporocilo__zadeva">{message.subject || '(brez zadeve)'}</span>
                  {message.match?.projectId ? (
                    <span className="posta-sporocilo__projekt">{message.match.projectId}</span>
                  ) : null}
                  <span className="posta-sporocilo__datum">{dateFmt.format(new Date(message.date))}</span>
                </button>
                {open ? (
                  <div className="posta-sporocilo__telo">
                    <div className="posta-sporocilo__meta">
                      <Mail size={13} /> {message.fromAddress}
                      {message.match?.matchedBy ? <em> · {MATCHED_BY_LABELS[message.match.matchedBy]}</em> : null}
                      {message.attachmentsMeta.length > 0 ? (
                        <em> · {message.attachmentsMeta.length} prilog</em>
                      ) : null}
                    </div>
                    <pre className="posta-sporocilo__besedilo">{message.text || '(prazno sporočilo)'}</pre>
                    <div className="posta-sporocilo__akcije">
                      {message.match?.projectId ? (
                        <a className="gumb-sekundarni" href={`/projects/${message.match.projectId}`}>
                          Odpri projekt {message.match.projectId}
                        </a>
                      ) : null}
                      <button type="button" className="gumb-sekundarni" onClick={() => void link(message)} disabled={busy}>
                        <Link2 size={14} /> {message.match?.projectId ? 'Poveži drugam' : 'Poveži na projekt'}
                      </button>
                      {message.status !== 'ignored' ? (
                        <button type="button" className="gumb-sekundarni" onClick={() => void ignore(message)} disabled={busy}>
                          <XCircle size={14} /> Prezri
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
