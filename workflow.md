# KoshalHaat App Workflow

## Overview

KoshalHaat is a hyper-local marketplace that connects **consumers** with nearby **verified providers** for products and services.

**Stack:** React (Vite) · FastAPI · JWT · PostgreSQL/PostGIS · Redis · WebSockets

**Core goals:**

- discover local providers by category
- send a request to selected providers (**same top-level category**) **or** broadcast nearby
- chat anytime with approved providers (online or offline)
- collect quotes, agree delivery + payment
- complete orders with OTP
- build trust with mutual ratings and provider verification

---

## Roles

| Role | Who | Home after login |
|------|-----|------------------|
| **Consumer** | Needs a product/service nearby | `/` (landing, signed-in) |
| **Provider** | Offers products/services | `/provider/overview` |
| **Admin** | Full platform ops: providers, consumers, orders, categories, messages, **customer service agents**, Config/SMTP | `/admin/providers` |
| **Customer service** (`CUSTOMER_SERVICE`) | Same ops as admin **except** Config and managing other CS agents | `/admin/providers` |

Guests and signed-in **consumers** use `/` (public landing). Providers and staff are redirected to their role home. On the landing header, signed-in consumers see their name and logout; **My Account** is in the side / hamburger nav.

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
Discover providers on landing Home (search / category) ──► Chat & ask
        │
        ├─ Targeted: select 1+ same top-level category ──► Send a request (modal)
        └─ Broadcast request: nearby verified providers in a category
                │
                ▼
Provider sees lead ──► Chat & ask ──► Send quote
                │
                ▼
Consumer accepts quote (delivery mode + payment mode)
                │
                ▼
Order: IN_PROGRESS → (optional DISPUTED/CANCELLED) → COMPLETED (OTP)
                │
                ▼
Consumer shares OTP → Provider completes → both rate each other
```

---

## Public / guest flow

1. Open `/` — landing with full-bleed hero and floating search pad (**city** + query + detect-location).
2. After search, category browse hides; results show **matching providers only** (select checkboxes + **Send a request**).
3. Without searching, **Popular categories** appear (hide after a completed search).
4. Search providers (`GET /providers/public-search`) matches:
   - **Name** — business name, owner name, username
   - **Mobile** — phone / alternate phone (digit-friendly)
   - **Category / subcategory** — name or slug (parent↔child links included)
   - **Slug** — provider public slug and category slug  
   Blank or keyword search scopes to the **whole selected city** (city-wide radius + city-name matches), sorted **nearest first**, and each result includes **distance_km** shown on the card.
5. **City selection** — served cities for now: **Bhubaneswar**, **Sambalpur**, **Jharsuguda**.
   - If a city is **already saved**, the city popup does **not** auto-show on landing open
   - On landing open with **no** saved city: if GPS is unavailable/denied → city popup with searchable dropdown
   - If GPS resolves and the city is **not** in the list → popup to pick a supported city (skipped when a saved city already applies)
   - If GPS city matches the list → that city is applied automatically
   - City searchable dropdown appears first on the landing search pad (sets default coords for the city)
6. Browse category catalog (`GET /providers/public-catalog`).
7. Open a provider’s public page at `/p/:slug` (friendly shop-name URL; legacy `/p/:userId` still works).
8. To chat or request, guest is prompted to **register / log in** (modals on the landing page, or deep links `/?login=1` / `/?register=1`).
9. Landing header **Log in** / **Register** open the same auth modals without leaving `/`.
10. **Send a request** (from search selection) opens a modal for consumers; guests are asked to log in first (draft kept in `sessionStorage`). Selected providers must share the **same top-level category** — otherwise a popup: *Messages can be sent only to the same category.*

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
- Unauthenticated access to protected routes sends the user to `/?login=1`.
- **Log out** returns to the public landing `/` **without** auto-opening Sign in or Select city modals (logout nav flag). Intentional **Sign in** afterward still opens the login modal as usual.
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

- Full name, phone, email, password (all required)
- **City / locality** and **Pincode** — always required; auto-filled from GPS via reverse geocoding when the modal opens
- **Location** status — local place name with coordinates, e.g. `Indiranagar 1st Stage · 12.97840, 77.64080`
- Reverse geocode prefers **local** names (neighbourhood / suburb) over generic admin labels, and also fills **state** when available

**Provider-only sections:**

- Business / shop name (required)
- **GSTIN** (required, 15-character)
- About, offerings, categories, and offer kind can be completed later on **My profile**

After provider submit: pending-review message stays in the modal; **login blocked** until admin approval. Consumer signup signs in immediately and stays on the landing page as logged in.

Transactional emails (when Admin SMTP is enabled) are sent for registration, provider status changes, and password reset — see **Transactional email** below.

---

## Transactional email

Emails use Admin → **Config** SMTP (`AppSmtpConfig`). Sends are best-effort: if SMTP is disabled, incomplete, or delivery fails, the API flow still succeeds and the miss is logged.

Templates live in `backend/app/services/email_templates/` (paired `html/` + `text/` files, wrapped by `html/_layout.html`).

### 1. Registration

| Audience | When | Template key(s) | Subject (approx.) |
|----------|------|-----------------|-------------------|
| **Consumer** | Self-register on landing (`POST /auth/register`) if email provided | `registration_consumer` | Welcome to KoshalHaat |
| **Provider** | Self-register or admin **Add provider** left as Pending | `registration_provider` | Thank you for registering with KoshalHaat |
| **Customer service** | Admin creates agent (Pending) | `registration_customer_service_pending` | Your KoshalHaat customer service account was created |
| **Customer service** | Admin creates agent already approved, or later **Approve** / **Re-approve** | `registration_customer_service_approved` | Your KoshalHaat customer service account is ready |

Provider email is required at register. Consumer email is optional (no email → no send). CS agents always have an email.

### 2. Provider approve / revoke / re-approve

Triggered from staff verify actions (`POST /providers/{id}/verify`) and from admin create-provider when **Approve immediately** is checked.

| Event | Template key | Notes |
|-------|--------------|--------|
| **Approve** (from Pending) | `provider_approved` | Also posts Admin messages + live toast |
| **Re-approve** (from Revoked / Rejected) | `provider_reapproved` | Same in-app notify path |
| **Revoke** (from Approved) | `provider_revoked` | Marketplace locked; profile + Admin messages remain |

### 3. Password reset

`POST /auth/forgot-password` emails a role-specific template when the account is active and has an email:

| Role | Template key |
|------|--------------|
| Consumer | `password_reset_consumer` |
| Provider | `password_reset_provider` |
| Customer service | `password_reset_customer_service` |
| Admin | `password_reset_admin` |

Reset link: `{frontend_url}/reset-password?token=…` (default expiry 30 minutes).

---

## Consumer workflow

### Sidebar sections

| Route | Purpose |
|-------|---------|
| `/consumer/details` | **My Account** — profile summary → Edit profile |
| `/consumer/inquiries` | **Recent inquiries** — chats updated in the last 30 days; delete chat |
| `/consumer/post` | **Broadcast request** — notify nearby verified providers in a category |
| `/consumer/requests` | **My requests** — ACTIVE requests only (+ cancel; **Broadcast request** → `/consumer/post`) |
| `/consumer/requests/:id` | Quotes for one request; accept deal |
| `/consumer/quotes` | **Received Quotes** |
| `/consumer/orders` | **Orders** — completed deals + cancelled requests → `/orders/:id` |

Also: `/` for signed-in consumer home (landing + search); `/profile` for full contact/address edit (vertical accordion sections).

### 1. Register and location

Consumer signs up with role, name, phone, password, city, pincode, and GPS when available.

- Device GPS stored when available; city/pincode auto-filled from coordinates
- City and pincode remain editable
- Valid 6-digit pincode is required

### 2. Complete profile (`/profile`)

Vertical accordion sections (one open at a time; **Contact** open by default):

1. **Contact** — name, email, alternate mobile
2. **Address & location** — address lines, city, state, pincode, map location (coords + area label)
3. **Business / shop details** — providers only (see Provider onboarding)
4. **Upload documents** — providers only
5. **eKYC** — providers only

Shared fields:

- Contact: email, alternate phone
- Address: address lines, city, **state** (auto-filled from GPS when possible), pincode
- **Detect location** (with location icon) fills coords, place label, city, state, pincode
- Fields are a **single-column vertical list** (no side-by-side pairs)
- **Save** shows a popup: **Profile Updated Successfully**

### 3. Discover providers (landing Home)

Provider discovery lives on **`/`** (landing Home search / category browse), not a consumer dashboard section. Signed-in consumers use the same flow: search or browse, open `/p/:slug`, **Chat & ask**, or select providers for a targeted **Send a request**. Visiting `/consumer/providers` redirects to `/consumer/details`.

### 4. Chat before requesting

Inquiry chat is **not** tied to a request/order.

- Consumer can open multiple 1:1 chats
- New chats require the provider to be **approved** (online status does **not** block starting or continuing chat)
- Messages persist; live delivery via WebSocket when the other party is connected
- **Recent inquiries** lists chats with activity in the **last 30 days**
- Consumer can **Delete chat** (in-app confirm popup)
- UI: shared sleek chat panel (avatar header, timed bubbles, pill compose) — **overlay** for Chat & ask / quote chat; **inline** for inquiry inboxes and order chat

### 5. Broadcast request (`/consumer/post`)

Nav label and page title: **Broadcast request**. Also reachable from **My requests → Broadcast request**.

Fields: category, title, details, optional attachments, **Search City** (same searchable city list as Home; defaults to the city chosen on the landing page).

Always **broadcasts** to verified nearby providers in that category near the selected city (geo ~5 km, with city pincode). There is no “who should receive it” chooser on this page.

**Targeted sends** use **Send a request** from landing Home search selection (modal), not this page.

On successful create, the app navigates to **`/consumer/requests`**.

### 5b. Send a request (modal)

Opened from landing Home search selection.

- Requires one or more selected providers that share the **same top-level category**
- Consumer picks/adjusts category, adds providers by name, describes the need, optional attachments
- Submits as a **targeted** request (`target_provider_ids`)
- Guests: draft saved → login → modal reopens after sign-in

### 6. My requests (`/consumer/requests`)

Shows **ACTIVE** open requests only (fulfilled / locked deals are hidden here and live under **Orders**).

Per card:

- Search by title, description, category, pincode
- Meta chips, attachments, **View quotes**
- Quote-waiting badge when quotes exist
- **Cancel** on active requests (`POST /requests/{id}/close`):
  - No pending quotes → confirm popup → cancel → success; card moves to **Orders** as a cancelled request
  - Pending quotes → reason popup → providers notified via inquiry chat + WS `request_cancelled`

### 7. Quotes and accept (`/consumer/requests/:id` · **Received Quotes**)

While waiting, consumer can **Chat** with quoting providers (sleek overlay; icon beside provider name). Provider name links to `/p/{id}`. **Verified** badge and rating appear beside the name; **Accept** sits next to price.

When accepting a quote, consumer chooses:

- **Delivery / fulfillment**
  - `PROVIDER_DELIVERY`
  - `CONSUMER_PICKUP`
  - `HOME_SERVICE`
- **Payment mode**
  - `CASH` · `UPI` · `CARD` · `BANK_TRANSFER` · `OTHER`

Accepting locks the deal → creates an **Order** (`IN_PROGRESS`), marks request `FULFILLED`, rejects sibling quotes, creates **REJECTED** order rows for losing providers (shown in their Orders list), notifies them over websocket (`quote_rejected`), and shows the **completion OTP** on the request quotes screen (accepted quote + deal-locked banner) until handover.

### 8. Orders (`/consumer/orders`)

Combines:

- Accepted / completed order deals → `/orders/:id`
- **Cancelled requests** (from My requests cancel flow) as **Cancelled Order** cards

### 9. Order completion (`/orders/:id`)

Statuses:

| Status | Meaning |
|--------|---------|
| `CONFIRMED` | Legacy / unused for new accepts (older deals) |
| `IN_PROGRESS` | Deal accepted; work / delivery underway |
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
| `/provider/overview` | Hero, KPIs, hours-derived Online/Offline, location & storefront |
| `/provider/support` | **Admin messages** (support threads; unread badge) |
| `/provider/requests` | **Incoming requests** (targeted + nearby broadcast); excludes already-quoted; 15s poll on this tab; **Send quote** opens modal |
| `/provider/quotes` | **My sent quotes** — card UI; filter All / Pending / Accepted / Upcoming; search; **Chat**, edit pending, **Complete** with OTP; completed deals leave this list |
| `/provider/orders` | Orders → `/orders/:id` |

Also: `/profile` for business onboarding (vertical accordion sections). There is **no** Consumer inquiries nav item; `/provider/inquiries` redirects to overview. Legacy `/provider/quote` redirects to Incoming requests. Chat still opens from requests/quotes.

**Limited / revoked access:** if verification is `REVOKED` (or rejected after login allowance), sidebar is limited to **Overview**, **Admin messages**, and **My profile**. Marketplace routes redirect to overview.

### 1. Register

Provider registration (modal) requires:

- account details (name, business name, phone, email, password) — all required
- city / locality + pincode (GPS auto-fill, editable) — required
- **GSTIN** (required, 15-character)

About, offerings, categories, and offer kind are optional at signup and can be filled later on **My profile**.

A unique **public slug** is created from the business / shop name (e.g. `quickfix-plumbing`; duplicates get `-2`, `-3`, …).

After submit, the provider sees:

> Thank you for registration, your account is being currently reviewed. Please keep checking email from us in next 24hrs.

**Login is blocked** until an admin (or customer service agent) approves the account (`PENDING` / `REJECTED` cannot sign in).

Transactional emails (when Admin SMTP is enabled): see **Transactional email** (registration, approve / re-approve / revoke).

### 2. Onboarding (`/profile`)

Same vertical accordion layout as consumer profile. Providers see:

1. **Contact**
2. **Address & location**
3. **Business / shop details**
4. **Upload documents**
5. **eKYC**

Required for verification / marketplace readiness:

- Business / shop name (changing it regenerates the public slug if needed)
- Offer kind: Product / Service / Both
- Categories & subcategories
- **About** (short description)
- **What you offer** (detailed offerings)
- Opening / closing hours (**IST**) — drive Online/Offline status after approval
- GST certificate (document upload)
- Max travel radius
- Optional: **Website**, **Instagram**, **YouTube**

Account stays `PENDING` until admin approves.

### 3. Overview (`/provider/overview`)

Layout:

1. **Hero** — business mark, name, Verified + rating, owner/offer line, Online/Offline status pill with hours chip + categories; **Edit profile** (icon on ≤960px). No manual Go online/offline toggle.
2. **Verification banners** when pending / rejected / revoked (prompt to set Opens–Closes when approved but hours missing)
3. **KPI strip** — Incoming requests, Open orders, Quotes sent (links to those routes when not limited; accent on incoming requests)
4. **Vertical accordions** (one open at a time; **Storefront** first and open by default):
   - **Storefront** — public URL tray (copy + open) + shortcuts grid (marketplace shortcuts hidden when limited; My profile + Admin messages remain)
   - **Location & reach** — Map / Area / Radius chips + Quick update form (Detect + Save; single-column fields)

**Online presence is hours-derived (IST):**

- Online when the provider is **APPROVED** and current time is within Opens–Closes; Offline otherwise (missing/invalid hours → Offline)
- Stored `is_online` is synced from those hours; there is no manual online toggle in the UI
- Consumers and matching see this effective online status

Only **APPROVED** providers appear Online during open hours and receive live leads. Inquiry chat is allowed with approved providers even when Offline.

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

### 5. Incoming requests (`/provider/requests`)

Nav label: **Incoming requests** (not a separate Submit quote page). While this tab is open, the feed polls every **15s**.

Feed includes:

- **Broadcast** requests that geo/pincode-match the provider
- **Targeted** requests that explicitly include this provider
- Excludes requests this provider has **already quoted** (those appear under **My sent quotes**)

Per lead:

1. **Chat & ask** — clarify with the consumer  
2. **Send quote** — opens a **modal** for price, ETA (days), message, optional attachments; after submit the lead leaves this list  

### 6. My sent quotes (`/provider/quotes`)

Card list of quotes the provider has sent (completed deals with a `COMPLETED` order leave this list and live under **Orders**).

- Filters: **All / Pending / Accepted / Upcoming** (with counts)
- Search by request title, consumer, message, status, or price
- Per card: **Chat** (overlay), **Edit** (pending), **Complete** with OTP when an open order exists, link to order when accepted

### 7. Fulfill order

After consumer accepts:

- Chat on the order (or Complete with OTP from **My sent quotes**)
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
- **Verification documents** (GST number; replace GST, government ID, business registration files)

**APIs:** `PATCH /admin/providers/{user_id}` · `POST /admin/providers/{user_id}/documents?doc_type=`

### Customer service agents (`/admin/customer-service`) — **admin only**

Sidebar nav link **Customer service agents** appears for **Admin** only (not for CS agents).

| Capability | Detail |
|------------|--------|
| **List** | All users with role `CUSTOMER_SERVICE` |
| **Search** | Name, phone, email, or status (`PENDING` / `APPROVED` / `REVOKED`) |
| **Create agent** | Form: full name, phone, email, temporary password; optional **Approve immediately**; sends CS registration email (pending or ready) |
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

Consumers browsing “online” providers see **effective online** status (APPROVED + within Opens–Closes business hours IST).

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

| Chat | When | Linked to | UI |
|------|------|-----------|-----|
| **Inquiry chat** | Before (and alongside) requests | Consumer ↔ Provider | Sleek panel (overlay or inline) |
| **Order chat** | After quote accepted | Specific `order_id` | Same sleek panel (inline on `/orders/:id`) |
| **Admin support chat** | Admin ↔ provider support | `AdminConversation` | Same sleek panel |

Rules:

- Inquiry chat may start with **offline** approved providers (not limited to online)
- Order chat compose is disabled when the order is completed or cancelled
- Real-time: WebSockets (+ Redis pub/sub for multi-instance fan-out); panels also poll messages periodically

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

`IN_PROGRESS` (on accept) → `COMPLETED` (via OTP); optional `DISPUTED` / `CANCELLED`; sibling losers get `REJECTED`

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
- Pending provider accounts cannot appear Online or quote
- Admin can **revoke** approved providers (limited nav + Admin messages notice)
- Admin **approve** and **re-approve** also notify the provider (Admin messages + email when SMTP enabled)
- Online/Offline is derived from Opens–Closes business hours (IST), not a manual toggle
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
| Consumer | `/consumer/*` (details, inquiries, post, requests, quotes, orders), `/profile`, `/orders/:id` |
| Provider | `/provider/*` (overview, support, requests, quotes, orders), `/profile`, `/orders/:id` |
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

## Database dump / restore

PostgreSQL 16 + PostGIS (`postgis/postgis:16-3.4` in `docker-compose.yml`). Default connection (also in `backend/app/core/config.py`):

| Item | Value |
|------|-------|
| Host / port | `localhost:5432` |
| Database | `localsync` |
| User / password | `localsync` / `localsync` |

A schema + data snapshot of the **public** app tables lives at **`backend/scripts/koshalhaat.sql`**. It includes current local/dev rows (users, categories, providers, requests, quotes, orders, chats). PostGIS `spatial_ref_sys` and **SMTP config row data** are excluded so the file stays small and does not contain SMTP credentials. User password hashes are included so demo logins still work after restore. Re-enter SMTP in Admin → Config after restore if you need mail.

**Prerequisite:** Docker Desktop running, then from repo root wait until `db` is healthy:

```powershell
docker compose up -d
docker compose ps
```

### Export a fresh dump

Do **not** redirect `pg_dump` with PowerShell `>` (that writes UTF-16 and corrupts the file). Dump inside the container, then copy out.

**Windows (PowerShell)** — preferred; writes a restore-ready file (PostGIS `CREATE EXTENSION`, and it strips `DROP SCHEMA public` so PostGIS objects stay):

```powershell
.\backend\scripts\dump_db.ps1
```

**Equivalent** (any OS). After copy, keep `CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;` near the top, and **remove** `DROP SCHEMA IF EXISTS public` / `CREATE SCHEMA public` if `pg_dump` added them:

```bash
docker compose exec -T db pg_dump -U localsync -d localsync --schema=public --exclude-table=spatial_ref_sys --exclude-table-data=app_smtp_config --no-owner --no-acl --clean --if-exists -f /tmp/koshalhaat.sql
docker compose cp db:/tmp/koshalhaat.sql ./backend/scripts/koshalhaat.sql
docker compose exec -T db rm -f /tmp/koshalhaat.sql
```

### Restore / import

`--clean --if-exists` in the dump **drops existing public app tables** in `localsync` (not the PostGIS schema). Use only on a local/dev database.

```powershell
docker compose up -d
docker compose cp .\backend\scripts\koshalhaat.sql db:/tmp/koshalhaat.sql
docker compose exec -T db psql -U localsync -d localsync -v ON_ERROR_STOP=1 -f /tmp/koshalhaat.sql
```

Then start the API as usual (`uvicorn …`). You do **not** need `python -m scripts.seed` after a successful restore unless you want seed.py to add any accounts/categories missing from the snapshot.

---

## Notes for operators

- Restart backend after schema updates so startup migrations apply (`public_slug`, `target_mode`, `request_targets`, `payment_mode`, social URL columns, SMTP table, admin support conversations, `REVOKED` verification status, `CUSTOMER_SERVICE` user role, etc.).
- Re-run `python -m scripts.seed` after role/enum changes to ensure demo accounts exist (including CS `9000000004` / `support123`), **or** restore `backend/scripts/koshalhaat.sql` (see **Database dump / restore**) if you want the saved local snapshot instead of a seed-only database.
- Existing providers without a slug are backfilled on startup from business name.
- Provider / consumer / CS registration emails and provider approve·revoke·re-approve emails need **Admin → Config** SMTP enabled with a valid from-address.
- Password reset emails also need SMTP enabled; set `frontend_url` so reset links point at the correct app host. Role-specific templates are under `backend/app/services/email_templates/`.
- Matching quality depends on accurate GPS **and/or** pincode (plus city) on both consumer and provider profiles.
- Order dashboard location quality depends on filled `state` / `city` / `pincode` / `location_label` on user profiles.
- Reverse geocoding uses OpenStreetMap Nominatim; allow outbound network from the API host.
- Provider Online status requires APPROVED status and current time within Opens–Closes (IST); set hours in My profile.
- Staff ops (providers, consumers, orders, categories, messages) use shared `STAFF_ROLES` (`ADMIN` + `CUSTOMER_SERVICE`); Config and CS-agent management stay **Admin-only**.
