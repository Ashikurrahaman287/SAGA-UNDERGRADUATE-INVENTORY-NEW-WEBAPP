import health from '../../api/health';
import ready from '../../api/ready';
import { getServerEnv, isServerConfigurationReady } from '../../api/lib/env';
import { sendError } from '../../api/lib/response';

function responseMock(): {
  status: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const response = {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return response;
}

describe('API foundation', () => {
  it('returns a healthy API response with a request id', () => {
    const response = responseMock();
    health({ method: 'GET', headers: {} } as never, response as never);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        service: 'saga-inventory-api',
        requestId: expect.any(String),
      }),
    );
  });

  it('returns not ready without server configuration', () => {
    const original = process.env;
    process.env = {};
    const response = responseMock();
    ready({ method: 'GET', headers: {} } as never, response as never);
    expect(response.status).toHaveBeenCalledWith(503);
    process.env = original;
  });

  it('validates complete server configuration without exposing values', () => {
    const env = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    };
    expect(isServerConfigurationReady(env)).toBe(true);
    expect(getServerEnv(env)).toEqual(env);
  });

  it('uses the standard safe error shape', () => {
    const response = responseMock();
    sendError(response as never, 400, 'BAD_REQUEST', 'Invalid request.', 'request-1');
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'Invalid request.' },
      requestId: 'request-1',
    });
  });
});
