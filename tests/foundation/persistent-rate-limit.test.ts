import type { VercelRequest } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('../../api/lib/supabase', () => ({
  getSupabaseServerClient: () => ({ rpc: rpcMock }),
}));

import { consumeLoginLimit } from '../../api/lib/auth/security';

const request = {
  headers: { 'x-forwarded-for': '203.0.113.10' },
  socket: { remoteAddress: '203.0.113.10' },
} as unknown as VercelRequest;

describe('persistent login rate limiting', () => {
  beforeEach(() => rpcMock.mockReset());

  it('uses the shared database RPC with a hashed identity key', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 24 }],
      error: null,
    });
    await expect(consumeLoginLimit(request, 'ADMIN@example.com')).resolves.toEqual({
      allowed: true,
      retryAfter: 24,
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'consume_auth_rate_limit',
      expect.objectContaining({
        p_rate_key: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_limit: 8,
        p_window_seconds: 900,
      }),
    );
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain('admin@example.com');
  });

  it('fails closed if the persistent limiter errors or returns no row', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('database unavailable') });
    await expect(consumeLoginLimit(request, 'user@example.com')).resolves.toEqual({
      allowed: false,
      retryAfter: 60,
    });
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await expect(consumeLoginLimit(request, 'user@example.com')).resolves.toEqual({
      allowed: false,
      retryAfter: 60,
    });
  });
});
