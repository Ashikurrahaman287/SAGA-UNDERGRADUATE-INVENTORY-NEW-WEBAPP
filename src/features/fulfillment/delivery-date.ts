export type DeliveryTab = 'today' | 'tomorrow' | 'upcoming';

export type DeliveryAssignmentState = { status?: string | null; delivered_at?: string | null };

export function isPackagingWorkflowActive(
  fulfillmentStatus: string | null | undefined,
  assignments: DeliveryAssignmentState[] | null | undefined,
): boolean {
  if (['ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'].includes(fulfillmentStatus || '')) {
    return false;
  }
  return !(assignments || []).some((assignment) =>
    Boolean(assignment.delivered_at) ||
    ['assigned', 'out_for_delivery', 'delivered', 'failed', 'cancelled'].includes(assignment.status || ''),
  );
}

type DateParts = { year: number; month: number; day: number; hour?: number; minute?: number };

function getDateParts(value: Date, timeZone: string, includeTime = false): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    ...(includeTime ? { hour: Number(parts.hour), minute: Number(parts.minute) } : {}),
  };
}

function dateKey(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function addCalendarDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getDeliveryTab(
  scheduledAt: string | null | undefined,
  now: Date,
  timeZone: string,
): DeliveryTab {
  const scheduledDate = validDate(scheduledAt);
  if (!scheduledDate) return 'upcoming';
  const todayKey = dateKey(getDateParts(now, timeZone));
  const deliveryKey = dateKey(getDateParts(scheduledDate, timeZone));
  if (deliveryKey <= todayKey) return 'today';
  if (deliveryKey === addCalendarDays(todayKey, 1)) return 'tomorrow';
  return 'upcoming';
}

export function formatDeliveryDate(
  scheduledAt: string | null | undefined,
  fallbackAt: string | null | undefined,
  timeZone: string,
): string {
  const scheduledDate = validDate(scheduledAt);
  if (scheduledDate) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone,
    }).format(scheduledDate);
  }
  const fallbackDate = validDate(fallbackAt);
  if (fallbackDate) {
    const orderDate = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeZone,
    }).format(fallbackDate);
    return `Not scheduled · order date ${orderDate}`;
  }
  return 'Not scheduled';
}

export function formatDateTimeInput(value: string | null | undefined, timeZone: string): { date: string; time: string } {
  const date = validDate(value);
  if (!date) return { date: '', time: '' };
  const parts = getDateParts(date, timeZone, true);
  return {
    date: dateKey(parts),
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  };
}

export function localDateTimeToUtcIso(dateText: string, timeText: string, timeZone: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeText);
  if (!dateMatch || !timeMatch) throw new Error('Enter a valid delivery date and time.');
  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const desired: DateParts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
  };
  const desiredAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
  const calendarCheck = new Date(desiredAsUtc);
  if (
    calendarCheck.getUTCFullYear() !== desired.year ||
    calendarCheck.getUTCMonth() + 1 !== desired.month ||
    calendarCheck.getUTCDate() !== desired.day ||
    desired.hour! > 23 ||
    desired.minute! > 59
  ) throw new Error('Enter a valid delivery date and time.');

  let candidate = desiredAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = getDateParts(new Date(candidate), timeZone, true);
    const representedAsUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute);
    const nextCandidate = desiredAsUtc - (representedAsUtc - candidate);
    if (nextCandidate === candidate) break;
    candidate = nextCandidate;
  }
  const resolved = getDateParts(new Date(candidate), timeZone, true);
  if (
    resolved.year !== desired.year || resolved.month !== desired.month || resolved.day !== desired.day ||
    resolved.hour !== desired.hour || resolved.minute !== desired.minute
  ) throw new Error('That local delivery time does not exist in the business timezone.');
  return new Date(candidate).toISOString();
}
