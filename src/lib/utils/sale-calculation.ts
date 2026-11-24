import { formatMinorUnits, parseMinorUnits } from './money';

export function calculateSalePreview(
  subtotalValue: string | number,
  discountType: 'fixed' | 'percentage',
  discountValue: string | number,
  deliveryFeeValue: string | number,
  amountPaidValue: string | number,
): {
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
} {
  const subtotalMinor = parseMinorUnits(subtotalValue);
  if (subtotalMinor < 0) throw new Error('Subtotal cannot be negative');
  const discountInput = Number(discountValue);
  if (!Number.isFinite(discountInput) || discountInput < 0)
    throw new Error('Discount cannot be negative');
  if (discountType === 'percentage' && discountInput > 100)
    throw new Error('Percentage discount cannot exceed 100');
  const discountMinor =
    discountType === 'fixed'
      ? parseMinorUnits(discountInput)
      : Math.round((subtotalMinor * discountInput) / 100);
  if (discountMinor > subtotalMinor) throw new Error('Discount cannot exceed subtotal');
  const deliveryFeeMinor = parseMinorUnits(deliveryFeeValue);
  if (deliveryFeeMinor < 0) throw new Error('Delivery fee cannot be negative');
  const totalMinor = Math.max(0, subtotalMinor - discountMinor + deliveryFeeMinor);
  const requestedPaidMinor = parseMinorUnits(amountPaidValue);
  if (requestedPaidMinor < 0) throw new Error('Payment cannot be negative');
  if (requestedPaidMinor > totalMinor) throw new Error('Payment cannot exceed the sale total');
  return {
    subtotalMinor,
    discountMinor,
    deliveryFeeMinor,
    totalMinor,
    amountPaidMinor: requestedPaidMinor,
    amountDueMinor: totalMinor - requestedPaidMinor,
  };
}

export function formatSaleMoney(minorUnits: number, currency = 'USD'): string {
  return formatMinorUnits(minorUnits, currency);
}
