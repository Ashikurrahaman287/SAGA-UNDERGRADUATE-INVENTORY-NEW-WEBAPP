import { useState, type FormEvent, type ReactElement } from 'react';
import { Button } from '../../components/ui/button';
import { productFormSchema, type ProductFormValues } from './product-validation';
import type { Category } from './product-types';

export function ProductForm({
  categories,
  initial,
  canChooseSupplier,
  onSubmit,
  onCancel,
  submitting,
}: {
  categories: Category[];
  initial?: Partial<ProductFormValues>;
  canChooseSupplier: boolean;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}): ReactElement {
  const [values, setValues] = useState<ProductFormValues>({
    name: initial?.name || '',
    sku: initial?.sku || '',
    description: initial?.description || '',
    categoryId: initial?.categoryId || null,
    supplierId: initial?.supplierId || null,
    costPrice: initial?.costPrice || 0,
    sellingPrice: initial?.sellingPrice || 0,
    initialStock: initial?.initialStock || 0,
    lowStockThreshold: initial?.lowStockThreshold || 0,
    unit: initial?.unit || 'unit',
    isActive: initial?.isActive ?? true,
    openingStockReason: '',
  });
  const [error, setError] = useState('');
  const update = (key: keyof ProductFormValues, value: unknown): void =>
    setValues((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const result = productFormSchema.safeParse(values);
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Check the form values.');
      return;
    }
    setError('');
    await onSubmit(result.data);
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Product name"
          value={values.name}
          onChange={(value) => update('name', value)}
          required
        />
        <Field
          label="SKU / stock code"
          value={values.sku}
          onChange={(value) => update('sku', value)}
          required
        />
        <SelectField
          label="Category"
          value={values.categoryId || ''}
          onChange={(value) => update('categoryId', value || null)}
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
        />
        <Field label="Unit" value={values.unit} onChange={(value) => update('unit', value)} />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Description</span>
        <textarea
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Cost price"
          type="number"
          value={String(values.costPrice)}
          onChange={(value) => update('costPrice', value)}
          step="0.01"
          required
        />
        <Field
          label="Selling price"
          type="number"
          value={String(values.sellingPrice)}
          onChange={(value) => update('sellingPrice', value)}
          step="0.01"
          required
        />
        <Field
          label="Low-stock threshold"
          type="number"
          value={String(values.lowStockThreshold)}
          onChange={(value) => update('lowStockThreshold', value)}
          step="0.001"
          required
        />
      </div>
      {!initial?.name && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <Field
            label="Initial stock quantity"
            type="number"
            value={String(values.initialStock)}
            onChange={(value) => update('initialStock', value)}
            step="0.001"
          />
          <p className="mt-2 text-xs text-blue-800">
            Initial stock is recorded as an immutable opening-stock movement.
          </p>
          {Number(values.initialStock) > 0 && (
            <Field
              label="Opening-stock reason"
              value={values.openingStockReason}
              onChange={(value) => update('openingStockReason', value)}
              required
            />
          )}
        </div>
      )}
      {canChooseSupplier && (
        <Field
          label="Supplier ID"
          value={values.supplierId || ''}
          onChange={(value) => update('supplierId', value || null)}
          placeholder="Select from supplier module when enabled"
        />
      )}
      {initial?.name && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => update('isActive', event.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />{' '}
          Product is active
        </label>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <Button
          type="button"
          onClick={onCancel}
          className="border border-slate-300 bg-white text-slate-700"
        >
          Cancel
        </Button>
        <Button disabled={submitting} type="submit" className="bg-blue-600 text-white">
          {submitting ? 'Saving...' : initial?.name ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
  placeholder?: string;
}): ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      <input
        required={required}
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}): ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
      >
        <option value="">Uncategorized</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
