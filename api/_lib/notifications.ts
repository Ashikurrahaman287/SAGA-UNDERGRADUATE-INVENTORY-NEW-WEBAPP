import { normalizeBangladeshPhone, sendSwiftSms } from './swiftsms.js';

export type SaleNotificationData = {
  customerName: string | null;
  phone: string | null;
  receiptNumber: string;
  totalAmount: number;
  amount?: number;
};

function firstName(name: string | null): string {
  const cleaned = (name || '').trim();
  return cleaned ? cleaned.split(/\s+/)[0] : 'Customer';
}

export function salePlacedSms(data: SaleNotificationData): string {
  return `Dear ${firstName(data.customerName)}, your order has been placed. Rcpt: ${data.receiptNumber}. Total: BDT ${data.totalAmount.toFixed(2)}. UNDERGRADUATE HUB`;
}

export function deliveryDeliveredSms(data: SaleNotificationData): string {
  return `Dear ${firstName(data.customerName)}, your order ${data.receiptNumber} has been delivered successfully. Thank you. UNDERGRADUATE HUB`;
}

export function paymentReceivedSms(data: SaleNotificationData): string {
  return `Dear ${firstName(data.customerName)}, payment of BDT ${(data.amount || 0).toFixed(2)} received for order ${data.receiptNumber}. Thank you. UNDERGRADUATE HUB`;
}

export async function sendSaleNotification(data: SaleNotificationData, message: string): Promise<boolean> {
  const phone = normalizeBangladeshPhone(data.phone || '');
  if (!phone) return false;
  const result = await sendSwiftSms({ recipients: [phone], message, label: 'transactional' });
  return result.status === 'sent';
}
