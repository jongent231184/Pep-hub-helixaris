# Niftipay integration notes (card acquiring replacing/alongside Xoala)
Docs: https://www.niftipay.com/docs/api/fiat-orders , /docs/api/webhooks , /docs/api/fiat-integrations
Base URL: https://www.niftipay.com   Auth header: `x-api-key: <API KEY>`
No sandbox documented — live only. Hosted checkout (redirect), no iframe.

## Create order
POST /api/fiat/orders  body: {integrationId, amount:"68.00" (or amountCents), currency:"GBP", description, reference (unique across account, <=80 chars; 409 if dup),
 serviceFeePayer:"customer"|"merchant" (default = account setting), email, firstName, lastName, phone(E.164), country("GB"), returnUrl?, failureUrl?}
201 -> { order:{id, orderKey, status:"new", amountCents, subtotalCents, serviceFeeCents, merchantReference, pspOrderId}, pricing, display:{subtotal,serviceFee,total,currency}, payUrl, qrUrl }
Redirect customer to payUrl. NEVER mark paid on returnUrl — wait for webhook.
Errors: 403 "Payment method disabled" (fiat off / chargeback threshold), 409 ref conflict, 502 upstream.
GET /api/fiat/orders/:orderKey -> {order, pricing, fees, payUrl}
DELETE /api/fiat/orders/:orderKey (cancel) ; DELETE /api/fiat/orders/cancel?reference=
Refunds: GET/POST /api/fiat/orders/:orderKey/refunds  body {amountCents, description}; partial ok; ceiling = amountCents (customer pays fee) or subtotalCents (merchant pays fee)
Store orderKey + our reference on the order.

## Webhook
Registered URL path is FORCED to end with /niftipay/webhook -> our endpoint must be  POST https://www.ghp-health.com/api/niftipay/webhook  (register "https://www.ghp-health.com/api" in dashboard Settings→Fiat integration merchantWebhookUrl or Settings→Webhooks)
Headers: x-webhook-id, x-timestamp (unix secs), x-signature "v1=<hex hmac sha256>"  signed = HMAC_SHA256(secret, f"{ts}.{raw_body}")
Reject |now-ts|>300s. On bad signature return 500 while debugging (401 = non-retryable, event dropped). Return 200 fast; dedupe on (event, order.id).
Payload: {event: pending|paid|cancelled|expired|refunded|chargeback|risk_alert|test, order:{id, merchantReference, amountCents, currency, status, pspOrderId,...}, nopayn:{...}}
Test: POST /api/user/webhooks/:id/test (x-api-key) sends event "test" — handle gracefully (200, ignore).
Retries: 3 attempts, 15 min apart, 15s timeout. Redirects not followed (register the www https URL).

## Secrets needed (collect via secrets_request): NIFTIPAY_API_KEY, NIFTIPAY_INTEGRATION_ID, NIFTIPAY_WEBHOOK_SECRET
## Existing code to mirror: backend/routes/xoala_routes.py (payment session create / webhook / refund), frontend Checkout.jsx payment options, PayLinkPage.jsx, admin order refund UI, payments_paused guard (503 when paused).

## USER DECISIONS (Nov 2026)
- Niftipay ONLY at checkout: hide Wallid + bank-transfer options when Niftipay configured (keep code; admin can re-enable via settings flag `card_provider`='niftipay'). Xoala dormant.
- serviceFeePayer: do NOT send (use dashboard default); user wants merchant absorbs → tell user to set default=merchant in Niftipay dashboard Settings→Fiat.
- Webhook: production https://www.ghp-health.com/api/niftipay/webhook . Our route: POST /api/niftipay/webhook (raw body HMAC).
- Un-pause: user wants payments un-paused once live checkout verified — agent CANNOT write prod DB; user flips Admin→Settings payments_paused, or add admin button. Remind user.
- Secrets to collect via secrets_request: NIFTIPAY_API_KEY, NIFTIPAY_INTEGRATION_ID, NIFTIPAY_WEBHOOK_SECRET

## Status 23/11/2026
- Implemented: backend/routes/niftipay_routes.py (config, create-payment, webhook w/ HMAC + API-confirm fallback, status poll, admin refund), Checkout.jsx Niftipay-only card button (Wallid/Xoala removed, bank transfer kept), OrderConfirmation polling (?niftipay=1), AdminOrderDetail refund.
- Integration ID + API key set via secrets. NIFTIPAY_WEBHOOK_SECRET still NOT set -> webhook falls back to confirming every event against Niftipay API.
- Live create-payment currently returns Niftipay 403 account_not_activated (contract unsigned). Payments remain PAUSED in production until live checkout verified.
- Preview DB payments_paused=false for testing.
