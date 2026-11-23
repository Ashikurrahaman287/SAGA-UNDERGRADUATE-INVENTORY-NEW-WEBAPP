import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WelcomePage } from '../../src/features/dashboard/WelcomePage';

it('renders the SAGA foundation shell', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WelcomePage />
    </QueryClientProvider>,
  );
  expect(screen.getByText('SAGA')).toBeInTheDocument();
  expect(screen.getByText('A steadier way to move your business forward.')).toBeInTheDocument();
});
