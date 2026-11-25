export type EmailItem = { name: string; sku: string; quantity: number; unitPrice: number; lineTotal: number };
export type OrderEmailData = {
  customerName: string;
  receiptNumber: string;
  createdAt: string;
  servedBy?: string;
  paymentMethod?: string;
  location?: string;
  scheduledAt?: string | null;
  items: EmailItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paid: number;
  due: number;
  currency: string;
  businessName?: string;
  reminder?: boolean;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-BD', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

export function renderOrderEmail(data: OrderEmailData): string {
  const brand = escapeHtml(data.businessName || 'UNDERGRADUATE HUB');
  const greeting = escapeHtml((data.customerName.trim().split(/\s+/)[0] || 'Customer'));
  const title = data.reminder ? 'DELIVERY REMINDER' : 'ORDER CONFIRMATION';
  const itemRows = data.items.map((item) => `<tr><td style="padding:14px 36px;background:#f9fafb;border-bottom:1px solid #f3f4f6"><strong>${escapeHtml(item.name)}</strong><br><span style="color:#6b7280">${escapeHtml(item.sku)}</span></td><td style="padding:14px;text-align:center;background:#f9fafb;border-bottom:1px solid #f3f4f6">${item.quantity}</td><td style="padding:14px;text-align:right;background:#f9fafb;border-bottom:1px solid #f3f4f6">${money(item.unitPrice,data.currency)}</td><td style="padding:14px 36px 14px 14px;text-align:right;background:#f9fafb;border-bottom:1px solid #f3f4f6;font-weight:700">${money(item.lineTotal,data.currency)}</td></tr>`).join('');
  const schedule = data.scheduledAt ? new Date(data.scheduledAt).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }) : 'To be confirmed';
  const statusHeading = data.reminder ? 'Delivery reminder' : 'Order placed successfully';
  const statusCopy = data.reminder ? `Your order ${escapeHtml(data.receiptNumber)} is scheduled for delivery. Please keep your phone available.` : 'Your order has been placed successfully. Please find your purchase summary below.';
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937"><div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden"><header style="background:#1b388c;color:#fff;text-align:center;padding:32px 24px"><h1 style="margin:0;font-size:20px;font-weight:800;letter-spacing:1px">${brand}</h1><p style="margin:8px 0 0;font-size:11px;letter-spacing:2px;color:#dbeafe">${title}</p></header><section style="background:#f0f5ff;padding:24px 36px;border-bottom:1px solid #e5edff"><h2 style="margin:0 0 8px;font-size:18px;color:#1e3a8a">${data.reminder ? `Hello, ${greeting}` : `Thank you, ${greeting}!`}</h2><p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563">${statusCopy}</p></section><main style="padding:28px 36px"><table style="width:100%;border-collapse:collapse;margin-bottom:24px"><tr><td style="padding:8px 0"><small style="color:#8b95a5">RECEIPT NUMBER</small><br><strong style="color:#1e3a8a">${escapeHtml(data.receiptNumber)}</strong></td><td style="padding:8px 0;text-align:right"><small style="color:#8b95a5">DATE</small><br>${escapeHtml(new Date(data.createdAt).toLocaleDateString('en-BD',{dateStyle:'long',timeZone:'Asia/Dhaka'}))}</td></tr><tr><td style="padding:8px 0"><small style="color:#8b95a5">SERVED BY</small><br>${escapeHtml(data.servedBy || 'UNDERGRADUATE HUB')}</td><td style="padding:8px 0;text-align:right"><small style="color:#8b95a5">PAYMENT</small><br>${escapeHtml(data.paymentMethod || 'Due')}</td></tr></table><section style="background:#f2f7ff;border-left:4px solid #2563eb;padding:16px 20px;margin-bottom:24px"><strong style="color:#1e3a8a">DELIVERY SCHEDULE</strong><p style="margin:8px 0 0;color:#1d4ed8">Location: ${escapeHtml(data.location || 'To be confirmed')}</p><p style="margin:6px 0 0;color:#1d4ed8">Date: ${escapeHtml(schedule)}</p></section><h3 style="font-size:11px;letter-spacing:1px;color:#4b5563">ITEMS PURCHASED</h3><table style="width:calc(100% + 72px);margin:0 -36px;border-collapse:collapse"><thead><tr style="background:#1b388c;color:#fff;text-align:left"><th style="padding:12px 36px">PRODUCT</th><th style="padding:12px;text-align:center">QTY</th><th style="padding:12px;text-align:right">UNIT PRICE</th><th style="padding:12px 36px 12px 12px;text-align:right">SUBTOTAL</th></tr></thead><tbody>${itemRows}</tbody></table><table style="width:100%;max-width:320px;margin:16px 0 28px auto;border-collapse:collapse"><tr><td style="padding:7px">Subtotal</td><td style="padding:7px;text-align:right">${money(data.subtotal,data.currency)}</td></tr><tr><td style="padding:7px">Discount</td><td style="padding:7px;text-align:right">-${money(data.discount,data.currency)}</td></tr><tr><td style="padding:7px">Delivery fee</td><td style="padding:7px;text-align:right">${money(data.deliveryFee,data.currency)}</td></tr><tr><td style="padding:9px 7px;border-top:1px solid #ddd;font-weight:800;color:#1e3a8a">TOTAL</td><td style="padding:9px 7px;border-top:1px solid #ddd;text-align:right;font-weight:800;color:#1e3a8a">${money(data.total,data.currency)}</td></tr><tr><td style="padding:7px">Amount paid</td><td style="padding:7px;text-align:right">${money(data.paid,data.currency)}</td></tr><tr><td style="padding:7px;font-weight:700">Due</td><td style="padding:7px;text-align:right;font-weight:700">${money(data.due,data.currency)}</td></tr></table><section style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center"><strong style="color:#15803d">✓ ${statusHeading}</strong><p style="margin:8px 0 0;color:#4b5563">We’ll prepare your items with care. Thank you for choosing us.</p></section></main><footer style="background:#1b388c;color:#fff;text-align:center;padding:24px"><strong>${brand}</strong><p style="font-size:11px;color:#93c5fd">Technology Partner - SAGA LAB</p><p style="font-size:10px;color:#bfdbfe">This is an automated email. Please do not reply.</p></footer></div></body></html>`;
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<{ sent: boolean; provider: string; messageId?: string; error?: string }> {
  const provider = process.env.EMAIL_PROVIDER || 'none';
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!from || !apiKey || provider === 'none') return { sent: false, provider, error: 'Email provider is not configured.' };
  try {
    let url = '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: Record<string, unknown>;
    if (provider === 'resend') {
      url = 'https://api.resend.com/emails';
      headers.Authorization = `Bearer ${apiKey}`;
      body = { from, to: [params.to], subject: params.subject, html: params.html, text: params.text };
    } else if (provider === 'postmark') {
      url = 'https://api.postmarkapp.com/email';
      headers['X-Postmark-Server-Token'] = apiKey;
      body = { From: from, To: params.to, Subject: params.subject, HtmlBody: params.html, TextBody: params.text, MessageStream: 'outbound' };
    } else if (provider === 'sendgrid') {
      url = 'https://api.sendgrid.com/v3/mail/send';
      headers.Authorization = `Bearer ${apiKey}`;
      body = { personalizations: [{ to: [{ email: params.to }] }], from: { email: from }, subject: params.subject, content: [{ type: 'text/plain', value: params.text }, { type: 'text/html', value: params.html }] };
    } else return { sent: false, provider, error: 'Configured email provider is unsupported for API delivery.' };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const responseText = await response.text();
    if (!response.ok) return { sent: false, provider, error: `Email provider returned HTTP ${response.status}: ${responseText.slice(0, 300)}` };
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(responseText) as { id?: string; MessageID?: string };
      messageId = parsed.id || parsed.MessageID;
    } catch { /* SendGrid can return an empty 202 response. */ }
    return { sent: true, provider, messageId };
  } catch (error) {
    return { sent: false, provider, error: error instanceof Error ? error.message : 'Email provider request failed.' };
  }
}
