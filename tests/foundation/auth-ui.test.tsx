import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/features/auth/auth-context';
import { LoginPage } from '../../src/features/auth/LoginPage';

function renderLogin(): void {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

it('renders accessible login controls after an unauthenticated session check', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'csrf-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), { status: 200 }),
      ),
  );
  renderLogin();
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  expect(screen.getByLabelText('Account identity')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Admin' })).toBeInTheDocument();
});

it('toggles password visibility without leaving the form', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'csrf-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), { status: 200 }),
      ),
  );
  renderLogin();
  await screen.findByRole('heading', { name: 'Welcome back' });
  const password = screen.getByPlaceholderText('Enter your password');
  await userEvent.type(password, 'temporary-password');
  await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
  await waitFor(() => expect(password).toHaveAttribute('type', 'text'));
  expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
});
