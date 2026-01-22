import React, { useState } from 'react';

type ResetResponse = {
  resetUrl?: string;
  expiresAt?: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    const error = payload?.error ?? 'Prišlo je do napake';
    throw new Error(error);
  }
  return payload?.data as T;
}

export const ResetRequestPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setResetUrl(null);
    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await parseResponse<ResetResponse>(response);
      if (data?.resetUrl) {
        setResetUrl(data.resetUrl);
      }
      setMessage('Če račun obstaja, boste prejeli nadaljnja navodila.');
    } catch (err: any) {
      setMessage(err?.message ?? 'Prišlo je do napake.');
    } finally {
      setSubmitting(false);
    }
  };

  const goTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.location.reload();
  };

  const handleCopy = async () => {
    if (!resetUrl) return;
    try {
      await navigator.clipboard.writeText(resetUrl);
      setMessage('Povezava je kopirana.');
    } catch {
      setMessage('Kopiranje ni uspelo.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Ponastavitev gesla</h1>
        <p>Vpišite e-pošto in prejeli boste navodila za nastavitev gesla.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ana@example.com"
              required
            />
          </label>
          {message ? <div className="auth-note">{message}</div> : null}
          {resetUrl ? (
            <div className="auth-reset-link">
              <input type="text" value={resetUrl} readOnly />
              <button type="button" className="auth-link" onClick={handleCopy}>
                Kopiraj povezavo
              </button>
            </div>
          ) : null}
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Pošiljam...' : 'Pošlji povezavo'}
          </button>
          <button type="button" className="auth-link" onClick={() => goTo('/login')}>
            Nazaj na prijavo
          </button>
        </form>
      </div>
    </div>
  );
};
