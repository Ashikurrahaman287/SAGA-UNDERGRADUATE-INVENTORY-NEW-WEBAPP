import { z } from 'zod';

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name is required.').max(200),
    sku: z
      .string()
      .trim()
      .min(1, 'SKU is required.')
      .max(80)
      .transform((value) => value.toUpperCase()),
    description: z.string().trim().max(5000).optional().default(''),
    categoryId: z.string().uuid().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    costPrice: z.coerce.number().finite().min(0, 'Cost price cannot be negative.'),
    sellingPrice: z.coerce.number().finite().min(0, 'Selling price cannot be negative.'),
    initialStock: z.coerce.number().finite().min(0, 'Initial stock cannot be negative.').default(0),
    lowStockThreshold: z.coerce
      .number()
      .finite()
      .min(0, 'Threshold cannot be negative.')
      .default(0),
    unit: z.string().trim().min(1).max(40).default('unit'),
    isActive: z.boolean().default(true),
    openingStockReason: z.string().trim().max(500).optional().default(''),
  })
  .refine((value) => value.initialStock === 0 || value.openingStockReason.length > 0, {
    message: 'Opening stock reason is required when initial stock is greater than zero.',
    path: ['openingStockReason'],
  });
export type ProductFormValues = z.infer<typeof productFormSchema>;
