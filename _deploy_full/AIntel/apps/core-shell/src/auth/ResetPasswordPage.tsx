import React, { useMemo, useState } from 'react';

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    const error = payload?.error ?? 'Prišlo je do napake';
    throw new Error(error);
  }
  return payload?.data as T;
}

export const ResetPasswordPage: React.FC = () => {
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') ?? '';
  }, []);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      await parseResponse(response);
      setMessage('Geslo je posodobljeno. Lahko se prijavite.');
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

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Ponastavitev gesla</h1>
          <p>Manjka token za ponastavitev gesla.</p>
          <button type="button" className="auth-link" onClick={() => goTo('/login')}>
            Nazaj na prijavo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Novo geslo</h1>
        <p>Vnesite novo geslo za svoj račun.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Novo geslo
            <div className="auth-input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="auth-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Skrij geslo' : 'Prikaži geslo'}
              >
                {showPassword ? 'Skrij' : 'Prikaži'}
              </button>
            </div>
          </label>
          {message ? <div className="auth-note">{message}</div> : null}
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Shranjujem...' : 'Shrani geslo'}
          </button>
          <button type="button" className="auth-link" onClick={() => goTo('/login')}>
            Nazaj na prijavo
          </button>
        </form>
      </div>
    </div>
  );
};
