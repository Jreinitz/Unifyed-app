# Unifyed Architecture

## Overview

Unifyed is a **Commerce Operating System (Commerce OS)** for creators. It's an API-first, event-driven commerce infrastructure that turns any intent moment into a trusted, attributed sale.

The backend/runtime is the product. UI is a thin client.

---

## Core Principles

### 1. API-First
All business logic lives in backend modules behind APIs. UI calls APIs; no domain logic in frontend.

### 2. Event-Driven Spine
Every meaningful action emits an event and writes to EventLog. Async workers process events and run non-blocking automation. Event emission and processing are idempotent.

### 3. Primitives > Features
Core primitives stay surface-agnostic. They work across live, replay, clips, links, DMs, and agents.

### 4. Surfaces Are Plugins
Live, replay, clips, links, DMs, agents are surfaces that produce events and reuse the Commerce Brain. No live-only assumptions.

### 5. Reliability Over Cleverness
- Oversells are unacceptable
- Duplicate events/clicks are expected
- Idempotency and reservations are required

---

## Primitives

| Primitive | Description |
|-----------|-------------|
| `Creator` | A creator account |
| `PlatformConnection` | OAuth connection to Shopify, TikTok, YouTube, etc. |
| `Product` / `Variant` | Canonical product catalog (synced from commerce backends) |
| `Offer` / `OfferProduct` | Decoupled offer engine |
| `InventorySnapshot` / `Reservation` | Inventory state + oversell prevention |
| `AttributionContext` | Platform/stream/surface attribution |
| `CheckoutSession` / `Order` | Checkout state + completed purchases |
| `Stream` / `Replay` / `Moment` | Content primitives |
| `ShortLink` | Moment Links (proto-tokens) |
| `EventLog` | Event spine |

---

## Event Types

### Platform
- `PLATFORM_CONNECTED`
- `PLATFORM_DISCONNECTED`

### Products
- `PRODUCT_SYNCED`
- `PRODUCT_UPDATED`
- `INVENTORY_UPDATED`

### Offers
- `OFFER_CREATED`
- `OFFER_UPDATED`
- `OFFER_ACTIVATED`
- `OFFER_DEACTIVATED`
- `OFFER_EXPIRED`
- `OFFER_DELETED`

### Streams
- `STREAM_CREATED`
- `STREAM_AUTO_DETECTED`
- `STREAM_STARTED`
- `STREAM_ENDED`
- `STREAM_CANCELLED`

### Replays
- `REPLAY_CREATED`
- `REPLAY_AUTO_IMPORTED`
- `REPLAY_PUBLISHED`
- `REPLAY_VIEW`
- `REPLAY_CLICK`

### Checkout
- `CHECKOUT_STARTED`
- `CHECKOUT_REDIRECTED`
- `CHECKOUT_ABANDONED`
- `PURCHASE_COMPLETED`
- `ORDER_UPDATED`

### Inventory
- `RESERVATION_CREATED`
- `RESERVATION_CONFIRMED`
- `RESERVATION_RELEASED`
- `RESERVATION_EXPIRED`

### Link in Bio
- `LINK_IN_BIO_VIEW`
- `LINK_IN_BIO_CLICK`

---

## Flow Diagrams

### Shopify Onboarding
```
Creator → GET /connections/shopify/auth-url?shop=store
       ← Redirect to Shopify OAuth
       → Shopify approves → GET /connections/shopify/callback
       ← Exchange code for token
       → Store encrypted credentials in platform_connections
       → Queue catalog sync job
       ← Redirect to dashboard
```

### Live Commerce Flow
```
1. Creator creates Stream (manual or auto-detected)
2. Creator selects products and activates Offer
3. System generates ShortLink (Moment Link) with attribution
4. Creator pins link in TikTok/YouTube live
5. Viewer clicks → API resolves ShortLink
   → Creates CheckoutSession + reserves inventory
   → Redirects to Shopify checkout
6. Viewer completes purchase on Shopify
7. Shopify webhook → Create Order with attribution
8. Analytics attribute revenue to platform + stream
```

### Replay Monetization Flow
```
1. Stream ends → Replay auto-created
2. Replay page: /r/:id
   - Shows video + moments timeline + buy buttons
   - Each buy button is a ShortLink with replay attribution
3. Viewer lands on replay page
   → Emit REPLAY_VIEW event
4. Viewer clicks buy button
   → Emit REPLAY_CLICK event
   → Same checkout flow as live
5. Purchase attributed to replay surface
```

### Checkout Flow (Detail)
```
GET /go/:code
  ↓
Validate ShortLink (not expired, not revoked, within click limit)
  ↓
Validate Offer (active, within time bounds)
  ↓
Check inventory availability
  ↓
Generate idempotency key (visitor + link + variant)
  ↓
Check for existing CheckoutSession (idempotent)
  ↓
Create CheckoutSession
  ↓
Create Reservation (with TTL)
  ↓
Build Shopify checkout URL
  ↓
Emit CHECKOUT_STARTED event
  ↓
Redirect to Shopify checkout
```

### Reservation Lifecycle
```
CheckoutSession created
  ↓
Reservation created (status: pending, TTL: 15 min)
  ↓
[Option A: Order completed]
  → Shopify webhook fires
  → Reservation status → confirmed
  ↓
[Option B: TTL expires]
  → Worker detects expired reservation
  → Reservation status → expired
  → CheckoutSession status → abandoned
```

---

## Repository Structure

```
/
├── apps/
│   ├── api/           # Fastify API (domain logic)
│   ├── worker/        # BullMQ processors
│   ├── web/           # Next.js (control plane + public pages)
│   └── docs/          # Architecture specs
├── packages/
│   ├── db/            # Drizzle schemas + migrations
│   ├── types/         # Shared Zod schemas
│   ├── events/        # Event types + validators
│   ├── integrations/
│   │   ├── shopify/   # Shopify adapter
│   │   ├── tiktok/    # TikTok adapter
│   │   └── youtube/   # YouTube adapter
│   └── utils/
```

---

## Quality Requirements

### Idempotency
- All mutation endpoints accept idempotency key
- EventLog writes use event ID for deduplication
- Webhook handlers check for existing records
- Workers verify event not already processed

### Reliability
- Reservations prevent oversells via atomic operations
- Webhooks verify signatures before processing
- All BullMQ processors are retry-safe
- Checkout path never blocks on non-critical work

### Adapter Isolation
- Integration packages (Shopify, TikTok, YouTube) contain no business logic
- They only translate between external APIs and our canonical models
- Commerce Brain decides; adapters execute

---

## Future Considerations

### Tier 2 (V1.x)
- Instagram Live integration
- Abandoned cart recovery emails
- Email/SMS integrations (Klaviyo, Postscript)
- Clips surface
- AI moment suggestions

### Tier 3 (V2+)
- WooCommerce adapter
- Stripe direct checkout
- CheckoutTokens (signed JWTs)
- DM commerce
- AI Agent SDK
- Tax calculation
- Analytics pixels
- Affiliate tracking
- Multi-currency
- Creator teams
