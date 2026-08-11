# Gharq App Workflow

## Overview

Gharq is a hyper-local marketplace that connects **consumers** with nearby **verified providers** for products and services.

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
| **Admin** | Full platform ops: providers, consumers, orders, categories, messages, **customer service agents**, Config/SMTP | `/admin/providers` |
| **Customer service** (`CUSTOMER_SERVICE`) | Same ops as admin **except** Config and managing other CS agents | `/admin/providers` |

Guests land on `/` (public landing). Logged-in users are redirected to their role home.

Staff self-registration is blocked (`ADMIN` / `CUSTOMER_SERVICE`). Only an **Admin** can create, approve, revoke, re-approve, or delete customer service agents.

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

1. Open `/` — landing with full-bleed hero and floating search pad (query + editable pincode + detect-location).
2. Empty pincode on search shows a modal: **Please enter the pincode**.
3. After search, category browse hides; results show matching categories/providers.
4. Without searching, **Popular categories** appear (hide after a completed search).
5. Search products/services (`GET /providers/public-search`). Blank keyword still supports nearby / pincode matching.
6. Browse category catalog (`GET /providers/public-catalog`).
7. Open a provider’s public page at `/p/:slug` (friendly shop-name URL; legacy `/p/:userId` still works).
8. To chat or request, guest is prompted to **register / log in** (modals on the landing page, or deep links `/?login=1` / `/?register=1`).
9. Landing header **Log in** / **Register** open the same auth modals without leaving `/`.

Public provider page shows:

- business name, categories, about, offerings
- online status, rating, hours, map
- optional **Website / Instagram / YouTube** links
- shareable public link with copy action

---

## Auth / registration

Sign-in and registration are **modals on the public landing page** (`/`), not separate full-page screens.

| Action | Opens | Deep link / redirect |
|--------|--------|----------------------|
| **Log in** | Login modal on `/` | `/?login=1` (also `/login` → redirects here) |
| **Register** | Register modal on `/` | `/?register=1` (also `/register` → redirects here) |

- Modals are mutually exclusive; **Create account** / **Sign in** switches between them without leaving the landing page.
- Backdrop click, Escape, or × closes the modal and clears the query param.
- Unauthenticated access to protected routes and logout send the user to `/?login=1`.
- Forgot / reset password remain standalone pages (`/forgot-password`, `/reset-password`).

### Sign in (landing modal)

- Compact dialog over the landing hero (frosted backdrop).
- Phone + password; phone is **trimmed** (leading/trailing spaces) on submit.
- **Forgot password?** → `/forgot-password`
- **Create account** → opens the register modal (`/?register=1`)

### Forgot password

1. User enters phone on `/forgot-password` → `POST /auth/forgot-password`
2. If the account exists, is active, and has an email on file, a reset link is emailed (SMTP must be enabled in Admin → Config)
3. Response is always generic (does not reveal whether the phone is registered)
4. Link opens `/reset-password?token=…` (JWT, expires in 30 minutes by default)
5. User sets a new password → `POST /auth/reset-password` → redirected to sign in (`/?login=1`)

Config: `frontend_url` (link base, default `http://localhost:5173`) and `password_reset_expire_minutes`.

### Register (landing modal)

Scrollable modal on `/` (wider when role is **Provider**). Same fields as before; **Sign in** switches to the login modal.

**Shared fields (both roles):**

- Full name, phone, email (required for provider; optional for consumer), password
- **City / locality** and **Pincode** — always shown, editable; auto-filled from GPS via reverse geocoding when the modal opens
- **Location** status — local place name with coordinates, e.g. `Indiranagar 1st Stage · 12.97840, 77.64080`
- Reverse geocode prefers **local** names (neighbourhood / suburb) over generic admin labels, and also fills **state** when available

**Provider-only sections:**

- Business / shop name
- Services & categories (at least one) + offer kind
- About + What they offer
- Aadhaar upload (required) + optional GST

After provider submit: pending-review message stays in the modal; **login blocked** until admin approval. Emails send when Admin SMTP is enabled. Consumer signup signs in immediately and continues to profile / role home.

---

## Consumer workflow

### Sidebar sections

| Route | Purpose |
|-------|---------|
| `/consumer/details` | Profile summary → Edit profile |
| `/consumer/providers` | Browse providers by category (Online/Offline); chat; select for targeted request |
| `/consumer/inquiries` | **Recent inquiries** — chats updated in the last 30 days; delete chat |
| `/consumer/post` | Create targeted or broadcast request |
| `/consumer/requests` | **My requests** — ACTIVE requests only (+ cancel; **Create a request** → `/consumer/post`) |
| `/consumer/requests/:id` | Quotes for one request; accept deal |
| `/consumer/quotes` | **Received Quotes** |
| `/consumer/orders` | **Orders** — completed deals + cancelled requests → `/orders/:id` |

Also: `/profile` for full contact/address edit (vertical accordion sections).

### 1. Register and location

Consumer signs up with role, name, phone, password, city, pincode, and GPS when available.

- Device GPS stored when available; city/pincode auto-filled from coordinates
- City and pincode remain editable
- Valid 6-digit pincode is required

### 2. Complete profile (`/profile`)

Vertical accordion sections (one open at a time; **Contact & address** open by default):

1. **Contact & address** — name, email, alternate mobile, address lines, city, state, pincode, map location (coords + area label)
2. **Business / shop details** — providers only (see Provider onboarding)
3. **Upload documents** — providers only

Shared contact fields:

- Address, city, **state** (auto-filled from GPS when possible), pincode, email, alternate phone
- **Detect location** (with location icon) fills coords, place label, city, state, pincode
- Fields are a **single-column vertical list** (no side-by-side pairs)
- **Save** shows a popup: **Profile Updated Successfully**

### 3. Browse providers (`/consumer/providers`)

Hero + category select + **Online / Offline** segments. Cards show offer kind, business name, offerings, rating, hours, and map when available.

Actions:

- **View profile** → `/p/:slug` (or user id fallback)
- **Chat & ask** (online providers only) — pre-request inquiry
- **Checkbox** — select one or more for a targeted request  
  → **Send request to selected** opens Post with targeted mode

### 4. Chat before requesting

Inquiry chat is **not** tied to a request/order.

- Consumer can open multiple 1:1 chats
- New chats require the provider to be **approved + online** (within business hours)
- Existing threads can continue even if the provider goes offline
- **Recent inquiries** lists chats with activity in the **last 30 days**
- Consumer can **Delete chat** (in-app confirm popup)

### 5. Post a request (`/consumer/post`)

Also reachable from **My requests → Create a request**.

Fields: category, title, details, optional attachments, location.

**Send modes:**

| Mode | Behavior |
|------|----------|
| **Broadcast** | Notify verified nearby providers in that category (geo 5 km or same pincode) |
| **Selected** | Notify only the checked provider user IDs |

Targeted requests do not use geo matching for who gets notified.

On successful create (broadcast or targeted), the app navigates to **`/consumer/requests`**.

### 6. My requests (`/consumer/requests`)

Shows **ACTIVE** requests only (no status filter chips).

Per card:

- Search by title, description, category, pincode
- Meta chips, attachments, **View quotes**
- Quote-waiting badge when quotes exist
- **Cancel** on active requests (`POST /requests/{id}/close`):
  - No pending quotes → confirm popup → cancel → success; card moves to **Orders** as a cancelled request
  - Pending quotes → reason popup → providers notified via inquiry chat + WS `request_cancelled`

### 7. Quotes and accept (`/consumer/requests/:id` · **Received Quotes**)

While waiting, consumer can **Chat** with quoting providers (icon beside provider name). Provider name links to `/p/{id}`. **Verified** badge and rating appear beside the name; **Accept** sits next to price.

When accepting a quote, consumer chooses:

- **Delivery / fulfillment**
  - `PROVIDER_DELIVERY`
  - `CONSUMER_PICKUP`
  - `HOME_SERVICE`
- **Payment mode**
  - `CASH` · `UPI` · `CARD` · `BANK_TRANSFER` · `OTHER`

Accepting locks the deal → creates an **Order**, marks request `FULFILLED`, rejects sibling quotes, shows **OTP** to the consumer.

### 8. Orders (`/consumer/orders`)

Combines:

- Accepted / completed order deals → `/orders/:id`
- **Cancelled requests** (from My requests cancel flow) as **Cancelled Order** cards

### 9. Order completion (`/orders/:id`)

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
| `/provider/overview` | Hero, KPIs, go online/offline, location & storefront |
| `/provider/inquiries` | Consumer pre-request chats |
| `/provider/support` | **Admin messages** (support threads; unread badge) |
| `/provider/requests` | Leads (targeted + nearby broadcast) |
| `/provider/quote` | Submit a quote |
| `/provider/quotes` | Quotes sent |
| `/provider/orders` | Orders → `/orders/:id` |

Also: `/profile` for business onboarding (vertical accordion sections).

**Limited / revoked access:** if verification is `REVOKED` (or rejected after login allowance), sidebar is limited to **Overview**, **Admin messages**, and **My profile**. Marketplace routes redirect to overview.

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

**Login is blocked** until an admin (or customer service agent) approves the account (`PENDING` / `REJECTED` cannot sign in).

Transactional emails (when Admin SMTP is enabled):

1. **On register:** thank you; account under review; check email within 24 hours  
2. **On admin/CS approve:** congratulations; account activated; you can log in and create your listing  
3. **On admin/CS re-approve** (from Revoked / Rejected): account restored; marketplace features available again  
4. **On admin/CS revoke:** access revoked; profile + Admin messages still available  

### 2. Onboarding (`/profile`)

Same vertical accordion layout as consumer profile. Providers see three sections:

1. **Contact & address**
2. **Business / shop details**
3. **Upload documents**

Required for verification / going online:

- Business / shop name (changing it regenerates the public slug if needed)
- Offer kind: Product / Service / Both
- Categories & subcategories
- **About** (short description)
- **What you offer** (detailed offerings)
- Opening / closing hours (**IST**)
- GST, Aadhaar (and document uploads)
- Max travel radius
- Optional: **Website**, **Instagram**, **YouTube**

Account stays `PENDING` until admin approves.

### 3. Overview (`/provider/overview`)

Layout:

1. **Hero** — business mark, name, Verified + rating, owner/offer line, Online/Offline status pill with hours chip + categories; **Go online/offline** and **Edit profile** (icon on ≤960px)
2. **Verification banners** when pending / rejected / revoked
3. **KPI strip** — Nearby requests, Open orders, Quotes sent (links to those routes when not limited; accent on nearby requests)
4. **Vertical accordions** (one open at a time; **Storefront** first and open by default):
   - **Storefront** — public URL tray (copy + open) + shortcuts grid (marketplace shortcuts hidden when limited; My profile + Admin messages remain)
   - **Location & reach** — Map / Area / Radius chips + Quick update form (Detect + Save; single-column fields)

**Online presence is hours-aware:**

- Effective online = provider toggled online **and** current time is within Opens–Closes (IST)
- Going online is blocked outside business hours; profile sync clears `is_online` when outside hours
- Consumers and matching see the effective online status

Only **APPROVED** providers can go online and receive chat / live leads.

**Public link** (approved only):

- Friendly URL: `/p/{public_slug}` (e.g. `/p/quickfix-plumbing`)
- Highlighted URL tray with **copy** and **open-in-new-tab** icons

**Quick location:**

- Longitude / latitude / max radius fields
- **Detect location** — fills coords from GPS
- **Save location** — persists location and travel radius

### 4. Admin messages (`/provider/support`)

Providers can reply to admin-initiated support threads.

- Unread count badge on **Admin messages** in the sidebar
- Real-time via WebSocket type `admin_message`
- Automatic Admin messages (+ live toast / unread badge when online) when admin:
  - **Approves** a pending provider (`reason: provider_approved`)
  - **Re-approves** a revoked or rejected provider (`reason: provider_reapproved`)
  - **Revokes** an approved provider (`reason: provider_revoked`)
- Matching transactional emails also send when Admin SMTP is enabled

### 5. Handle leads (`/provider/requests`)

Feed includes:

- **Broadcast** requests that geo/pincode-match the provider
- **Targeted** requests that explicitly include this provider

Per lead:

1. **Chat & ask** — clarify with the consumer  
2. **Send quote** — price, ETA (days), message, optional catalog URL / attachments  

### 6. Fulfill order

After consumer accepts:

- Chat on the order
- Mark **In progress** / Disputed / Cancel as needed
- Collect consumer OTP → **Mark completed**
- Rate the consumer

---

## Admin / customer service workflow

| Route | Purpose | Admin | Customer service |
|-------|---------|-------|------------------|
| `/admin/providers` | List / search / filter providers; open detail; orders modal; chat | ✓ | ✓ |
| `/admin/providers/:userId` | Provider detail (edit/save, docs, approve/reject/revoke, chat) | ✓ | ✓ |
| `/admin/consumers` | List / search consumers; delete users | ✓ | ✓ |
| `/admin/orders` | **Order dashboard** — location + date analytics | ✓ | ✓ |
| `/admin/categories` | Manage / create taxonomy | ✓ | ✓ |
| `/admin/messages` | Provider support inbox (search + unread badge) | ✓ | ✓ |
| `/admin/customer-service` | Manage customer service agents (search, create, approve/re-approve/revoke, delete) | ✓ | ✗ |
| `/admin/config` | SMTP settings + test email | ✓ | ✗ |

Provider verify: `POST /providers/{user_id}/verify` with `APPROVED`, `REJECTED`, or `REVOKED`.

### Providers list (`/admin/providers`)

**Search** box filters by phone, email, name (owner or business), or pincode (combined with status filter).

**Add provider** opens a create form (`POST /admin/providers`) — phone, email, password, business details, categories, location. Default is **approve immediately** so the provider can sign in; uncheck to leave as Pending.

Filters: **All / Pending / Approved / Rejected / Revoked / New messages** (unread provider replies).

Per card:

- **Details** → `/admin/providers/:userId`
- **Orders** → modal of that provider’s consumer orders (`GET /admin/orders?provider_id=`)
- Chat icon → detail page messaging (or open chat)
- Approve / Reject / **Revoke** / Re-approve as applicable

**Verification status notifications** (Admin messages thread + optional email + live WS toast):

| Action | Effect |
|--------|--------|
| **Approve** (from Pending) | Activates account; notifies provider (`provider_approved`) |
| **Re-approve** (from Revoked / Rejected) | Restores marketplace access; notifies provider (`provider_reapproved`) |
| **Revoke** (from Approved) | Takes provider offline, locks marketplace features; notifies provider (`provider_revoked`) |

Detail page (`GET /admin/providers/{user_id}`) shows username (login phone), address, city, state, pincode, documents, order count, and a **Chat** action that opens admin↔provider messaging.

Admins can **edit and save**:

- Contact extras (name, email, alternate phone) — login phone stays read-only
- **Address & location** (label, address lines, city, state, pincode, coordinates)
- **Business profile** (name, offer kind, hours, radius, description, offerings, social links, tax ID)
- **Verification documents** (GST / Aadhaar numbers; replace Aadhaar, GST, government ID, business registration files)

**APIs:** `PATCH /admin/providers/{user_id}` · `POST /admin/providers/{user_id}/documents?doc_type=`

### Customer service agents (`/admin/customer-service`) — **admin only**

Sidebar nav link **Customer service agents** appears for **Admin** only (not for CS agents).

| Capability | Detail |
|------------|--------|
| **List** | All users with role `CUSTOMER_SERVICE` |
| **Search** | Name, phone, email, or status (`PENDING` / `APPROVED` / `REVOKED`) |
| **Create agent** | Form: full name, phone, email, temporary password; optional **Approve immediately** |
| **Approve** | From Pending → agent can sign in (`is_active` + `is_verified`) |
| **Revoke** | From Approved → blocks sign-in; enables Re-approve |
| **Re-approve** | From Revoked → restores sign-in |
| **Delete** | Permanently removes the account |

Status is derived from flags: Pending = never approved; Approved = active + verified; Revoked = verified but inactive.

Created agents default to **Pending** unless “Approve immediately” is checked. Pending and revoked agents cannot log in.

**APIs:**

- `GET /admin/customer-service-agents`
- `POST /admin/customer-service-agents`
- `POST /admin/customer-service-agents/{id}/approve`
- `POST /admin/customer-service-agents/{id}/revoke`
- `POST /admin/customer-service-agents/{id}/reapprove`
- `DELETE /admin/users/{id}` (admin deleting a CS agent)

### Consumers list (`/admin/consumers`)

**Search** box filters by phone, email, name, or pincode. Cards show contact, rating, location, and delete.

### Order dashboard (`/admin/orders`)

Nav label: **Order dashboard**.

Reports for consumers, providers, and orders by location and date:

| Control | Options |
|---------|---------|
| Date range | 7 / 30 / 90 days, this month, all time, or **custom** From/To |
| Group by | State · City · Area (`location_label`) · Pincode |
| Order geo from | Consumer or provider profile location |
| Location filters | Cascading state / city / area / pincode |

KPIs: consumers, providers, orders, completed, completed GMV.

Also: location breakdown **table**, collapsible orders-in-range list.

**APIs:**

- `GET /admin/analytics?group_by=&location_of=&state=&city=&area=&pincode=&date_from=&date_to=`
- `GET /admin/orders?provider_id=&date_from=&date_to=`

Area maps to `User.location_label`. Order pincode can fall back to `ServiceRequest.request_pincode` when grouping by pincode.

### Categories (`/admin/categories`)

1. **Manage category** (default) — search, counts, activate/deactivate, add subcategory  
2. **Create category** — shown after **+ Create category**; hides manage until back/cancel/success  

Kind color coding: **Services** (blue), **Products** (amber), **Products & services** (green).

### Admin ↔ provider messaging

- Models / API under `/support-conversations` (list, create, messages, read, unread-count)
- Admin nav: **Provider messages** with unread badge and search (business name, owner name, last message)
- Provider nav: **Admin messages** with unread badge
- WebSocket event: `admin_message`
- Threads cleaned up when an admin deletes the provider user

---

## Matching rules

| Situation | Rule |
|-----------|------|
| User has GPS | Prefer providers / requests within **5 km** |
| No GPS, has pincode | Match **same pincode** |
| Geo empty but shared pincode | Pincode fallback still applies for broadcast feed |
| Targeted request | Only selected provider IDs are notified; no geo fan-out |

Providers must be **verified (APPROVED)** to receive broadcast notifications and to quote.

Consumers browsing “online” providers see **effective online** status (toggled on + within business hours IST).

---

## Location / reverse geocoding

| Capability | Detail |
|------------|--------|
| API | `GET /geo/reverse?latitude=&longitude=` |
| Returns | `location_label`, `city` (local name), `state`, `pincode`, coords |
| Used on | Register, profile Detect location, landing search area, server-side register fallback |
| Analytics “area” | Groups by `User.location_label` |

Local names prefer neighbourhood / suburb / village over generic admin labels (e.g. corporation, urban district).

---

## Chat systems

| Chat | When | Linked to |
|------|------|-----------|
| **Inquiry chat** | Before (and alongside) requests | Consumer ↔ Provider only |
| **Order chat** | After quote accepted | Specific `order_id` |
| **Admin support chat** | Admin ↔ provider support | `AdminConversation` |

Real-time: WebSockets (+ Redis pub/sub for multi-instance fan-out).

---

## Status machines

### Request

`ACTIVE` → `FULFILLED` (when a quote is accepted)  
`ACTIVE` → `CANCELLED` (consumer cancel from My requests)

Also defined: `EXPIRED`.

### Quote

`PENDING` → `ACCEPTED` (chosen) or `REJECTED` (siblings)

Also defined: `WITHDRAWN` (reserved).

### Order

`CONFIRMED` → `IN_PROGRESS` → `COMPLETED` (via OTP)

Also: `DISPUTED`, `CANCELLED` from mid-flow.

### Provider verification

`PENDING` → `APPROVED` | `REJECTED`  
`APPROVED` → `REVOKED` (admin) → can be re-approved

### Customer service agent access

`PENDING` → `APPROVED` (admin Approve)  
`APPROVED` → `REVOKED` (admin Revoke) → `APPROVED` (admin Re-approve)  
Delete removes the user entirely.

---

## Trust & safety (current MVP)

- Admin KYC review (docs, Aadhaar/GST fields) before providers go live
- Pending provider accounts cannot go online or quote
- Admin can **revoke** approved providers (limited nav + Admin messages notice)
- Admin **approve** and **re-approve** also notify the provider (Admin messages + email when SMTP enabled)
- Online presence respects business hours (IST Opens–Closes)
- Completion OTP reduces false “delivered” claims
- Mutual ratings after completed orders
- Public profiles for transparency (no sensitive docs exposed)
- Friendly public URLs without exposing internal UUIDs by default
- Admin can message providers and monitor unread support threads
- Consumer can cancel active requests; quoting providers are notified when needed

---

## Key screens (quick map)

| Audience | Paths |
|----------|--------|
| Guest | `/` (landing + login/register modals via `?login=1` / `?register=1`), `/login` → `/?login=1`, `/register` → `/?register=1`, `/forgot-password`, `/reset-password`, `/p/:slug` (or `/p/:userId`) |
| Consumer | `/consumer/*` (details, providers, inquiries, post, requests, quotes, orders), `/profile`, `/orders/:id` |
| Provider | `/provider/*` (overview, inquiries, support, requests, quote, quotes, orders), `/profile`, `/orders/:id` |
| Admin | `/admin/providers`, `/admin/providers/:userId`, `/admin/consumers`, `/admin/orders`, `/admin/categories`, `/admin/messages`, `/admin/customer-service`, `/admin/config` |
| Customer service | Same as admin **except** `/admin/customer-service` and `/admin/config` |

---

## Demo accounts

| Role | Phone | Password |
|------|-------|----------|
| Admin | `9000000001` | `admin123` |
| Customer service | `9000000004` | `support123` |
| Consumer | `9000000002` | `consumer123` |
| Provider | `9000000003` | `provider123` |

Seeded provider public page example: `/p/quickfix-plumbing`.

---

## Notes for operators

- Restart backend after schema updates so startup migrations apply (`public_slug`, `target_mode`, `request_targets`, `payment_mode`, social URL columns, SMTP table, admin support conversations, `REVOKED` verification status, `CUSTOMER_SERVICE` user role, etc.).
- Re-run `python -m scripts.seed` after role/enum changes to ensure demo accounts exist (including CS `9000000004` / `support123`).
- Existing providers without a slug are backfilled on startup from business name.
- Provider registration/approval emails need **Admin → Config** SMTP enabled with a valid from-address.
- Password reset emails also need SMTP enabled; set `frontend_url` so reset links point at the correct app host.
- Matching quality depends on accurate GPS **and/or** pincode (plus city) on both consumer and provider profiles.
- Order dashboard location quality depends on filled `state` / `city` / `pincode` / `location_label` on user profiles.
- Reverse geocoding uses OpenStreetMap Nominatim; allow outbound network from the API host.
- Provider **Go online** requires APPROVED status and current time within Opens–Closes (IST).
- Staff ops (providers, consumers, orders, categories, messages) use shared `STAFF_ROLES` (`ADMIN` + `CUSTOMER_SERVICE`); Config and CS-agent management stay **Admin-only**.
