export type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_orders?: number;
  total_purchase?: number | string;
  last_purchase?: string | null;
  addresses?: CustomerAddress[];
  consents?: Consent[];
};
export type CustomerAddress = {
  id: string;
  customer_id: string;
  address_label?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  address_line: string;
  area?: string | null;
  city: string;
  postal_code?: string | null;
  delivery_instructions?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type CustomerNote = { id: string; note: string; author_user_id: string; created_at: string };
export type Consent = {
  id: string;
  channel: 'sms' | 'email';
  consent_status: 'granted' | 'denied' | 'unknown';
  consent_source?: string | null;
  updated_by?: string | null;
  updated_at: string;
};
export type CustomerListPayload = { items: Customer[]; total: number };
export type CustomerMetrics = {
  totalCustomers: number;
  activeCustomers: number;
  newCustomers: number;
  customersWithPurchases: number;
};
