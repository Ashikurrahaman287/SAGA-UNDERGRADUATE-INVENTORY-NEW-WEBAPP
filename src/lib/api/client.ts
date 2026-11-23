export type ApiResult<T> = { data: T; requestId: string };

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: { Accept: 'application/json', ...options.headers },
    });
    const body = (await response.json()) as T & {
      requestId?: string;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(body.error?.message || 'The API request failed.');
    return { data: body, requestId: body.requestId || response.headers.get('X-Request-ID') || '' };
  } finally {
    window.clearTimeout(timeout);
  }
}
