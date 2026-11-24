export type SaleProduct = {
  id: string;
  name: string;
  sku: string;
  category_name?: string | null;
  selling_price: number | string;
  quantity: number | string;
  is_active: boolean;
  unit: string;
};
export type SaleCartItem = {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
};
export type SaleCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};
export type SaleSeller = { id: string; name: string; reference_code?: string | null };
