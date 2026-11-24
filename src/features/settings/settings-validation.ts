import { z } from 'zod';

const cleanText = (
  max: number,
  options: { min?: number; pattern?: RegExp; patternMessage?: string } = {},
) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => value.length >= (options.min || 0), 'This field is required.')
    .refine(
      (value) =>
        !Array.from(value).some((character) => {
          const code = character.charCodeAt(0);
          return (code < 32 && code !== 9 && code !== 10) || code === 127;
        }),
      'Control characters are not allowed.',
    )
    .refine(
      (value) => !options.pattern || options.pattern.test(value),
      options.patternMessage || 'This field is invalid.',
    )
    .transform((value) => value.replace(/\r\n?/g, '\n'));
const optionalCleanText = (max: number) => cleanText(max).nullable().optional();

const currencyCodes = new Set(
  (Intl as typeof Intl & { supportedValuesOf?: (key: 'currency') => string[] }).supportedValuesOf?.(
    'currency',
  ) || [],
);

export const organizationSettingsSchema = z.object({
  name: cleanText(200, { min: 1 }),
  businessEmail: z.union([z.literal(''), z.string().trim().email().max(254)]).optional(),
  businessPhone: optionalCleanText(40),
  businessAddress: optionalCleanText(500),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => /^[A-Z]{3}$/.test(value) && (currencyCodes.size === 0 || currencyCodes.has(value)),
      'Enter a valid ISO 4217 currency code.',
    ),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Enter a valid IANA timezone.'),
  lowStockThreshold: z.number().int().min(0).max(100000000),
  receiptPrefix: cleanText(24, {
    min: 1,
    pattern: /^[A-Za-z0-9][A-Za-z0-9-]*$/,
    patternMessage: 'Use letters, numbers, and hyphens in the receipt prefix.',
  }),
  receiptHeader: optionalCleanText(500),
  receiptFooter: optionalCleanText(1000),
  receiptNotes: optionalCleanText(1000),
  notificationPreferences: z.object({
    lowStock: z.boolean(),
    sales: z.boolean(),
    deliveries: z.boolean(),
    returns: z.boolean(),
  }),
  moderatorReturnsEnabled: z.boolean(),
});

export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;
