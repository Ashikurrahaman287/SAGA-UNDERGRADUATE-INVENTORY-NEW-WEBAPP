import { ArrowLeft, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './use-auth';

export function ForgotPasswordPage(): ReactElement {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error();
      setSent(true);
    } catch {
      setError('We could not process that request. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your account email and we will send recovery instructions."
    >
      <form className="space-y-5" onSubmit={submit}>
        {sent ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800">
            If that account exists, password recovery instructions have been sent.
          </div>
        ) : (
          <>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Account identity
              </span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none ring-teal-500 focus:ring-2"
                placeholder="you@example.com"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <button
              disabled={loading || !auth.csrfToken}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading && <LoaderCircle className="animate-spin" size={18} />}Send recovery link
            </button>
          </>
        )}
      </form>
      <BackToLogin />
    </AuthCard>
  );
}

export function ResetPasswordPage(): ReactElement {
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setError('The recovery link is invalid, expired, or the password is too weak.');
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/app'), 800);
  }
  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Use at least 12 characters with upper, lower, and numeric characters."
    >
      {done ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          Password updated. Returning to your workspace...
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">New password</span>
            <input
              required
              minLength={12}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Confirm password</span>
            <input
              required
              minLength={12}
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          <button className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white">
            Update password
          </button>
        </form>
      )}
    </AuthCard>
  );
}

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f8] px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
            <KeyRound size={19} />
          </div>
          <div>
            <p className="text-sm font-bold tracking-[0.2em] text-teal-700">SAGA</p>
            <p className="text-xs text-slate-500">Inventory Management</p>
          </div>
        </div>
        <div className="mb-7">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-teal-700">
            <ShieldCheck size={16} /> Account security
          </p>
          <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
function BackToLogin(): ReactElement {
  return (
    <Link
      to="/login"
      className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-teal-700"
    >
      <ArrowLeft size={16} /> Back to sign in
    </Link>
  );
}
