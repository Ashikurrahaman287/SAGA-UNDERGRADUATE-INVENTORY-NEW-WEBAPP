import { useState, type FormEvent, type ReactElement } from 'react';
import { Button } from '../../components/ui/button';
import { customerSchema, type CustomerFormValues } from './customer-validation';

export function CustomerForm({
  initial,
  showAddress,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<CustomerFormValues>;
  showAddress?: boolean;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}): ReactElement {
  const [values, setValues] = useState<CustomerFormValues>({
    name: initial?.name || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    notes: initial?.notes || '',
    initialAddress: initial?.initialAddress,
  });
  const [error, setError] = useState('');
  const update = (key: keyof CustomerFormValues, value: unknown): void =>
    setValues((current) => ({ ...current, [key]: value }));
  const updateAddress = (key: string, value: unknown): void =>
    setValues((current) => ({
      ...current,
      initialAddress: {
        addressLine: '',
        city: '',
        isDefault: true,
        ...(current.initialAddress || {}),
        [key]: value,
      },
    }));
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const result = customerSchema.safeParse(values);
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
          label="Customer name"
          value={values.name}
          onChange={(value) => update('name', value)}
          required
        />
        <Field
          label="Phone number"
          value={values.phone}
          onChange={(value) => update('phone', value)}
          required
        />
        <Field
          label="Email"
          type="email"
          value={values.email || ''}
          onChange={(value) => update('email', value)}
        />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Internal notes</span>
        <textarea
          value={values.notes || ''}
          onChange={(event) => update('notes', event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </label>
      {showAddress && (
        <fieldset className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <legend className="px-1 text-sm font-semibold text-blue-900">
            Initial delivery address
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field
              label="Label"
              value={values.initialAddress?.addressLabel || ''}
              onChange={(value) => updateAddress('addressLabel', value)}
              placeholder="Home"
            />
            <Field
              label="Address line"
              value={values.initialAddress?.addressLine || ''}
              onChange={(value) => updateAddress('addressLine', value)}
            />
            <Field
              label="Area / locality"
              value={values.initialAddress?.area || ''}
              onChange={(value) => updateAddress('area', value)}
            />
            <Field
              label="City"
              value={values.initialAddress?.city || ''}
              onChange={(value) => updateAddress('city', value)}
            />
          </div>
        </fieldset>
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
          {submitting ? 'Saving...' : initial?.name ? 'Save changes' : 'Create customer'}
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
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
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
      />
    </label>
  );
}
