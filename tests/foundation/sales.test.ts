import { describe, expect, it } from 'vitest';
import { calculateSalePreview } from '../../src/lib/utils/sale-calculation';

describe('sale calculation preview', () => {
  it('calculates fixed discount, fee, and partial payment with minor units', () => {
    const result = calculateSalePreview(100, 'fixed', 10, 5, 40);
    expect(result).toEqual({
      subtotalMinor: 10000,
      discountMinor: 1000,
      deliveryFeeMinor: 500,
      totalMinor: 9500,
      amountPaidMinor: 4000,
      amountDueMinor: 5500,
    });
  });

  it('calculates percentage discount and a fully paid sale', () => {
    const result = calculateSalePreview(80, 'percentage', 25, 0, 60);
    expect(result.totalMinor).toBe(6000);
    expect(result.amountDueMinor).toBe(0);
  });

  it('rejects invalid discounts and overpayments', () => {
    expect(() => calculateSalePreview(100, 'percentage', 101, 0, 0)).toThrow();
    expect(() => calculateSalePreview(100, 'fixed', 100, 0, 101)).toThrow('Payment cannot exceed');
  });
});
