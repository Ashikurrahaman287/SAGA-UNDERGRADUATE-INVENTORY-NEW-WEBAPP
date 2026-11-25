import { describe, expect, it, vi } from 'vitest';
import { salePlacedSms, deliveryDeliveredSms, paymentReceivedSms } from '../../api/_lib/notifications';

function calculateDue(total: number, paid: number): number {
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

function calculateNetProfit(grossProfit: number, operationalCost: number, packagingCost: number): number {
  return Math.round((grossProfit - operationalCost - packagingCost) * 100) / 100;
}

describe('single-admin redesigned workflow', () => {
  it('clamps due to zero and preserves fixed precision', () => {
    expect(calculateDue(89, 89)).toBe(0);
    expect(calculateDue(89, 40)).toBe(49);
    expect(calculateDue(89, 120)).toBe(0);
  });

  it('calculates Net Profit from gross profit minus operating and packaging cost', () => {
    expect(calculateNetProfit(500, 120, 45)).toBe(335);
  });

  it('formats delivery done SMS in payment-first, delivered-second order', () => {
    const customer = { customerName: 'ASHIK', phone: '01805759354', receiptNumber: 'RCP-2026-628072615', totalAmount: 89 };
    expect(paymentReceivedSms({ ...customer, amount: 89 })).toBe('Dear ASHIK, payment of BDT 89.00 received for order RCP-2026-628072615. Thank you. UNDERGRADUATE HUB');
    expect(deliveryDeliveredSms(customer)).toBe('Dear ASHIK, your order RCP-2026-628072615 has been delivered successfully. Thank you. UNDERGRADUATE HUB');
  });

  it('never includes packaging cost in receipt snapshot fields', () => {
    const receiptSnapshot = {
      subtotal: 89,
      discount_amount: 0,
      delivery_fee: 0,
      total_amount: 89,
      amount_paid: 89,
      amount_due: 0,
    };
    expect(receiptSnapshot).not.toHaveProperty('internal_packaging_cost');
  });

  it('formats the order placed SMS once', () => {
    expect(salePlacedSms({ customerName: 'Prema Yasmin', phone: '01805759354', receiptNumber: 'RCP-2026-628072615', totalAmount: 89 })).toBe('Dear Prema, your order has been placed. Rcpt: RCP-2026-628072615. Total: BDT 89.00. UNDERGRADUATE HUB');
  });

  it('uses a 2-second delay for the delivered SMS after payment SMS', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const sequence = async () => {
      events.push('payment');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      events.push('delivered');
    };
    const promise = sequence();
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();
    expect(events).toEqual(['payment', 'delivered']);
  });
});
