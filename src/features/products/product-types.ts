export type Product = {
  id: string;
  name: string;
  sku: string;
  description?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  cost_price: number | string;
  selling_price: number | string;
  quantity: number | string;
  low_stock_threshold: number | string;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock';
};
export type ProductListResponse = {
  data: { items: Product[]; total: number };
  page: number;
  pageSize: number;
  requestId: string;
};
export type ProductSummary = {
  totalProducts: number;
  activeProducts: number;
  outOfStock: number;
  lowStock: number;
};
export type Category = {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type StockMovement = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number | string;
  previous_quantity: number | string;
  new_quantity: number | string;
  reference_type?: string | null;
  reference_id?: string | null;
  reason: string;
  actor_user_id?: string | null;
  created_at: string;
};
