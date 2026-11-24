import { Minus, Plus, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { SaleCartItem } from './sale-types';

export function SaleCart({
  items,
  onQuantity,
  onRemove,
  formatMoney,
}: {
  items: SaleCartItem[];
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  formatMoney: (minorUnits: number) => string;
}): ReactElement {
  if (!items.length)
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No products in the cart.
      </div>
    );
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={item.productId} className="py-4 first:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {item.sku} · {formatMoney(item.unitPriceMinor)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.productId)}
              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => onQuantity(item.productId, item.quantity - 1)}
                className="p-2 text-slate-500 hover:text-slate-900"
                aria-label="Decrease quantity"
              >
                <Minus size={15} />
              </button>
              <input
                aria-label={`Quantity for ${item.name}`}
                type="number"
                min="1"
                step="1"
                value={item.quantity}
                onChange={(event) =>
                  onQuantity(item.productId, Math.floor(Number(event.target.value) || 1))
                }
                className="w-12 border-x border-slate-200 py-2 text-center text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => onQuantity(item.productId, item.quantity + 1)}
                className="p-2 text-slate-500 hover:text-slate-900"
                aria-label="Increase quantity"
              >
                <Plus size={15} />
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {formatMoney(item.unitPriceMinor * item.quantity)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
