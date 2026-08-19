# Fast2SMS — setup and remaining work

KoshalCity already sends **register OTP** and **forgot-password OTP** through Fast2SMS when `FAST2SMS_API_KEY` is set. This file is the checklist to go live and to add the rest of SMS later.

Docs: [Send OTP](https://docs.fast2sms.com/reference/send-otp) · [DLT SMS](https://docs.fast2sms.com/reference/dlt-sms)

---

## Already in the app

- [x] `backend/app/services/sms.py` — generate OTP, send via Fast2SMS, hash in Redis, verify locally
- [x] Register: `POST /auth/otp/send` `{ purpose: "register" }` then `POST /auth/register` with `otp`
- [x] Forgot password: `POST /auth/forgot-password` then `POST /auth/reset-password-otp`
- [x] `GET /auth/sms-status` so the UI shows OTP only when SMS is enabled
- [x] Rate limits: 60s resend cooldown, 5 OTPs per number per hour
- [x] Without an API key, local/demo skips OTP (email reset still works)
- [x] Admin-created users skip OTP

---

## To do before production OTP

### Account and wallet

- [ ] Create a Fast2SMS account at [fast2sms.com](https://www.fast2sms.com) and complete KYC
- [ ] Add wallet credit (start with ₹500–1000)
- [ ] Copy the API key from Dev / API settings — **never commit it**

### DLT (required for real Indian SMS)

Do **not** ship production traffic on Quick SMS / random sender IDs.

- [ ] Register Principal Entity on operator DLT (Jio / Airtel / Vi / BSNL) with GST / CIN
- [ ] Approve a 6-letter sender header (e.g. `KSHAAT` or `KSCITY`)
- [ ] Approve OTP templates with 2026 variable tags, for example:
  - Register: `Your KoshalCity code is {#numeric#}. Valid {#numeric#} min. Do not share.`
  - Forgot password: `Your KoshalCity password reset OTP is {#numeric#}. Do not share.`
- [ ] In Fast2SMS **DLT Manager**, add Entity ID, Sender ID, and content templates
- [ ] Create a **Smart OTP** template and copy `otp_id`

### Env / ops

- [ ] Put secrets in `backend/.env` (not git):

```
FAST2SMS_API_KEY=
FAST2SMS_OTP_ID=
FAST2SMS_OTP_EXPIRY_MINUTES=10
OTP_RESEND_SECONDS=60
OTP_MAX_PER_HOUR=5
```

- [ ] Restart uvicorn after changing env
- [ ] Confirm Redis is up (`docker compose ps`) — OTP hashes live there
- [ ] Confirm `GET http://127.0.0.1:8000/api/v1/auth/sms-status` → `"enabled": true`
- [ ] Send a test register OTP to your own 10-digit number
- [ ] Send a test forgot-password OTP to a seeded or real account
- [ ] Confirm resend cooldown and wrong-OTP lockout (5 attempts)

Until `FAST2SMS_OTP_ID` is set, the app uses Fast2SMS `route=otp` (generic “Your OTP: …”). That is fine for your own tests only.

---

## To do in the product (not built yet)

### Admin

- [ ] Admin → Config → SMS (same pattern as SMTP): enable flag, API key, `otp_id`, sender, test-OTP button
- [ ] Mask the API key in the UI; do not return it on GET
- [ ] Low-wallet warning (Fast2SMS balance / delivery reports)

### More OTP / messages

- [ ] **Order handover OTP** — SMS the consumer `orders.completion_otp` when a quote is accepted; still verify in-app against the DB (do not use Fast2SMS verify for this)
- [ ] DLT transactional SMS (needs `send_dlt` + message IDs):
  - [ ] New lead / broadcast → provider
  - [ ] New quote → consumer
  - [ ] Provider approved / revoked
- [ ] Optional: login OTP instead of (or in addition to) password
- [ ] `whatsapp_opt_in` / SMS opt-in on register and profile

### Reliability

- [ ] Queue SMS on Redis instead of blocking the HTTP request
- [ ] Delivery report webhook / logs in Admin
- [ ] Smart OTP WhatsApp fallback (Fast2SMS Smart OTP tab; still SMS-first)
- [ ] Alert when Fast2SMS returns failure so users are not stuck after “OTP sent”

### Templates (once DLT IDs exist)

Add env (or Admin Config) for:

- [ ] `FAST2SMS_DLT_SENDER`
- [ ] `FAST2SMS_MSG_LEAD`
- [ ] `FAST2SMS_MSG_QUOTE`
- [ ] `FAST2SMS_MSG_PROVIDER_STATUS`

Use `{#numeric#}` / `{#alphanumeric#}` / `{#url#}` in new DLT templates (TRAI 2026 tagging).

---

## Out of scope here

WhatsApp Business Cloud API (leads with buttons, two-way chat) is separate from Fast2SMS OTP. Fast2SMS can later wrap WhatsApp OTP fallback; full WABA alerts are a different project.
