# LocalSync App Workflow

## Overview

LocalSync is a hyper-local marketplace that connects **consumers** with nearby **verified providers** for products and services.

**Stack:** React (Vite) · FastAPI · JWT · PostgreSQL/PostGIS · Redis · WebSockets

**Core goals:**

- discover local providers by category
- chat before committing
- send a request to selected providers **or** broadcast nearby
- collect quotes, agree delivery + payment
- complete orders with OTP
- build trust with mutual ratings and provider verification

---

## Roles

| Role | Who | Home after login |
|------|-----|------------------|
| **Consumer** | Needs a product/service nearby | `/consumer/details` |
| **Provider** | Offers products/services | `/provider/overview` |
| **Admin** | Verifies providers, manages platform | `/admin/providers` |

Guests land on `/` (public landing). Logged-in users are redirected to their role home.

---

## End-to-end happy path

```text
Guest search / browse
        │
        ▼
Consumer registers / logs in (+ GPS or pincode)
        │
        ▼
Browse providers by category ──► Chat & ask (while provider online)
        │
        ├─ Targeted: select 1+ providers ──► Post request to them only
        └─ Broadcast: post request to nearby verified providers
                │
                ▼
Provider sees lead ──► Chat & ask ──► Send quote
                │
                ▼
Consumer accepts quote (delivery mode + payment mode)
                │
                ▼
Order: CONFIRMED → IN_PROGRESS → (optional DISPUTED/CANCELLED)
                │
                ▼
Consumer shares OTP → Provider completes → both rate each other
```

---

## Public / guest flow

1. Open `/` — landing with search and category browse.
2. Search products/services (`GET /providers/public-search`).
3. Browse category catalog (`GET /providers/public-catalog`).
4. Open a provider’s public page at `/p/:userId`.
5. To chat or request, guest is prompted to **register / log in**.

Public provider page shows:

- business name, categories, about, offerings
- online status, rating, hours, map
- optional **Website / Instagram / YouTube** links

---

## Consumer workflow

### Sidebar sections

| Route | Purpose |
|-------|---------|
| `/consumer/details` | Profile summary |
| `/consumer/providers` | Browse providers; chat; select for targeted request |
| `/consumer/inquiries` | Pre-request chats |
| `/consumer/post` | Create targeted or broadcast request |
| `/consumer/requests` | Own requests |
| `/consumer/requests/:id` | Quotes for one request; accept deal |
| `/consumer/quotes` | All quotes received |
| `/consumer/orders` | Orders list → `/orders/:id` |

Also: `/profile` for full contact/address edit.

### 1. Register and location

Consumer signs up with role, name, phone, password, and location.

- Device GPS stored when available
- Otherwise a **6-digit pincode** is needed for matching

### 2. Complete profile (`/profile`)

Address, city/state, pincode, email, alternate phone — improves matching and contactability.

### 3. Browse providers (`/consumer/providers`)

Pick a category/subcategory. List splits **Online** / **Offline**.

Each card shows business name, offerings, rating, hours, GST, map link.

Actions:

- **View profile** → `/p/:userId`
- **Chat & ask** (online providers only) — pre-request inquiry
- **Checkbox** — select one or more for a targeted request  
  → **Send request to selected** opens Post with targeted mode

### 4. Chat before requesting

Inquiry chat is **not** tied to a request/order.

- Consumer can open multiple 1:1 chats
- New chats require the provider to be **approved + online**
- Existing threads can continue even if the provider goes offline

### 5. Post a request (`/consumer/post`)

Fields: category, title, details, optional attachments, location.

**Send modes:**

| Mode | Behavior |
|------|----------|
| **Broadcast** | Notify verified nearby providers in that category (geo 5 km or same pincode) |
| **Selected** | Notify only the checked provider user IDs |

Targeted requests do not use geo matching for who gets notified.

### 6. Quotes and accept (`/consumer/requests/:id`)

While waiting, consumer can **Chat** with quoting providers.

When accepting a quote, consumer chooses:

- **Delivery / fulfillment**
  - `PROVIDER_DELIVERY`
  - `CONSUMER_PICKUP`
  - `HOME_SERVICE`
- **Payment mode**
  - `CASH` · `UPI` · `CARD` · `BANK_TRANSFER` · `OTHER`

Accepting locks the deal → creates an **Order**, marks request `FULFILLED`, rejects sibling quotes, shows **OTP** to the consumer.

### 7. Order completion (`/orders/:id`)

Statuses:

| Status | Meaning |
|--------|---------|
| `CONFIRMED` | Deal locked; OTP visible to consumer |
| `IN_PROGRESS` | Work / delivery underway |
| `DISPUTED` | Issue raised; can resume to `IN_PROGRESS` |
| `CANCELLED` | Closed without completion |
| `COMPLETED` | Provider submitted correct consumer OTP |

- Both parties can chat on the order while it is open
- Consumer shares OTP only at handover
- Provider enters OTP → `COMPLETED`
- After completion, **both** can rate and review each other

---

## Provider workflow

### Sidebar sections

| Route | Purpose |
|-------|---------|
| `/provider/overview` | Status, go online, public link |
| `/provider/inquiries` | Consumer pre-request chats |
| `/provider/requests` | Leads (targeted + nearby broadcast) |
| `/provider/quote` | Submit a quote |
| `/provider/quotes` | Quotes sent |
| `/provider/orders` | Orders → `/orders/:id` |

Also: `/profile` for business onboarding.

### 1. Register

Provider registration is a **full-page form** and requires:

- account details (name, business name, phone, email, password, location)
- **Services & categories** (at least one category) + offer kind
- **About** (business description)
- **What they offer** (detailed offerings)
- **Aadhaar card upload** (image or PDF)
- **GST number** (optional, if any)

After submit, the provider sees:

> Thank you for registration, your account is being currently reviewed. Please keep checking email from us in next 24hrs.

**Login is blocked** until an admin approves the account (`PENDING` / `REJECTED` cannot sign in).

Transactional emails (when Admin SMTP is enabled):

1. **On register:** thank you; account under review; check email within 24 hours  
2. **On admin approve:** congratulations; account activated; you can log in and create your listing  

### 2. Onboarding (`/profile`)

Required for verification / going online:

- Business / shop name
- Offer kind: Product / Service / Both
- Categories & subcategories
- **About** (short description)
- **What you offer** (detailed offerings)
- Opening / closing hours
- GST, Aadhaar (and document uploads)
- Max travel radius
- Optional: **Website**, **Instagram**, **YouTube**

Account stays `PENDING` until admin approves.

### 3. Go online (`/provider/overview`)

Only **APPROVED** providers can go online and receive chat / live leads.

Public page: `/p/{user_id}` (shareable).

### 4. Handle leads (`/provider/requests`)

Feed includes:

- **Broadcast** requests that geo/pincode-match the provider
- **Targeted** requests that explicitly include this provider

Per lead:

1. **Chat & ask** — clarify with the consumer  
2. **Send quote** — price, ETA (days), message, optional catalog URL / attachments  

### 5. Fulfill order

After consumer accepts:

- Chat on the order
- Mark **In progress** / Disputed / Cancel as needed
- Collect consumer OTP → **Mark completed**
- Rate the consumer

---

## Admin workflow

| Route | Purpose |
|-------|---------|
| `/admin/providers` | Approve / reject providers |
| `/admin/consumers` | List consumers; delete users |
| `/admin/orders` | Platform orders |
| `/admin/categories` | Create / activate / deactivate categories & subcategories |
| `/admin/config` | SMTP settings + test email |

Provider verify: `POST /providers/{user_id}/verify` with `APPROVED` or `REJECTED`.

---

## Matching rules

| Situation | Rule |
|-----------|------|
| User has GPS | Prefer providers / requests within **5 km** |
| No GPS, has pincode | Match **same pincode** |
| Geo empty but shared pincode | Pincode fallback still applies for broadcast feed |
| Targeted request | Only selected provider IDs are notified; no geo fan-out |

Providers must be **verified (APPROVED)** to receive broadcast notifications and to quote.

---

## Chat systems

| Chat | When | Linked to |
|------|------|-----------|
| **Inquiry chat** | Before (and alongside) requests | Consumer ↔ Provider only |
| **Order chat** | After quote accepted | Specific `order_id` |

Real-time: WebSockets (+ Redis pub/sub for multi-instance fan-out).

---

## Status machines

### Request

`ACTIVE` → `FULFILLED` (when a quote is accepted)

Also defined: `EXPIRED`, `CANCELLED` (reserved).

### Quote

`PENDING` → `ACCEPTED` (chosen) or `REJECTED` (siblings)

Also defined: `WITHDRAWN` (reserved).

### Order

`CONFIRMED` → `IN_PROGRESS` → `COMPLETED` (via OTP)

Also: `DISPUTED`, `CANCELLED` from mid-flow.

---

## Trust & safety (current MVP)

- Admin KYC review (docs, Aadhaar/GST fields) before providers go live
- Pending provider accounts cannot go online or quote
- Completion OTP reduces false “delivered” claims
- Mutual ratings after completed orders
- Public profiles for transparency (no sensitive docs exposed)

---

## Key screens (quick map)

| Audience | Paths |
|----------|--------|
| Guest | `/`, `/login`, `/register`, `/p/:userId` |
| Consumer | `/consumer/*`, `/profile`, `/orders/:id` |
| Provider | `/provider/*`, `/profile`, `/orders/:id` |
| Admin | `/admin/*` |

---

## Demo accounts

| Role | Phone | Password |
|------|-------|----------|
| Admin | `9000000001` | `admin123` |
| Consumer | `9000000002` | `consumer123` |
| Provider | `9000000003` | `provider123` |

---

## Notes for operators

- Restart backend after schema updates so startup migrations apply (`target_mode`, `request_targets`, `payment_mode`, social URL columns, SMTP table, etc.).
- Provider registration/approval emails need **Admin → Config** SMTP enabled with a valid from-address.
- Matching quality depends on accurate GPS **or** pincode on both consumer and provider profiles.
