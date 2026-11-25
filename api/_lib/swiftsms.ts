const SWIFTSMS_ERROR_CODES: Record<string, { message: string; retryable: boolean }> = {
  '1002': { message: 'Sender Id / Masking Not Found', retryable: false },
  '1003': { message: 'API Not Found', retryable: false },
  '1004': { message: 'SPAM Detected in SMS Content', retryable: false },
  '1005': { message: 'Internal Server Error', retryable: true },
  '1006': { message: 'Internal Service Error', retryable: true },
  '1007': { message: 'Balance Insufficient (Recharge Needed)', retryable: false },
  '1008': { message: 'Message body is empty', retryable: false },
  '1009': { message: 'Message Type Not Set', retryable: false },
  '1010': { message: 'Invalid User & Password / Authentication Failed', retryable: false },
  '1011': { message: 'Invalid User Id', retryable: false },
  '1012': { message: 'Invalid Phone Number', retryable: false },
  '1013': { message: 'API Rate Limit Exceeded', retryable: true },
  '1014': { message: 'No matching template found', retryable: false },
  '1015': { message: 'SMS Content Moderation Validation Failed', retryable: false },
};

export function normalizeBangladeshPhone(value: string): string | null {
  let digits = value.trim().replace(/[^0-9]/g, '');
  if (digits.startsWith('880') && digits.length === 13) digits = digits.slice(2);
  if (digits.startsWith('880') && digits.length === 13) digits = `0${digits.slice(3)}`;
  if (/^1[3-9]\d{8}$/.test(digits)) digits = `0${digits}`;
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

export function estimateSmsSegments(message: string): {
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
} {
  const ascii = Array.from(message).every((character) => character.charCodeAt(0) <= 127);
  const length = message.length;
  if (ascii)
    return {
      encoding: 'GSM-7',
      segments: length === 0 ? 0 : length <= 160 ? 1 : Math.ceil(length / 153),
    };
  return {
    encoding: 'UCS-2',
    segments: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67),
  };
}

export function redactSwiftSmsUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.searchParams.has('apikey')) url.searchParams.set('apikey', '[REDACTED]');
    return url.toString();
  } catch {
    return '[REDACTED]';
  }
}

export function sanitizeProviderResponse(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/apikey=[^&#\s]+/gi, 'apikey=[REDACTED]');
  if (Array.isArray(value)) return value.map(sanitizeProviderResponse);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key.toLowerCase() !== 'apikey')
        .map(([key, nested]) => [key, sanitizeProviderResponse(nested)]),
    );
  }
  return value;
}

export function swiftSmsError(code: string | number | null): {
  code: string | null;
  message: string | null;
  retryable: boolean;
} {
  const normalized = code === null ? null : String(code);
  if (!normalized) return { code: null, message: null, retryable: false };
  const mapped = SWIFTSMS_ERROR_CODES[normalized];
  return {
    code: normalized,
    message: mapped?.message || 'Unknown SwiftSMS provider error',
    retryable: mapped?.retryable ?? false,
  };
}

export async function getSwiftSmsBalance(
  fetchImpl: typeof fetch = fetch,
): Promise<{ available: number; used: number }> {
  const apiKey = process.env.SWIFTSMS_API_KEY;
  if (!apiKey) throw new Error('SwiftSMS is not configured');
  const baseUrl = (process.env.SWIFTSMS_BASE_URL || 'https://swiftsms.astgd.com').replace(
    /\/$/,
    '',
  );
  const url = new URL('/api/sms/getbalance', baseUrl);
  url.searchParams.set('apikey', apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('SwiftSMS balance lookup failed');
    const raw = await response.text();
    let decoded = raw;
    try {
      const outer = JSON.parse(raw);
      if (typeof outer === 'string') decoded = outer;
      if (outer && typeof outer === 'object') {
        const object = outer as Record<string, unknown>;
        if (object.available !== undefined) return {
          available: Number(object.available),
          used: Number(object.used),
        };
      }
    } catch {
      // SwiftSMS may return Python-style dict text instead of JSON.
    }
    const availableMatch = decoded.match(/available[^\d-]*(-?\d+(?:\.\d+)?)/i);
    const usedMatch = decoded.match(/used[^\d-]*(-?\d+(?:\.\d+)?)/i);
    const body: Record<string, unknown> = {
      available: availableMatch?.[1],
      used: usedMatch?.[1],
    };
    const available = typeof body.available === 'number' ? body.available : Number(body.available);
    const used = typeof body.used === 'number' ? body.used : Number(body.used);
    if (!Number.isFinite(available) || !Number.isFinite(used) || available < 0 || used < 0)
      throw new Error('SwiftSMS returned invalid balance data');
    return { available, used };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendSwiftSms(
  params: { recipients: string[]; message: string; label: 'transactional' | 'promotional' },
  fetchImpl: typeof fetch = fetch,
): Promise<{
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  providerErrorCode: string | null;
  providerMessage: string | null;
  retryable: boolean;
  redactedUrl: string;
}> {
  const apiKey = process.env.SWIFTSMS_API_KEY;
  if (!apiKey) throw new Error('SwiftSMS is not configured');
  const normalized = params.recipients
    .map(normalizeBangladeshPhone)
    .filter((value): value is string => Boolean(value));
  if (!normalized.length) throw new Error('No valid recipients');
  if (!params.message.trim()) throw new Error('Message body is empty');
  const baseUrl = (process.env.SWIFTSMS_BASE_URL || 'https://swiftsms.astgd.com').replace(
    /\/$/,
    '',
  );
  const url = new URL('/api/sms/send', baseUrl);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('phonenumber', normalized.join('+'));
  url.searchParams.set('message', params.message);
  url.searchParams.set('label', params.label);
  const redactedUrl = redactSwiftSmsUrl(url.toString());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const raw = await response.text();
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const providerObject: Record<string, unknown> = {};
      const pairs = raw.matchAll(/['"]([a-zA-Z0-9_]+)['"]\s*[:=]\s*(?:['"]([^'"]*)['"]|(-?\d+(?:\.\d+)?)|(True|False|None))/g);
      for (const match of pairs) {
        providerObject[match[1]] = match[2] ?? (match[3] ? Number(match[3]) : match[4] === 'True' ? true : match[4] === 'False' ? false : null);
      }
      parsed = Object.keys(providerObject).length ? providerObject : raw;
    }
    const sanitized = sanitizeProviderResponse(parsed);
    const object =
      sanitized && typeof sanitized === 'object' ? (sanitized as Record<string, unknown>) : {};
    const code =
      typeof object.error_code === 'string' || typeof object.error_code === 'number'
        ? String(object.error_code)
        : typeof object.code === 'string' || typeof object.code === 'number'
          ? String(object.code)
          : null;
    const mapped = swiftSmsError(code);
    const messageId =
      typeof object.message_id === 'string'
        ? object.message_id
        : typeof object.messageId === 'string'
          ? object.messageId
          : null;
    if (response.ok && code === null && messageId)
      return {
        status: 'sent',
        providerMessageId: messageId,
        providerErrorCode: null,
        providerMessage: null,
        retryable: false,
        redactedUrl,
      };
    if (response.ok && code === null)
      return {
        status: 'sent',
        providerMessageId: null,
        providerErrorCode: null,
        providerMessage: null,
        retryable: false,
        redactedUrl,
      };
    return {
      status: 'failed',
      providerMessageId: messageId,
      providerErrorCode: mapped.code,
      providerMessage: mapped.message,
      retryable: mapped.retryable,
      redactedUrl,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      status: 'failed',
      providerMessageId: null,
      providerErrorCode: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      providerMessage: timedOut ? 'Provider request timed out' : 'Provider request failed',
      retryable: true,
      redactedUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}
