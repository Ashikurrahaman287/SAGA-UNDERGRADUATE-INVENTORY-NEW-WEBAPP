import { describe, expect, it } from 'vitest';

function mergeRouteParams(searchParams: URLSearchParams, params: Record<string, string>) {
  return { ...Object.fromEntries(searchParams.entries()), ...params };
}

describe('local API route params', () => {
  it('exposes dynamic route params to handlers', () => {
    expect(mergeRouteParams(new URLSearchParams('search=x'), { saleId: '517a552e-b31e-42ae-a45a-704b492ba679' })).toEqual({
      search: 'x',
      saleId: '517a552e-b31e-42ae-a45a-704b492ba679',
    });
  });
});
