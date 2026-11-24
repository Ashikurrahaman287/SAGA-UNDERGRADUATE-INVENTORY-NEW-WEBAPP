# Communications

## Architecture

Communications is Admin-only and uses server-runtime provider configuration. The browser never receives SMS/email provider keys or raw SwiftSMS URLs.

Migration 023 extends `communication_logs` with channel/label/template, recipient/customer/entity/idempotency/provider fields, and immutable no-update/no-delete privileges. It adds `communication_templates` and persistent `communication_rate_limits`. Migration 024 adds reserve/completion RPCs for queued-to-result send state.

## SwiftSMS

The adapter validates 11-digit Bangladeshi mobile numbers and normalizes `+880` or `880` inputs to `01XXXXXXXXX`. Multi-recipient SMS joins normalized recipients with `+`, with API plus-delimiter intentionally preserved in query construction.

Balance lookup calls `GET /api/sms/getbalance` with the server key and validates numeric fields. Send calls use an AbortController timeout and URL-encode the message. Raw URLs are never logged or returned.

Segment estimation is ASCII/GSM-7 at 160 characters for one segment and 153 per additional segment; Unicode/UCS-2 uses 70 and 67 characters respectively.

SwiftSMS codes 1002–1015 are mapped to human-readable terminal or retryable results. 1005, 1006, 1013, network errors, and timeouts are retryable. Provider delivery status is never marked `delivered` unless an explicitly successful provider response confirms it; this implementation records provider acceptance as `sent` and failures truthfully.

## Consent

For customer-linked SMS recipients, explicit `sms` consent must equal `granted`. Missing, denied, or unknown consent creates `rejected_consent` and excludes the recipient from provider dispatch. Promotional sends require the promotional label; transaction sends default to transactional. Email dispatch currently returns 501 until a real email provider is explicitly configured; no mock email send is claimed.

## Idempotency and rate limiting

Dispatch requires an idempotency key. The reserve RPC creates or reuses an immutable per-recipient log under organization scope and duplicate key/recipient. Persistent communication rate limits apply per organization/user; transaction and campaign limits are server-side and can be increased only through configuration policy.

## API

- `GET /api/communications/sms/balance`
- `GET/PUT /api/communications/templates`
- `POST /api/communications/send`
- `GET /api/communications/logs`

All endpoints require the `communications.manage/send/view` Admin permissions. Moderator and Rider receive 403. Browser role/organization fields are never trusted.

## Secret and log safety

`SWIFTSMS_API_KEY`, optional base URL, and future email secrets are server environment variables. The adapter redacts `apikey` in URLs and provider objects. Provider responses stored in logs contain no raw key; audit records contain no provider credentials.

## Testing

Automated tests use mocked fetch responses and cover number normalization, segment estimates, URL/redaction, balance parsing, and SwiftSMS code mappings. Live sends are excluded from tests. Staging must validate real consent joins, duplicate sends, persistent limits, provider timeouts, 1002–1015 behavior, RLS, and cross-organization isolation.
