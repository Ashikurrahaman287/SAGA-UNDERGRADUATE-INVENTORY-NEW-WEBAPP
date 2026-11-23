import { describe, expect, it } from 'vitest';
import { buildDashboardDateRange, zonedMidnightUtc } from '../../api/lib/dashboard/date-range';

describe('dashboard date ranges', () => {
  it('creates timezone-aware UTC boundaries', () => {
    const boundary = zonedMidnightUtc('2026-01-15', 'Africa/Accra');
    expect(boundary.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('rejects ranges longer than one year', () => {
    expect(() => buildDashboardDateRange('2024-01-01', '2026-01-01', 'UTC')).toThrow('one year');
  });
});
