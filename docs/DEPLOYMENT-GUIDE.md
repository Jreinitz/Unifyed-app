# Unifyed Deployment Guide

## Architecture Overview

- **Frontend (Next.js):** Vercel at `unifyed.io`
- **API (Fastify):** Railway at `api.unifyed.io`
- **Database:** Supabase Postgres (already configured)
- **Redis:** Railway (addon) or Upstash
- **Auth:** Supabase Auth (already configured)

---

## Step 1: Deploy API to Railway

### 1.1 Create Railway Account
1. Go to https://railway.app
2. Sign up with GitHub
3. Create a new project

### 1.2 Create a New Service
1. Click "New Service" → "GitHub Repo"
2. Select your `unifyed` repository
3. Railway will detect it's a monorepo

### 1.3 Configure the API Service
Set the following in Railway settings:

**Root Directory:**
```
apps/api
```

**Build Command:**
```bash
cd ../.. && pnpm install && pnpm --filter=@unifyed/api build
```

**Start Command:**
```bash
node dist/index.js
```

### 1.4 Add Redis
1. In your Railway project, click "New Service" → "Database" → "Redis"
2. Railway will provision Redis and give you a connection URL

### 1.5 Environment Variables
Add these in Railway (Settings → Variables):

```env
# Server
NODE_ENV=production
API_PORT=3001
API_HOST=0.0.0.0

# URLs (update after you get the Railway domain)
APP_URL=https://unifyed.io
API_URL=https://api.unifyed.io

# Database - Use Supabase connection string
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# Redis - Railway will provide this
REDIS_URL=${REDIS_URL}

# Security
JWT_SECRET=<generate-secure-random-string>
CREDENTIALS_ENCRYPTION_KEY=<generate-64-char-hex-string>

# Supabase
SUPABASE_URL=https://jxdbudjnihbvwovymdti.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Stripe
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_PUBLISHABLE_KEY=<your-stripe-publishable-key>
STRIPE_WEBHOOK_SECRET=<create-webhook-for-production>
STRIPE_CONNECT_CLIENT_ID=ca_TrbEAMRbm8S3yWZ9A0aKGjFzmgQrBGpG

# Platform integrations (add as you get them)
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_SCOPES=read_products,read_inventory,read_orders,write_orders

TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=

RESTREAM_CLIENT_ID=
RESTREAM_CLIENT_SECRET=
```

### 1.6 Custom Domain
1. In Railway, go to Settings → Networking → Custom Domain
2. Add: `api.unifyed.io`
3. Railway will give you a CNAME record to add in GoDaddy

---

## Step 2: Configure GoDaddy DNS

Add these DNS records in GoDaddy:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | api | `<railway-provided-domain>.up.railway.app` | 600 |

Note: Railway will provide the exact CNAME value after you add the custom domain.

---

## Step 3: Deploy Frontend to Vercel

### 3.1 Connect Repository
If not already connected:
1. Go to https://vercel.com
2. Import your `unifyed` repository

### 3.2 Configure Build Settings

**Framework Preset:** Next.js

**Root Directory:**
```
apps/web
```

**Build Command:**
```bash
cd ../.. && pnpm install && pnpm --filter=@unifyed/web build
```

**Output Directory:**
```
.next
```

### 3.3 Environment Variables
Add in Vercel (Settings → Environment Variables):

```env
NEXT_PUBLIC_API_URL=https://api.unifyed.io
NEXT_PUBLIC_SUPABASE_URL=https://jxdbudjnihbvwovymdti.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### 3.4 Domain Configuration
Your `unifyed.io` domain should already be configured. Make sure both:
- `unifyed.io` 
- `www.unifyed.io`

Point to your Vercel deployment.

---

## Step 4: Update OAuth Redirect URIs

After deployment, update these in each platform's developer console:

### Stripe Connect
Dashboard → Settings → Connect → OAuth
```
https://unifyed.io/settings/payments
```

### YouTube (Google Cloud Console)
APIs & Services → Credentials → Your OAuth Client
```
https://api.unifyed.io/connections/youtube/callback
```

### Twitch (Developer Console)
Your App → OAuth Redirect URLs
```
https://api.unifyed.io/connections/twitch/callback
```

### TikTok (Developer Portal)
Your App → Configuration
```
https://api.unifyed.io/connections/tiktok/callback
```

### Restream (Developer Dashboard)
Your App → OAuth Settings
```
https://api.unifyed.io/connections/tools/restream/callback
```

### Shopify (Partner Dashboard)
Your App → App Setup
```
https://api.unifyed.io/connections/shopify/callback
```

---

## Step 5: Create Production Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://api.unifyed.io/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `account.updated`
5. Copy the webhook signing secret to Railway env vars

---

## Step 6: Database Migration

Run migrations against Supabase production database:

```bash
# From your local machine
DATABASE_URL="postgresql://postgres.[ref]:[password]@..." pnpm --filter=@unifyed/db migrate
```

---

## Verification Checklist

After deployment:

- [ ] API health check: `https://api.unifyed.io/health`
- [ ] Frontend loads: `https://unifyed.io`
- [ ] Login/signup works
- [ ] Dashboard loads after login
- [ ] Connections page shows all platforms
- [ ] Stripe Connect OAuth works
- [ ] At least one streaming platform OAuth works

---

## Troubleshooting

### API not starting
- Check Railway logs
- Verify all required env vars are set
- Make sure DATABASE_URL is correct

### OAuth redirects failing
- Verify callback URLs match exactly (including trailing slashes)
- Check API logs for errors
- Ensure HTTPS is working

### CORS errors
- API should allow `https://unifyed.io` origin
- Check `APP_URL` env var is set correctly

### Database connection issues
- Use Supabase connection pooler URL for Railway
- Check if IP allowlist is needed in Supabase
