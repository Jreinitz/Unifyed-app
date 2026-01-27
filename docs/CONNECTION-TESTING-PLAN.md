# Connection Testing Plan

## Overview

This document outlines the testing plan for verifying all platform integrations work correctly before launching.

---

## Platform Credentials Status

| Platform | Client ID | Client Secret | Status |
|----------|-----------|---------------|--------|
| Stripe | ✅ | ✅ | Ready to test |
| Shopify | ✅ | ✅ | Ready to test |
| TikTok | ✅ | ✅ | Ready to test |
| YouTube | ✅ | ✅ | Ready to test |
| Twitch | ✅ | ✅ | Ready to test |
| Restream | ✅ | ✅ | Ready to test |

---

## Connection Testing Order

### Priority 1: Core Commerce (Test First)

#### 1. Stripe Connect
- **Why first**: Required for any sales to work
- **Test steps**:
  1. Click "Connect Stripe" in Connections
  2. Complete OAuth flow with test Stripe account
  3. Verify account appears as connected
  4. Check `metadata` column in profiles table has `stripeAccountId`

#### 2. Restream
- **Why second**: This is your multi-platform streaming hub
- **Test steps**:
  1. Click "Connect" for Restream
  2. Authorize access to your Restream account
  3. Verify channels list is retrieved
  4. Check that platform mapping works

### Priority 2: Streaming Platforms

#### 3. YouTube
- **Test steps**:
  1. Click "Connect" for YouTube
  2. Authorize with your Google/YouTube account
  3. Verify channel info is retrieved
  4. Check live stream status detection

#### 4. Twitch
- **Test steps**:
  1. Click "Connect" for Twitch
  2. Authorize with your Twitch account
  3. Verify user info is retrieved
  4. Check VOD import works

#### 5. TikTok
- **Test steps**:
  1. Click "Connect" for TikTok
  2. Authorize with your TikTok account
  3. Verify user info is retrieved
  4. Check live status detection

### Priority 3: E-commerce

#### 6. Shopify (if you have a store)
- **Test steps**:
  1. Click "Connect" for Shopify
  2. Enter your store URL
  3. Install the app
  4. Verify products sync

---

## Live Test Scenario Plan

### Prerequisites
- [ ] Stripe connected
- [ ] Restream connected (or at least 2 direct platform connections)
- [ ] At least one product/offer created
- [ ] OBS or streaming software ready

### Test Scenario: "Go Live and Make a Sale"

#### Setup Phase
1. Create a test product in dashboard
2. Create an offer for that product (e.g., 20% off)
3. Configure Restream with your platforms
4. Open Command Center in one browser tab

#### Go Live Phase
1. Start streaming via Restream/OBS
2. Watch for stream detection in UI
3. Verify Command Center shows:
   - Live status indicator
   - Viewer count (may be 0 initially)
   - Chat messages (send test messages from platforms)

#### Commerce Phase
1. Pin an offer from Command Center
2. Use "Drop Link" to share in chat
3. Click the link yourself (in incognito)
4. Complete test checkout with Stripe test card
5. Verify:
   - Order appears in dashboard
   - Revenue updates
   - Attribution shows correct platform

#### End Stream Phase
1. Stop streaming
2. Verify stream is recorded as a replay
3. Check analytics updated

---

## OAuth Callback URLs to Configure

For each platform's developer console, ensure these redirect URLs are set:

| Platform | Callback URL |
|----------|--------------|
| Stripe | `http://localhost:3001/api/stripe/connect/callback` |
| Shopify | `http://localhost:3001/api/shopify/callback` |
| TikTok | `http://localhost:3001/api/tiktok/callback` |
| YouTube | `http://localhost:3001/api/youtube/callback` |
| Twitch | `http://localhost:3001/api/twitch/callback` |
| Restream | `http://localhost:3001/api/restream/callback` |

**For Production**, replace `localhost:3001` with your production API URL.

---

## Troubleshooting

### "Provider not enabled" error
- Check that OAuth is configured in platform's developer console
- Verify callback URL matches exactly

### "Invalid client" error
- Double-check Client ID and Secret in .env.local
- Ensure no extra spaces or quotes

### OAuth redirect fails
- Check API server is running on port 3001
- Verify callback URL is registered in platform console

### Connection succeeds but no data
- Check API logs for errors
- Verify scopes/permissions are correct
