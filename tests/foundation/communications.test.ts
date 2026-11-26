const smtpMock = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: smtpMock.createTransport },
}));

import { describe, expect, it, vi } from 'vitest';
import { salePlacedSms, deliveryDeliveredSms, paymentReceivedSms } from '../../api/_lib/notifications';
import { canSendTransactionalEmail, renderCommunicationEmail, renderOrderEmail, sendEmail } from '../../api/_lib/email';
import {
  normalizeBangladeshPhone,
  estimateSmsSegments,
  redactSwiftSmsUrl,
  sanitizeProviderResponse,
  swiftSmsError,
  getSwiftSmsBalance,
} from '../../api/_lib/swiftsms';

describe('communications provider safety', () => {

  it('allows transactional reminders unless the customer explicitly opted out', () => {
    expect(canSendTransactionalEmail('granted')).toBe(true);
    expect(canSendTransactionalEmail('unknown')).toBe(true);
    expect(canSendTransactionalEmail(null)).toBe(true);
    expect(canSendTransactionalEmail(undefined)).toBe(true);
    expect(canSendTransactionalEmail('denied')).toBe(false);
  });

  it('sends application email through configured SMTP', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'smtp');
    vi.stubEnv('EMAIL_SMTP_HOST', 'smtp.example.test');
    vi.stubEnv('EMAIL_SMTP_PORT', '587');
    vi.stubEnv('EMAIL_SMTP_USER', 'mailer@example.test');
    vi.stubEnv('EMAIL_SMTP_PASSWORD', 'test-password');
    vi.stubEnv('EMAIL_FROM_NAME', 'UNDERGRADUATE HUB');
    vi.stubEnv('EMAIL_FROM_ADDRESS', 'orders@example.test');
    smtpMock.createTransport.mockReturnValue({ sendMail: smtpMock.sendMail });
    smtpMock.sendMail.mockResolvedValue({ messageId: 'message-123' });

    await expect(sendEmail({
      to: 'customer@example.test',
      subject: 'Delivery reminder',
      html: '<p>Reminder</p>',
      text: 'Reminder',
    })).resolves.toEqual({ sent: true, provider: 'smtp', messageId: 'message-123' });
    expect(smtpMock.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
    }));
    expect(smtpMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: 'UNDERGRADUATE HUB', address: 'orders@example.test' },
      to: 'customer@example.test',
      subject: 'Delivery reminder',
    }));
    vi.unstubAllEnvs();
  });

  it('renders polished order and delivery confirmation emails safely', () => {
    const data = {
      customerName: 'Sam Customer',
      receiptNumber: 'RCP-1001',
      createdAt: '2026-11-25T10:00:00.000Z',
      scheduledAt: '2026-11-27T10:00:00.000Z',
      location: 'Dhaka',
      items: [{ name: 'Book <script>', sku: 'BK-1', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100,
      discount: 0,
      deliveryFee: 0,
      total: 100,
      paid: 100,
      due: 0,
      currency: 'BDT',
      businessName: 'UNDERGRADUATE HUB',
    };
    const orderEmail = renderOrderEmail(data);
    const deliveryEmail = renderOrderEmail({ ...data, emailType: 'delivery_confirmation' });

    expect(orderEmail).toContain('ORDER CONFIRMATION');
    expect(orderEmail).toContain('Thanks for your order, Sam');
    expect(orderEmail).toContain('name="viewport"');
    expect(orderEmail).toContain('Book &lt;script&gt;');
    expect(orderEmail).not.toContain('<script>');
    expect(deliveryEmail).toContain('DELIVERY CONFIRMED');
    expect(deliveryEmail).toContain('Your order has arrived, Sam');
  });

  it('escapes administrator-composed email content', () => {
    const html = renderCommunicationEmail({
      businessName: 'UNDERGRADUATE HUB',
      message: '<script>alert(1)</script>\nOrder update',
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br>Order update');
    expect(html).not.toContain('<script>');
  });

  it('normalizes Bangladeshi phone numbers', () => {
    expect(normalizeBangladeshPhone('+8801712345678')).toBe('01712345678');
    expect(normalizeBangladeshPhone('8801812345678')).toBe('01812345678');
    expect(normalizeBangladeshPhone('01712345678')).toBe('01712345678');
    expect(normalizeBangladeshPhone('12345')).toBeNull();
  });

  it('estimates ASCII and Unicode segment counts', () => {
    expect(estimateSmsSegments('Hello')).toEqual({ encoding: 'GSM-7', segments: 1 });
    expect(estimateSmsSegments('নমস্কার')).toEqual({ encoding: 'UCS-2', segments: 1 });
  });

  it('redacts API keys from URLs and provider objects', () => {
    expect(redactSwiftSmsUrl('https://example.com/send?apikey=secret&x=1')).not.toContain('secret');
    expect(sanitizeProviderResponse({ apikey: 'secret', code: '1007' })).toEqual({ code: '1007' });
  });

  it('maps transient and terminal SwiftSMS codes', () => {
    expect(swiftSmsError('1005').retryable).toBe(true);
    expect(swiftSmsError('1007').retryable).toBe(false);
    expect(swiftSmsError('1012').message).toContain('Invalid Phone');
  });

  it('formats sale, delivery, and payment SMS exactly', () => {
    expect(salePlacedSms({ customerName: 'ASHIK Mahmud', phone: '01712345678', receiptNumber: 'RCP-2026-628072615', totalAmount: 89 })).toBe('Dear ASHIK, your order has been placed. Rcpt: RCP-2026-628072615. Total: BDT 89.00. UNDERGRADUATE HUB');
    expect(deliveryDeliveredSms({ customerName: 'ASHIK Mahmud', phone: '01712345678', receiptNumber: 'RCP-2026-628072615', totalAmount: 89 })).toBe('Dear ASHIK, your order RCP-2026-628072615 has been delivered successfully. Thank you. UNDERGRADUATE HUB');
    expect(paymentReceivedSms({ customerName: 'ASHIK Mahmud', phone: '01712345678', receiptNumber: 'RCP-2026-628072615', totalAmount: 89, amount: 89 })).toBe('Dear ASHIK, payment of BDT 89.00 received for order RCP-2026-628072615. Thank you. UNDERGRADUATE HUB');
  });

  it('parses live balance JSON from a mocked provider', async () => {
    process.env.SWIFTSMS_API_KEY = 'test-only-key';
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ available: 798, used: 958 }), { status: 200 }),
      );
    await expect(getSwiftSmsBalance(mockFetch as typeof fetch)).resolves.toEqual({
      available: 798,
      used: 958,
    });
  });
});
