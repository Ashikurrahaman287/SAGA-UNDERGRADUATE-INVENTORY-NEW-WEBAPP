import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type AuthRole } from './use-auth';

type OrganizationOption = { id: string; name: string; role: AuthRole };
const roles: Array<{ value: AuthRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'rider', label: 'Rider' },
];

export function LoginPage(): ReactElement {
  const navigate = useNavigate();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AuthRole>('admin');
  const [organizationId, setOrganizationId] = useState('');
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify({
          email,
          password,
          role,
          organizationId: organizationId || undefined,
          remember,
        }),
      });
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
        organizations?: OrganizationOption[];
      };
      if (response.status === 409 && body.error?.code === 'ORGANIZATION_SELECTION_REQUIRED') {
        setOrganizations(body.organizations || []);
        setError('Select the organization for this session.');
        return;
      }
      if (!response.ok) {
        setError(body.error?.message || 'Unable to sign in. Check your details and try again.');
        return;
      }
      await auth.refresh();
      navigate('/app', { replace: true });
    } catch {
      setError('The authentication service is unavailable. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden flex-col justify-between bg-slate-950 p-10 text-white lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600">
                <KeyRound size={20} />
              </div>
              <div>
                <p className="text-sm font-bold tracking-[0.2em]">SAGA</p>
                <p className="text-xs text-slate-400">Inventory Management</p>
              </div>
            </div>
            <div className="mt-28 max-w-md">
              <p className="text-sm font-semibold text-teal-300">A secure operational home</p>
              <h1 className="mt-4 text-5xl font-semibold leading-tight">
                Good work starts with a clear handoff.
              </h1>
              <p className="mt-6 leading-7 text-slate-400">
                Sign in to continue to the SAGA workspace for your organization.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">SAGA Inventory Foundation v0.1.0</p>
        </section>
        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
                  <KeyRound size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold tracking-[0.2em] text-teal-700">SAGA</p>
                  <p className="text-xs text-slate-500">Inventory Management</p>
                </div>
              </div>
            </div>
            <div className="mb-8">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-teal-700">
                <ShieldCheck size={17} /> Secure sign in
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-500">
                Use your individual account to access your workspace.
              </p>
            </div>
            <form className="space-y-5" onSubmit={submit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Account identity
                </span>
                <input
                  required
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none ring-teal-500 focus:ring-2"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
                <span className="relative block">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 pr-11 text-sm outline-none ring-teal-500 focus:ring-2"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">Sign in as</legend>
                <div className="grid grid-cols-3 gap-2">
                  {roles.map((item) => (
                    <label
                      key={item.value}
                      className={`cursor-pointer rounded-lg border px-3 py-3 text-center text-sm font-medium transition-colors ${role === item.value ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="role"
                        value={item.value}
                        checked={role === item.value}
                        onChange={() => {
                          setRole(item.value);
                          setOrganizations([]);
                        }}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {organizations.length > 0 && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Organization
                  </span>
                  <select
                    required
                    value={organizationId}
                    onChange={(event) => setOrganizationId(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none ring-teal-500 focus:ring-2"
                  >
                    <option value="">Select an organization</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    className="h-4 w-4 accent-teal-700"
                  />{' '}
                  Keep session active
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm font-semibold text-teal-700 hover:text-teal-900"
                >
                  Forgot password?
                </Link>
              </div>
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800"
                >
                  {error}
                </div>
              )}
              <button
                disabled={loading || !auth.csrfToken}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <LockKeyhole size={18} />
                )}{' '}
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
