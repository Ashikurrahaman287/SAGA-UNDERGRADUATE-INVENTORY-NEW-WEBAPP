import { z } from 'zod';
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s().-]{7,20}$/, 'Enter a valid phone number.');
export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required.').max(200),
  phone: phoneSchema,
  email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  notes: z.string().trim().max(5000).optional(),
  initialAddress: z
    .object({
      addressLabel: z.string().trim().max(80).optional(),
      recipientName: z.string().trim().max(200).optional(),
      recipientPhone: phoneSchema.optional(),
      addressLine: z.string().trim().min(1).max(300),
      area: z.string().trim().max(160).optional(),
      city: z.string().trim().min(1).max(120),
      postalCode: z.string().trim().max(40).optional(),
      deliveryInstructions: z.string().trim().max(500).optional(),
      isDefault: z.boolean().default(true),
    })
    .optional(),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;
