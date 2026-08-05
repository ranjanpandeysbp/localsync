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
Consumer registers / logs in (+ GPS, city, pincode)
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
2. **Your area** shows the local place name with GPS coordinates in parentheses, e.g. `Indiranagar 1st Stage (12.9784, 77.6408)`. Guests can also enter a pincode.
3. Search products/services (`GET /providers/public-search`).
4. Browse category catalog (`GET /providers/public-catalog`).
5. Open a provider’s public page at `/p/:slug` (friendly shop-name URL; legacy `/p/:userId` still works).
6. To chat or request, guest is prompted to **register / log in**.

Public provider page shows:

- business name, categories, about, offerings
- online status, rating, hours, map
- optional **Website / Instagram / YouTube** links
- shareable public link with copy action

---

## Auth / registration

### Sign in (`/login`)

- Phone field is **trimmed** (leading/trailing spaces) on Sign in.
- Demo credentials are shown on the page.

### Register (`/register`)

Wide layout for both consumer and provider. Top-left **home** icon returns to landing. **Sign in** link is styled in blue.

**Shared fields (both roles):**

- Full name, phone, email (required for provider; optional for consumer), password
- **City / locality** and **Pincode** — always shown, editable; auto-filled from GPS via reverse geocoding
- **Location** status — local place name with coordinates, e.g. `Indiranagar 1st Stage · 12.97840, 77.64080`
- Reverse geocode prefers **local** names (neighbourhood / suburb) over generic admin labels, and also fills **state** when available

**Provider-only sections:**

- Business / shop name
- Services & categories (at least one) + offer kind
- About + What they offer
- Aadhaar upload (required) + optional GST

After provider submit: pending-review message; **login blocked** until admin approval. Emails send when Admin SMTP is enabled.

---

## Consumer workflow

### Sidebar sections

| Route | Purpose |
|-------|---------|
| `/consumer/details` | Profile summary → Edit profile |
| `/consumer/providers` | Browse providers; chat; select for targeted request |
| `/consumer/inquiries` | Pre-request chats |
| `/consumer/post` | Create targeted or broadcast request |
| `/consumer/requests` | Own requests (+ **Create a Request** → `/consumer/post`) |
| `/consumer/requests/:id` | Quotes for one request; accept deal |
| `/consumer/quotes` | All quotes received |
| `/consumer/orders` | Orders list → `/orders/:id` |

Also: `/profile` for full contact/address edit.

### 1. Register and location

Consumer signs up with role, name, phone, password, city, pincode, and GPS when available.

- Device GPS stored when available; city/pincode auto-filled from coordinates
- City and pincode remain editable
- Valid 6-digit pincode is required

### 2. Complete profile (`/profile`)

Address, city, **state** (auto-filled from GPS when possible), pincode, email, alternate phone.

- **Detect location** (with location icon) fills coords, place label, city, state, pincode
- **Save** shows a popup: **Profile Updated Successfully**

### 3. Browse providers (`/consumer/providers`)

Pick a category/subcategory. List splits **Online** / **Offline**.

Each card shows business name, offerings, rating, hours, GST, map link.

Actions:

- **View profile** → `/p/:slug` (or user id fallback)
- **Chat & ask** (online providers only) — pre-request inquiry
- **Checkbox** — select one or more for a targeted request  
  → **Send request to selected** opens Post with targeted mode

### 4. Chat before requesting

Inquiry chat is **not** tied to a request/order.

- Consumer can open multiple 1:1 chats
- New chats require the provider to be **approved + online**
- Existing threads can continue even if the provider goes offline

### 5. Post a request (`/consumer/post`)

Also reachable from **My requests → Create a Request**.

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
| `/provider/overview` | Status, go online, public link, quick location |
| `/provider/inquiries` | Consumer pre-request chats |
| `/provider/requests` | Leads (targeted + nearby broadcast) |
| `/provider/quote` | Submit a quote |
| `/provider/quotes` | Quotes sent |
| `/provider/orders` | Orders → `/orders/:id` |

Also: `/profile` for business onboarding.

### 1. Register

Provider registration is a **full-page form** and requires:

- account details (name, business name, phone, email, password)
- city / locality + pincode (GPS auto-fill, editable)
- **Services & categories** (at least one category) + offer kind
- **About** (business description)
- **What they offer** (detailed offerings)
- **Aadhaar card upload** (image or PDF)
- **GST number** (optional, if any)

A unique **public slug** is created from the business / shop name (e.g. `quickfix-plumbing`; duplicates get `-2`, `-3`, …).

After submit, the provider sees:

> Thank you for registration, your account is being currently reviewed. Please keep checking email from us in next 24hrs.

**Login is blocked** until an admin approves the account (`PENDING` / `REJECTED` cannot sign in).

Transactional emails (when Admin SMTP is enabled):

1. **On register:** thank you; account under review; check email within 24 hours  
2. **On admin approve:** congratulations; account activated; you can log in and create your listing  

### 2. Onboarding (`/profile`)

Required for verification / going online:

- Business / shop name (changing it regenerates the public slug if needed)
- Offer kind: Product / Service / Both
- Categories & subcategories
- **About** (short description)
- **What you offer** (detailed offerings)
- Opening / closing hours
- GST, Aadhaar (and document uploads)
- Max travel radius
- Optional: **Website**, **Instagram**, **YouTube**

Account stays `PENDING` until admin approves.

### 3. Overview (`/provider/overview`)

Only **APPROVED** providers can go online and receive chat / live leads.

**Public link** (approved only):

- Friendly URL: `/p/{public_slug}` (e.g. `/p/quickfix-plumbing`)
- Shown as a **blue hyperlink** with an **open-in-new-tab** icon
- **Copy** icon copies the full URL to the clipboard

**Quick location:**

- Longitude / latitude fields
- **Detect location** (location icon) — fills coords from GPS
- **Save** — persists location and travel radius

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

## Location / reverse geocoding

| Capability | Detail |
|------------|--------|
| API | `GET /geo/reverse?latitude=&longitude=` |
| Returns | `location_label`, `city` (local name), `state`, `pincode`, coords |
| Used on | Register, profile Detect location, landing Your area, server-side register fallback |

Local names prefer neighbourhood / suburb / village over generic admin labels (e.g. corporation, urban district).

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
- Friendly public URLs without exposing internal UUIDs by default

---

## Key screens (quick map)

| Audience | Paths |
|----------|--------|
| Guest | `/`, `/login`, `/register`, `/p/:slug` (or `/p/:userId`) |
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

Seeded provider public page example: `/p/quickfix-plumbing`.

---

## Notes for operators

- Restart backend after schema updates so startup migrations apply (`public_slug`, `target_mode`, `request_targets`, `payment_mode`, social URL columns, SMTP table, etc.).
- Existing providers without a slug are backfilled on startup from business name.
- Provider registration/approval emails need **Admin → Config** SMTP enabled with a valid from-address.
- Matching quality depends on accurate GPS **and/or** pincode (plus city) on both consumer and provider profiles.
- Reverse geocoding uses OpenStreetMap Nominatim; allow outbound network from the API host.
