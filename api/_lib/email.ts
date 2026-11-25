import nodemailer from 'nodemailer';
import { getServerEnv } from '../lib/env.js';

export type EmailItem = { name: string; sku: string; quantity: number; unitPrice: number; lineTotal: number };
export type EmailConsentStatus = 'granted' | 'denied' | 'unknown' | null | undefined;

export function canSendTransactionalEmail(consentStatus: EmailConsentStatus): boolean {
  return consentStatus !== 'denied';
}

export type OrderEmailData = {
  customerName: string;
  receiptNumber: string;
  createdAt: string;
  servedBy?: string;
  paymentMethod?: string;
  location?: string;
  scheduledAt?: string | null;
  deliveredAt?: string | null;
  items: EmailItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paid: number;
  due: number;
  currency: string;
  businessName?: string;
  emailType?: 'order_confirmation' | 'delivery_confirmation' | 'reminder';
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

export function renderLegacyOrderEmail(data: OrderEmailData): string {
  const brand = escapeHtml(data.businessName || 'UNDERGRADUATE HUB');
  const greeting = escapeHtml((data.customerName.trim().split(/\s+/)[0] || 'Customer'));
  const title = data.reminder ? 'DELIVERY REMINDER' : 'ORDER CONFIRMATION';
  const itemRows = data.items.map((item) => `<tr><td style="padding:14px 36px;background:#f9fafb;border-bottom:1px solid #f3f4f6"><strong>${escapeHtml(item.name)}</strong><br><span style="color:#6b7280">${escapeHtml(item.sku)}</span></td><td style="padding:14px;text-align:center;background:#f9fafb;border-bottom:1px solid #f3f4f6">${item.quantity}</td><td style="padding:14px;text-align:right;background:#f9fafb;border-bottom:1px solid #f3f4f6">${money(item.unitPrice,data.currency)}</td><td style="padding:14px 36px 14px 14px;text-align:right;background:#f9fafb;border-bottom:1px solid #f3f4f6;font-weight:700">${money(item.lineTotal,data.currency)}</td></tr>`).join('');
  const schedule = data.scheduledAt ? new Date(data.scheduledAt).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }) : 'To be confirmed';
  const statusHeading = data.reminder ? 'Delivery reminder' : 'Order placed successfully';
  const statusCopy = data.reminder ? `Your order ${escapeHtml(data.receiptNumber)} is scheduled for delivery. Please keep your phone available.` : 'Your order has been placed successfully. Please find your purchase summary below.';
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937"><div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden"><header style="background:#1b388c;color:#fff;text-align:center;padding:32px 24px"><h1 style="margin:0;font-size:20px;font-weight:800;letter-spacing:1px">${brand}</h1><p style="margin:8px 0 0;font-size:11px;letter-spacing:2px;color:#dbeafe">${title}</p></header><section style="background:#f0f5ff;padding:24px 36px;border-bottom:1px solid #e5edff"><h2 style="margin:0 0 8px;font-size:18px;color:#1e3a8a">${data.reminder ? `Hello, ${greeting}` : `Thank you, ${greeting}!`}</h2><p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563">${statusCopy}</p></section><main style="padding:28px 36px"><table style="width:100%;border-collapse:collapse;margin-bottom:24px"><tr><td style="padding:8px 0"><small style="color:#8b95a5">RECEIPT NUMBER</small><br><strong style="color:#1e3a8a">${escapeHtml(data.receiptNumber)}</strong></td><td style="padding:8px 0;text-align:right"><small style="color:#8b95a5">DATE</small><br>${escapeHtml(new Date(data.createdAt).toLocaleDateString('en-BD',{dateStyle:'long',timeZone:'Asia/Dhaka'}))}</td></tr><tr><td style="padding:8px 0"><small style="color:#8b95a5">SERVED BY</small><br>${escapeHtml(data.servedBy || 'UNDERGRADUATE HUB')}</td><td style="padding:8px 0;text-align:right"><small style="color:#8b95a5">PAYMENT</small><br>${escapeHtml(data.paymentMethod || 'Due')}</td></tr></table><section style="background:#f2f7ff;border-left:4px solid #2563eb;padding:16px 20px;margin-bottom:24px"><strong style="color:#1e3a8a">DELIVERY SCHEDULE</strong><p style="margin:8px 0 0;color:#1d4ed8">Location: ${escapeHtml(data.location || 'To be confirmed')}</p><p style="margin:6px 0 0;color:#1d4ed8">Date: ${escapeHtml(schedule)}</p></section><h3 style="font-size:11px;letter-spacing:1px;color:#4b5563">ITEMS PURCHASED</h3><table style="width:calc(100% + 72px);margin:0 -36px;border-collapse:collapse"><thead><tr style="background:#1b388c;color:#fff;text-align:left"><th style="padding:12px 36px">PRODUCT</th><th style="padding:12px;text-align:center">QTY</th><th style="padding:12px;text-align:right">UNIT PRICE</th><th style="padding:12px 36px 12px 12px;text-align:right">SUBTOTAL</th></tr></thead><tbody>${itemRows}</tbody></table><table style="width:100%;max-width:320px;margin:16px 0 28px auto;border-collapse:collapse"><tr><td style="padding:7px">Subtotal</td><td style="padding:7px;text-align:right">${money(data.subtotal,data.currency)}</td></tr><tr><td style="padding:7px">Discount</td><td style="padding:7px;text-align:right">-${money(data.discount,data.currency)}</td></tr><tr><td style="padding:7px">Delivery fee</td><td style="padding:7px;text-align:right">${money(data.deliveryFee,data.currency)}</td></tr><tr><td style="padding:9px 7px;border-top:1px solid #ddd;font-weight:800;color:#1e3a8a">TOTAL</td><td style="padding:9px 7px;border-top:1px solid #ddd;text-align:right;font-weight:800;color:#1e3a8a">${money(data.total,data.currency)}</td></tr><tr><td style="padding:7px">Amount paid</td><td style="padding:7px;text-align:right">${money(data.paid,data.currency)}</td></tr><tr><td style="padding:7px;font-weight:700">Due</td><td style="padding:7px;text-align:right;font-weight:700">${money(data.due,data.currency)}</td></tr></table><section style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center"><strong style="color:#15803d">✓ ${statusHeading}</strong><p style="margin:8px 0 0;color:#4b5563">We’ll prepare your items with care. Thank you for choosing us.</p></section></main><footer style="background:#1b388c;color:#fff;text-align:center;padding:24px"><strong>${brand}</strong><p style="font-size:11px;color:#93c5fd">Technology Partner - SAGA LAB</p><p style="font-size:10px;color:#bfdbfe">This is an automated email. Please do not reply.</p></footer></div></body></html>`;
}

export function renderOrderEmail(data: OrderEmailData): string {
  const type = data.emailType || (data.reminder ? 'reminder' : 'order_confirmation');
  const delivered = type === 'delivery_confirmation';
  const reminder = type === 'reminder';
  const business = escapeHtml(data.businessName || 'UNDERGRADUATE HUB');
  const firstName = escapeHtml(data.customerName.trim().split(/\s+/)[0] || 'Customer');
  const receipt = escapeHtml(data.receiptNumber);
  const accent = delivered ? '#087f5b' : '#2455a6';
  const title = delivered ? 'DELIVERY CONFIRMED' : reminder ? 'DELIVERY REMINDER' : 'ORDER CONFIRMATION';
  const heading = delivered ? 'Your order has arrived' : reminder ? 'Your delivery is coming up' : 'Thanks for your order';
  const message = delivered
    ? `Order ${receipt} was delivered successfully.`
    : reminder
      ? `Order ${receipt} is scheduled for delivery. Please keep your phone available.`
      : `We've received order ${receipt} and are preparing it for you.`;
  const date = new Date(data.createdAt);
  const orderDate = Number.isNaN(date.getTime())
    ? 'Not available'
    : date.toLocaleDateString('en-BD', { dateStyle: 'medium', timeZone: 'Asia/Dhaka' });
  const emailDate = delivered ? data.deliveredAt : data.scheduledAt;
  const scheduledDate = emailDate ? new Date(emailDate) : null;
  const schedule = scheduledDate && !Number.isNaN(scheduledDate.getTime())
    ? scheduledDate.toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' })
    : 'To be confirmed';
  const location = escapeHtml(data.location || 'To be confirmed');
  const itemRows = data.items.map((item) => `
    <tr>
      <td style="padding:13px 10px;border-bottom:1px solid #e9edf3;color:#17233b;font-size:14px"><strong>${escapeHtml(item.name)}</strong><br><span style="color:#778197;font-size:12px">${escapeHtml(item.sku)}</span></td>
      <td style="padding:13px 6px;border-bottom:1px solid #e9edf3;text-align:center;color:#39465c;font-size:14px">${item.quantity}</td>
      <td style="padding:13px 6px;border-bottom:1px solid #e9edf3;text-align:right;color:#39465c;font-size:14px">${money(item.unitPrice, data.currency)}</td>
      <td style="padding:13px 10px;border-bottom:1px solid #e9edf3;text-align:right;color:#17233b;font-size:14px;font-weight:700">${money(item.lineTotal, data.currency)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${title}</title>
<style>@media only screen and (max-width:600px){.email-shell{width:100%!important}.email-pad{padding-left:20px!important;padding-right:20px!important}.mobile-stack{display:block!important;width:100%!important;text-align:left!important;padding-top:8px!important}.email-title{font-size:23px!important}}</style></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#17233b">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f7;padding:28px 12px"><tr><td align="center">
    <table role="presentation" class="email-shell" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0">
      <tr><td style="height:6px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td class="email-pad" style="padding:25px 38px 23px;background:#14233d;color:#fff"><div style="font-size:18px;line-height:24px;font-weight:700">${business}</div><div style="margin-top:6px;color:#cbd6e8;font-size:11px;line-height:16px;letter-spacing:1.2px">${title}</div></td></tr>
      <tr><td class="email-pad" style="padding:30px 38px 26px"><div style="color:${accent};font-size:12px;line-height:18px;font-weight:700;letter-spacing:.6px">${delivered ? 'DELIVERY UPDATE' : reminder ? 'UPCOMING DELIVERY' : 'ORDER UPDATE'}</div><h1 class="email-title" style="margin:8px 0 10px;color:#17233b;font-size:28px;line-height:34px;font-weight:700">${heading}, ${firstName}</h1><p style="margin:0;color:#526078;font-size:15px;line-height:24px">${message}</p></td></tr>
      <tr><td class="email-pad" style="padding:0 38px 25px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f8fc;border:1px solid #e5ebf3"><tr><td class="mobile-stack" style="padding:14px 16px;width:50%;vertical-align:top"><div style="color:#778197;font-size:10px;line-height:15px;font-weight:700;letter-spacing:.7px">ORDER NUMBER</div><div style="margin-top:4px;color:#17233b;font-size:14px;font-weight:700">${receipt}</div></td><td class="mobile-stack" style="padding:14px 16px;width:50%;vertical-align:top"><div style="color:#778197;font-size:10px;line-height:15px;font-weight:700;letter-spacing:.7px">ORDER DATE</div><div style="margin-top:4px;color:#17233b;font-size:14px">${escapeHtml(orderDate)}</div></td></tr></table></td></tr>
      <tr><td class="email-pad" style="padding:0 38px 27px"><div style="margin-bottom:10px;color:#17233b;font-size:13px;font-weight:700;letter-spacing:.5px">${delivered ? 'DELIVERY DETAILS' : 'DELIVERY PLAN'}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-left:3px solid ${accent}"><tr><td style="padding:2px 0 7px 13px;color:#526078;font-size:13px;line-height:19px"><strong style="color:#17233b">${delivered ? 'Delivered' : 'Scheduled'}:</strong> ${escapeHtml(schedule)}</td></tr><tr><td style="padding:0 0 2px 13px;color:#526078;font-size:13px;line-height:19px"><strong style="color:#17233b">Location:</strong> ${location}</td></tr></table></td></tr>
      <tr><td class="email-pad" style="padding:0 38px 8px;color:#17233b;font-size:13px;font-weight:700;letter-spacing:.5px">ORDER SUMMARY</td></tr>
      <tr><td class="email-pad" style="padding:0 38px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><thead><tr style="background:#f5f7fa"><th align="left" style="padding:10px;color:#66738a;font-size:10px;letter-spacing:.5px">ITEM</th><th align="center" style="padding:10px 6px;color:#66738a;font-size:10px;letter-spacing:.5px">QTY</th><th align="right" style="padding:10px 6px;color:#66738a;font-size:10px;letter-spacing:.5px">PRICE</th><th align="right" style="padding:10px;color:#66738a;font-size:10px;letter-spacing:.5px">TOTAL</th></tr></thead><tbody>${itemRows}</tbody></table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px"><tr><td style="padding:5px 0;color:#66738a;font-size:13px">Subtotal</td><td align="right" style="padding:5px 0;color:#39465c;font-size:13px">${money(data.subtotal, data.currency)}</td></tr><tr><td style="padding:5px 0;color:#66738a;font-size:13px">Discount</td><td align="right" style="padding:5px 0;color:#39465c;font-size:13px">-${money(data.discount, data.currency)}</td></tr><tr><td style="padding:5px 0;color:#66738a;font-size:13px">Delivery fee</td><td align="right" style="padding:5px 0;color:#39465c;font-size:13px">${money(data.deliveryFee, data.currency)}</td></tr><tr><td style="padding:12px 0 8px;border-top:1px solid #dce3ed;color:#17233b;font-size:16px;font-weight:700">Total</td><td align="right" style="padding:12px 0 8px;border-top:1px solid #dce3ed;color:#17233b;font-size:16px;font-weight:700">${money(data.total, data.currency)}</td></tr><tr><td style="padding:5px 0;color:#087f5b;font-size:13px">Paid</td><td align="right" style="padding:5px 0;color:#087f5b;font-size:13px">${money(data.paid, data.currency)}</td></tr><tr><td style="padding:5px 0;color:#a35b08;font-size:13px">Balance due</td><td align="right" style="padding:5px 0;color:#a35b08;font-size:13px">${money(data.due, data.currency)}</td></tr></table>
      </td></tr>
      <tr><td class="email-pad" style="padding:19px 38px;background:#f5f7fa;border-top:1px solid #e5ebf3;color:#718096;text-align:center;font-size:11px;line-height:18px">This is an order update from <strong style="color:#39465c">${business}</strong>.<br>Please contact our team if you have questions about this order.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<{ sent: boolean; provider: string; messageId?: string; error?: string }> {
  let provider = process.env.EMAIL_PROVIDER || 'none';
  try {
    const env = getServerEnv();
    provider = env.EMAIL_PROVIDER || 'none';
    const from = env.EMAIL_FROM_ADDRESS;
    const senderName = env.EMAIL_FROM_NAME;
    if (!from) return { sent: false, provider, error: 'Email sender address is not configured.' };
    const formattedFrom = senderName ? `${senderName} <${from}>` : from;

    if (provider === 'smtp') {
      if (!env.EMAIL_SMTP_HOST || !env.EMAIL_SMTP_USER || !env.EMAIL_SMTP_PASSWORD) {
        return { sent: false, provider, error: 'SMTP is selected but app-server SMTP settings are incomplete.' };
      }
      const port = env.EMAIL_SMTP_PORT || 587;
      const transport = nodemailer.createTransport({
        host: env.EMAIL_SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: env.EMAIL_SMTP_USER, pass: env.EMAIL_SMTP_PASSWORD },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });
      const result = await transport.sendMail({
        from: senderName ? { name: senderName, address: from } : from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      return { sent: true, provider, messageId: result.messageId };
    }

    const apiKey = env.EMAIL_API_KEY;
    if (!apiKey || provider === 'none') {
      return { sent: false, provider, error: 'Email provider is not configured.' };
    }
    let url = '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: Record<string, unknown>;
    if (provider === 'resend') {
      url = 'https://api.resend.com/emails';
      headers.Authorization = `Bearer ${apiKey}`;
      body = { from: formattedFrom, to: [params.to], subject: params.subject, html: params.html, text: params.text };
    } else if (provider === 'postmark') {
      url = 'https://api.postmarkapp.com/email';
      headers['X-Postmark-Server-Token'] = apiKey;
      body = { From: formattedFrom, To: params.to, Subject: params.subject, HtmlBody: params.html, TextBody: params.text, MessageStream: 'outbound' };
    } else if (provider === 'sendgrid') {
      url = 'https://api.sendgrid.com/v3/mail/send';
      headers.Authorization = `Bearer ${apiKey}`;
      body = { personalizations: [{ to: [{ email: params.to }] }], from: { email: from, name: senderName }, subject: params.subject, content: [{ type: 'text/plain', value: params.text }, { type: 'text/html', value: params.html }] };
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
