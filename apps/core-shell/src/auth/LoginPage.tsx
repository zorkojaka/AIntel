import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from './AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const goTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.location.reload();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.message ?? 'Prijava ni uspela.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Prijava</h1>
        <p>Vpišite e-pošto in geslo za dostop.</p>
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
          <label>
            Geslo
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
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error ? <div className="auth-error">{error}</div> : null}
          <button
            type="button"
            className="auth-link"
            onClick={() => goTo('/forgot-password')}
          >
            Pozabljeno geslo?
          </button>
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Prijavljam...' : 'Prijava'}
          </button>
        </form>
      </div>
    </div>
  );
};
