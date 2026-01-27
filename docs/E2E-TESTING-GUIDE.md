# Unifyed E2E Testing Guide

## Overview

This guide walks through testing the complete user journey from signup to making sales during a live stream.

---

## Prerequisites

### 1. Infrastructure

```bash
# Start local Redis (required for queues)
docker-compose up -d redis

# Verify Redis is running
docker ps
```

### 2. Environment Variables

Ensure these are set in `.env.local`:

| Variable | Required | Test Value | Notes |
|----------|----------|------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your project URL | From Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Your anon key | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Your service key | For backend operations |
| `STRIPE_SECRET_KEY` | ✅ | `sk_test_...` | Use test mode |
| `STRIPE_PUBLISHABLE_KEY` | ✅ | `pk_test_...` | Use test mode |
| `STRIPE_CONNECT_CLIENT_ID` | ✅ | `ca_...` | For Connect OAuth |
| `STRIPE_WEBHOOK_SECRET` | ⏸️ | `whsec_...` | Can skip initially |
| `REDIS_URL` | ✅ | `redis://localhost:6379` | Local Docker |
| `RESTREAM_CLIENT_ID` | ⚪ | Your ID | Optional for chat |
| `RESTREAM_CLIENT_SECRET` | ⚪ | Your secret | Optional for chat |

### 3. Start Development Servers

```bash
# Terminal 1: Start API server
pnpm --filter=@unifyed/api dev

# Terminal 2: Start Web app
pnpm --filter=@unifyed/web dev

# Terminal 3: Start Worker (for background jobs)
pnpm --filter=@unifyed/worker dev
```

Access points:
- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **API Health**: http://localhost:3001/health

---

## Testing Checklist

### Phase 1: Authentication

| # | Test | Steps | Expected Result | Status |
|---|------|-------|-----------------|--------|
| 1.1 | Sign Up | Go to `/signup`, enter email/password | Account created, redirected to dashboard | ⬜ |
| 1.2 | Login | Go to `/login`, enter credentials | Logged in, see dashboard | ⬜ |
| 1.3 | Logout | Click logout in sidebar | Redirected to login | ⬜ |
| 1.4 | Session Persistence | Close browser, reopen | Still logged in | ⬜ |

### Phase 2: Dashboard & Navigation

| # | Test | Steps | Expected Result | Status |
|---|------|-------|-----------------|--------|
| 2.1 | Dashboard Home | Navigate to `/dashboard` | See stats cards (may be 0) | ⬜ |
| 2.2 | Sidebar Navigation | Click each nav item | Pages load without error | ⬜ |
| 2.3 | Command Center | Go to `/dashboard/command-center` | Chat panel and stats visible | ⬜ |

### Phase 3: Platform Connections

| # | Test | Steps | Expected Result | Status |
|---|------|-------|-----------------|--------|
| 3.1 | Connections Page | Go to `/dashboard/connections` | See available platforms | ⬜ |
| 3.2 | Stripe Connect | Click connect Stripe | OAuth flow, account linked | ⬜ |
| 3.3 | Restream Connect | Click connect Restream | OAuth flow, account linked | ⬜ |
| 3.4 | Connection Status | After connecting | Shows "Connected" status | ⬜ |

### Phase 4: Products & Offers

| # | Test | Steps | Expected Result | Status |
|---|------|-------|-----------------|--------|
| 4.1 | Products Page | Go to `/dashboard/products` | See product list (empty ok) | ⬜ |
| 4.2 | Create Product | Click "Add Product" | Product created | ⬜ |
| 4.3 | Offers Page | Go to `/dashboard/offers` | See offers list | ⬜ |
| 4.4 | Create Offer | Click "New Offer", fill form | Offer created with product | ⬜ |
| 4.5 | Activate Offer | Toggle offer to "Active" | Status changes | ⬜ |

### Phase 5: Go Live Flow

| # | Test | Steps | Expected Result | Status |
|---|------|-------|-----------------|--------|
| 5.1 | Streams Page | Go to `/dashboard/streams` | See Go Live section | ⬜ |
| 5.2 | Go Live Guide | View "How to Go Live" | Instructions visible | ⬜ |
| 5.3 | Restream Settings | If connected, see RTMP URL/Key | Settings displayed | ⬜ |
| 5.4 | Live Detection | Start stream in OBS via Restream | Stream detected, status updates | ⬜ |

### Phase 6: Command Center (Live)

| # | Test | Steps | Expected Result | Status |
|---|------|-------|-----------------|--------|
| 6.1 | Connect Chat | Click "Connect Chat" | WebSocket connects | ⬜ |
| 6.2 | Chat Messages | Send message from platform | Message appears in UI | ⬜ |
| 6.3 | AI Signals | Viewer asks "how much?" | Buying intent detected | ⬜ |
| 6.4 | Pin Offer | Click pin on offer | Message sent to chat | ⬜ |
| 6.5 | Drop Link | Click drop link | Short link shared in chat | ⬜ |
| 6.6 | Flash Sale | Start flash sale | Announcement sent, timer starts | ⬜ |

### Phase 7: Checkout Flow

| # | Test | Steps | Expected Result | Status |
|---|------|-------|-----------------|--------|
| 7.1 | Click Short Link | Open `unifyed.link/{code}` in browser | Redirects to checkout | ⬜ |
| 7.2 | Stripe Checkout | Complete test payment | Payment succeeds | ⬜ |
| 7.3 | Order Created | Check API/dashboard | Order visible | ⬜ |

### Phase 8: Analytics

| # | Test | Steps | Expected Result | Status |
|---|------|-------|-----------------|--------|
| 8.1 | Analytics Page | Go to `/dashboard/analytics` | Charts and stats visible | ⬜ |
| 8.2 | Revenue Tracking | After test order | Revenue shows in stats | ⬜ |
| 8.3 | Platform Attribution | After test order | Platform shows in breakdown | ⬜ |

---

## Test Data

### Stripe Test Cards
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

Use any future expiry and any CVC.

### Test Restream Account
Create a free account at https://restream.io for testing multi-platform streaming.

---

## Common Issues & Fixes

### "Chat service not initialized"
- Ensure Redis is running: `docker ps`
- Check API logs for connection errors

### "No chat connections available"
- Connect Restream or a platform first
- Check connection status in dashboard

### Stripe OAuth fails
- Verify `STRIPE_CONNECT_CLIENT_ID` is set
- Check callback URL is registered in Stripe dashboard

### WebSocket connection fails
- Check API server is running on port 3001
- Verify `NEXT_PUBLIC_API_URL` is set correctly

---

## Notes

- Testing order: Follow phases sequentially - each builds on the previous
- Use test/sandbox credentials for all integrations
- Check browser console and API logs for errors
- Take notes on UX issues for polish phase
