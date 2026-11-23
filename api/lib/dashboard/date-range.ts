export type DashboardDateRange = {
  from: string;
  to: string;
  start: Date;
  end: Date;
  timezone: string;
};

function dateParts(date: Date, timezone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
}

export function zonedMidnightUtc(dateOnly: string, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) throw new Error('Invalid date range.');
  const base = Date.parse(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(base)) throw new Error('Invalid date range.');
  let guess = base;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateParts(new Date(guess), timezone);
    const wallClockAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    guess = base - (wallClockAsUtc - guess);
  }
  return new Date(guess);
}

export function dateInTimezone(date: Date, timezone: string): string {
  const parts = dateParts(date, timezone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function buildDashboardDateRange(
  from: string | undefined,
  to: string | undefined,
  timezone: string,
): DashboardDateRange {
  const today = dateInTimezone(new Date(), timezone);
  const defaultFrom = dateInTimezone(
    new Date(zonedMidnightUtc(today, timezone).getTime() - 29 * 86_400_000),
    timezone,
  );
  const selectedFrom = from || defaultFrom;
  const selectedTo = to || today;
  const start = zonedMidnightUtc(selectedFrom, timezone);
  const end = new Date(zonedMidnightUtc(selectedTo, timezone).getTime() + 86_400_000);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86_400_000)
    throw new Error('Date range must be valid and no longer than one year.');
  return { from: selectedFrom, to: selectedTo, start, end, timezone };
}
