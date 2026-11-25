import { describe, expect, it } from 'vitest';

function fixedMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function netProfit(grossProfit: number, operationalCost: number, packagingCost: number): number {
  return fixedMoney(grossProfit - operationalCost - packagingCost);
}

describe('single-admin Net Profit', () => {
  it('uses gross profit minus operational and packaging costs', () => {
    expect(netProfit(500, 120.25, 45.75)).toBe(334);
  });

  it('returns a fixed-precision negative result', () => {
    expect(netProfit(50, 75, 10)).toBe(-35);
  });

  it('clamps invalid inputs to zero before arithmetic', () => {
    expect(fixedMoney(Number.NaN)).toBe(0);
  });
});
