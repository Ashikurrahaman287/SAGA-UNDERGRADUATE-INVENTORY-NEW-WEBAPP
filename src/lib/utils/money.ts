export function parseMinorUnits(value: string | number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new Error('Invalid monetary value');
  return Math.round(numeric * 100);
}

export function formatMinorUnits(minorUnits: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

export function fixedAmount(value: string | number): number {
  return parseMinorUnits(value) / 100;
}
