export function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      /(password|secret|token|apikey|api_key|authorization|cookie|service.role)/i.test(key)
        ? '[REDACTED]'
        : sanitizeAuditValue(child),
    ]),
  );
}
