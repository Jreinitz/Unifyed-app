# Platform Credentials & Integration Guide

This document outlines all the credentials needed for Unifyed integrations, how to obtain them, and what setup is required.

---

## Quick Status Check

| Platform | Required For | Have Credentials? | Dev Portal |
|----------|--------------|-------------------|------------|
| **Supabase** | Auth | ✅ Yes | [Dashboard](https://supabase.com/dashboard/project/jxdbudjnihbvwovymdti) |
| **Stripe** | Payments | ⚠️ Partial | [Dashboard](https://dashboard.stripe.com) |
| **Restream** | Multi-streaming | ❌ Need to apply | [Developers](https://developers.restream.io) |
| **TikTok** | Live streaming | ❌ Need to apply | [Developers](https://developers.tiktok.com) |
| **YouTube** | Live streaming | ❌ Need to create | [Console](https://console.cloud.google.com) |
| **Twitch** | Live streaming | ❌ Need to create | [Dev Console](https://dev.twitch.tv/console) |
| **Shopify** | E-commerce | ❌ Need to create | [Partners](https://partners.shopify.com) |
| **StreamYard** | Multi-streaming | ❓ Research needed | No public API |
| **OBS** | Streaming | N/A (RTMP) | No API needed |

---

## 1. SUPABASE (Auth) ✅ CONFIGURED

**Status:** Already configured and working

**What we have:**
- `NEXT_PUBLIC_SUPABASE_URL` ✅
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅
- `SUPABASE_URL` ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅

**Dashboard:** https://supabase.com/dashboard/project/jxdbudjnihbvwovymdti

---

## 2. STRIPE (Payments) ⚠️ NEEDS CONNECT SETUP

**Status:** API keys configured, but Connect needs setup

### What we have:
- `STRIPE_SECRET_KEY` ✅ (sk_test_...)
- `STRIPE_PUBLISHABLE_KEY` ✅ (pk_test_...)

### What we need:
- `STRIPE_WEBHOOK_SECRET` ❌ Currently placeholder
- `STRIPE_CONNECT_CLIENT_ID` ❌ Currently placeholder

### How to get missing credentials:

#### Webhook Secret:
1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click "Add endpoint"
3. Enter endpoint URL: `https://your-api-url/webhooks/stripe`
   - For local testing, use [Stripe CLI](https://stripe.com/docs/stripe-cli) or ngrok
4. Select events to listen for:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `account.updated` (for Connect)
5. Copy the signing secret (starts with `whsec_`)

#### Connect Client ID (for creator payouts):
1. Go to [Stripe Dashboard > Connect > Settings](https://dashboard.stripe.com/test/settings/connect)
2. Enable "OAuth for Standard accounts"
3. Set OAuth redirect URI: `http://localhost:3001/payments/connect/callback`
4. Copy the "Client ID" (starts with `ca_`)

### Stripe CLI for local webhook testing:
```bash
# Install
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:3001/webhooks/stripe
```

---

## 3. RESTREAM (Multi-Platform Streaming) ❌ NEED TO APPLY

**What it does:** Allows creators to stream to multiple platforms simultaneously

### Credentials needed:
- `RESTREAM_CLIENT_ID`
- `RESTREAM_CLIENT_SECRET`

### How to get them:

1. **Apply for API access:** https://developers.restream.io
   - This requires approval from Restream
   - Explain your use case (live commerce platform)

2. **Once approved, create an app:**
   - Go to Restream Developer Dashboard
   - Create new application
   - Set OAuth redirect URI: `http://localhost:3001/connections/tools/restream/callback`

3. **API Documentation:** https://developers.restream.io/docs

### Restream API capabilities:
- OAuth authentication
- Get user profile
- List connected channels/platforms
- Get streaming status
- Get RTMP ingest settings
- Real-time chat aggregation via WebSocket

### Timeline: 1-2 weeks for approval typically

---

## 4. TIKTOK (Live Streaming) ❌ NEED TO APPLY

**What it does:** Connect to TikTok for live stream detection and chat

### Credentials needed:
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`

### How to get them:

1. **Create developer account:** https://developers.tiktok.com
2. **Create an app:**
   - App type: "Web"
   - Products needed:
     - Login Kit (for OAuth)
     - Video Kit (for live streams)
3. **Submit for review** (required for production)

### OAuth Redirect URI:
`http://localhost:3001/connections/tiktok/callback`

### Important notes:
- TikTok requires app review before you can access most APIs
- Live streaming APIs have additional requirements
- For chat, we're using `tiktok-live-connector` library (unofficial but works)

### Documentation:
- Login Kit: https://developers.tiktok.com/doc/login-kit-web
- Video Kit: https://developers.tiktok.com/doc/video-kit-overview

### Timeline: 2-4 weeks for review

---

## 5. YOUTUBE (Live Streaming) ❌ NEED TO CREATE

**What it does:** Connect to YouTube for live stream detection and chat

### Credentials needed:
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`

### How to get them:

1. **Go to Google Cloud Console:** https://console.cloud.google.com
2. **Create a new project** (or use existing)
3. **Enable YouTube Data API v3:**
   - APIs & Services > Library
   - Search "YouTube Data API v3"
   - Enable it
4. **Create OAuth credentials:**
   - APIs & Services > Credentials
   - Create Credentials > OAuth client ID
   - Application type: Web application
   - Add authorized redirect URI: `http://localhost:3001/connections/youtube/callback`
5. **Configure OAuth consent screen:**
   - Add scopes: `youtube.readonly`, `youtube.force-ssl`

### Scopes we need:
- `https://www.googleapis.com/auth/youtube.readonly` - Read channel info
- `https://www.googleapis.com/auth/youtube.force-ssl` - Read live chat

### Documentation:
- https://developers.google.com/youtube/v3/getting-started
- https://developers.google.com/youtube/v3/live/docs

### Timeline: Same day (no review for testing)

---

## 6. TWITCH (Live Streaming) ❌ NEED TO CREATE

**What it does:** Connect to Twitch for live stream detection and chat

### Credentials needed:
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

### How to get them:

1. **Go to Twitch Developer Console:** https://dev.twitch.tv/console
2. **Register your application:**
   - Click "Register Your Application"
   - Name: "Unifyed"
   - OAuth Redirect URL: `http://localhost:3001/connections/twitch/callback`
   - Category: "Application Integration"
3. **Get credentials:**
   - Click on your app
   - Copy Client ID
   - Generate a new Client Secret

### Scopes we need:
- `user:read:email` - User email
- `channel:read:stream_key` - Stream info
- `chat:read` - Read chat messages
- `chat:edit` - Send chat messages

### Documentation:
- https://dev.twitch.tv/docs/authentication
- https://dev.twitch.tv/docs/irc

### Timeline: Same day (instant approval)

---

## 7. SHOPIFY (E-commerce) ❌ NEED TO CREATE

**What it does:** Sync products from Shopify stores

### Credentials needed:
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`

### How to get them:

1. **Create Partner account:** https://partners.shopify.com
2. **Create an app:**
   - Apps > Create App
   - Type: Public app or Custom app
3. **Configure app:**
   - App URL: `http://localhost:3000`
   - Allowed redirection URLs: `http://localhost:3001/connections/shopify/callback`
4. **Set required scopes:**
   - `read_products`
   - `read_inventory`
   - `read_orders`
   - `write_orders`

### Documentation:
- https://shopify.dev/docs/apps/getting-started

### Timeline: Same day

---

## 8. STREAMYARD ❓ RESEARCH NEEDED

**Status:** StreamYard does NOT have a public API

### Options:
1. **Skip StreamYard integration** - Focus on Restream which has API
2. **Browser extension approach** - Would require separate extension
3. **Contact StreamYard directly** - Request API access

### Recommendation:
For MVP, focus on Restream as the multi-platform streaming tool. StreamYard can be added later if they open their API.

---

## 9. OBS STUDIO ✅ NO CREDENTIALS NEEDED

**What it does:** Connect via RTMP for advanced streaming

### How it works:
- OBS connects to Restream or platforms directly via RTMP
- We detect streams through Restream API or platform APIs
- No separate OBS integration needed

### What we show users:
- RTMP URL (from Restream or platform)
- Stream key (from Restream or platform)

---

## Priority Order for Setup

### Phase 1: Core (Do Now)
1. ✅ **Supabase** - Already done
2. ⚠️ **Stripe** - Complete webhook + Connect setup
3. 🔴 **YouTube** - Quick to set up, no review needed
4. 🔴 **Twitch** - Quick to set up, instant approval

### Phase 2: Essential (This Week)
5. 🔴 **TikTok** - Apply now, wait for review
6. 🔴 **Restream** - Apply now, wait for approval

### Phase 3: Optional (Later)
7. 🔴 **Shopify** - Only if you have test stores
8. ❌ **StreamYard** - Skip for now (no API)

---

## Callback URLs Summary

For your developer console configurations:

| Platform | Callback URL |
|----------|--------------|
| Stripe Connect | `http://localhost:3001/payments/connect/callback` |
| Stripe Webhook | `http://localhost:3001/webhooks/stripe` |
| Shopify | `http://localhost:3001/connections/shopify/callback` |
| TikTok | `http://localhost:3001/connections/tiktok/callback` |
| YouTube | `http://localhost:3001/connections/youtube/callback` |
| Twitch | `http://localhost:3001/connections/twitch/callback` |
| Restream | `http://localhost:3001/connections/tools/restream/callback` |

**For Production:** Replace `localhost:3001` with your production API URL.

---

## Next Steps

1. **Today:** 
   - Complete Stripe Connect setup
   - Create YouTube OAuth app
   - Create Twitch app

2. **Apply and Wait:**
   - Apply for Restream API access
   - Apply for TikTok developer access

3. **Once approved:**
   - Add credentials to `.env.local`
   - Test each OAuth flow

Would you like me to help you set up any of these platforms?
