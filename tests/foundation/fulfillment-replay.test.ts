import { describe, expect, it } from 'vitest';

function restockOnce(previous: number, quantity: number, restockedIds: Set<string>, saleId: string): number {
  if (restockedIds.has(saleId)) return previous;
  restockedIds.add(saleId);
  return previous + quantity;
}

describe('single-admin cancellation restock', () => {
  it('restocks exactly once across retries', () => {
    const restocked = new Set<string>();
    let stock = 10;
    stock = restockOnce(stock, 3, restocked, 'sale-1');
    stock = restockOnce(stock, 3, restocked, 'sale-1');
    expect(stock).toBe(13);
  });

  it('does not restock a different sale cancellation', () => {
    const restocked = new Set<string>();
    let stock = 10;
    stock = restockOnce(stock, 2, restocked, 'sale-1');
    stock = restockOnce(stock, 4, restocked, 'sale-2');
    expect(stock).toBe(16);
  });
});
