import { describe, expect, it, vi } from 'vitest';
import {
  normalizeBangladeshPhone,
  estimateSmsSegments,
  redactSwiftSmsUrl,
  sanitizeProviderResponse,
  swiftSmsError,
  getSwiftSmsBalance,
} from '../../api/_lib/swiftsms';

describe('communications provider safety', () => {
  it('normalizes Bangladeshi phone numbers', () => {
    expect(normalizeBangladeshPhone('+8801712345678')).toBe('01712345678');
    expect(normalizeBangladeshPhone('8801812345678')).toBe('01812345678');
    expect(normalizeBangladeshPhone('01712345678')).toBe('01712345678');
    expect(normalizeBangladeshPhone('12345')).toBeNull();
  });

  it('estimates ASCII and Unicode segment counts', () => {
    expect(estimateSmsSegments('Hello')).toEqual({ encoding: 'GSM-7', segments: 1 });
    expect(estimateSmsSegments('নমস্কার')).toEqual({ encoding: 'UCS-2', segments: 1 });
  });

  it('redacts API keys from URLs and provider objects', () => {
    expect(redactSwiftSmsUrl('https://example.com/send?apikey=secret&x=1')).not.toContain('secret');
    expect(sanitizeProviderResponse({ apikey: 'secret', code: '1007' })).toEqual({ code: '1007' });
  });

  it('maps transient and terminal SwiftSMS codes', () => {
    expect(swiftSmsError('1005').retryable).toBe(true);
    expect(swiftSmsError('1007').retryable).toBe(false);
    expect(swiftSmsError('1012').message).toContain('Invalid Phone');
  });

  it('parses live balance JSON from a mocked provider', async () => {
    process.env.SWIFTSMS_API_KEY = 'test-only-key';
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ available: 798, used: 958 }), { status: 200 }),
      );
    await expect(getSwiftSmsBalance(mockFetch as typeof fetch)).resolves.toEqual({
      available: 798,
      used: 958,
    });
  });
});
