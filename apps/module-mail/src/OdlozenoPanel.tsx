import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { cancelScheduledEmail, fetchScheduledEmails, type ScheduledEmail, type ScheduledEmailStatus } from './api';

// Odložena sporočila: admin vidi vse, ostali svoja. Preklic je mogoč, dokler sporočilo čaka.

const STATUS_LABELS: Record<ScheduledEmailStatus, string> = {
  pending: 'Čaka',
  sending: 'Pošilja se',
  sent: 'Poslano',
  failed: 'Ni uspelo',
  cancelled: 'Preklicano',
};

const dateFmt = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function OdlozenoPanel() {
  const [jobs, setJobs] = useState<ScheduledEmail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setJobs(await fetchScheduledEmails());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri nalaganju.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (job: ScheduledEmail) => {
    if (!window.confirm(`Prekličem ${job.label.toLowerCase()} za ${job.to.join(', ') || job.projectId || 'prejemnika'}?`)) return;
    setBusyId(job.id);
    try {
      await cancelScheduledEmail(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preklic ni uspel.');
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const pending = jobs?.filter((job) => job.status === 'pending').length ?? 0;

  return (
    <>
      <div className="posta-filtri">
        <span className="posta-stevec">
          {jobs ? `${pending} čaka na pošiljanje · prikazanih zadnjih 30 dni` : ''}
        </span>
        <button type="button" onClick={() => void load()}>
          <RefreshCw size={13} /> Osveži
        </button>
      </div>
      {error ? <div className="posta-napaka">{error}</div> : null}
      {!jobs ? (
        <div className="posta-nalaganje">
          <Loader2 size={18} className="vrti" /> Nalagam …
        </div>
      ) : jobs.length === 0 ? (
        <p className="posta-prazno">Ni odloženih sporočil.</p>
      ) : (
        <div className="posta-seznam">
          {jobs.map((job) => (
            <div key={job.id} className={`posta-sporocilo posta-odlozeno--${job.status}`}>
              <div className="posta-sporocilo__glava">
                <Clock size={15} className={job.status === 'pending' ? 'posta-ikona--warn' : 'posta-ikona--muted'} />
                <span className="posta-sporocilo__od">{job.label}</span>
                <span className="posta-sporocilo__zadeva">
                  {job.to.join(', ') || 'privzeti prejemnik'}
                  {job.subject ? ` · ${job.subject}` : ''}
                  {job.actorName ? ` · ${job.actorName}` : ''}
                </span>
                {job.projectId ? (
                  <a className="posta-sporocilo__projekt" href={`/projects/${job.projectId}`}>
                    {job.projectId}
                  </a>
                ) : null}
                <span className="posta-sporocilo__datum">{dateFmt.format(new Date(job.scheduledAt))}</span>
                <span className="posta-odlozeno__status">{STATUS_LABELS[job.status]}</span>
                {job.status === 'pending' ? (
                  <button type="button" className="gumb-sekundarni" onClick={() => void cancel(job)} disabled={busyId === job.id}>
                    <XCircle size={14} /> Prekliči
                  </button>
                ) : null}
              </div>
              {job.status === 'failed' && job.error ? <div className="posta-sporocilo__telo posta-napaka-besedilo">{job.error}</div> : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
