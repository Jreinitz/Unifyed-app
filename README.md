# Unifyed

**Commerce OS for Creators** - Turn any moment into a sale.

Unifyed is an API-first, event-driven commerce infrastructure that enables live commerce orchestration and replay monetization for creators.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for Postgres and Redis)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/unifyed.git
cd unifyed

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start infrastructure
docker-compose up -d

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Services

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:3001 | Fastify backend |
| Web | http://localhost:3000 | Next.js frontend |
| Postgres | localhost:5432 | Database |
| Redis | localhost:6379 | Cache & queues |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Surfaces  │     │   Commerce  │     │   Commerce  │
│  (Plugins)  │────▶│    Brain    │────▶│  Backends   │
└─────────────┘     └─────────────┘     └─────────────┘
     │                    │                    │
  • Live               • Catalog            • Shopify
  • Replay             • Offers             • Stripe*
  • Clips              • Inventory          • WooCommerce*
  • Links              • Attribution
  • DMs*               • Checkout
  • Agents*            • Events
```

*Future

## Core Concepts

### Primitives
- **Creator**: A creator account
- **PlatformConnection**: OAuth connections (Shopify, TikTok, YouTube)
- **Product/Variant**: Canonical product catalog
- **Offer**: Decoupled offers (percentage off, fixed price, etc.)
- **ShortLink**: Moment Links with attribution
- **Reservation**: Inventory reservation for oversell prevention
- **AttributionContext**: Tracks source of every sale

### Event-Driven
Every action emits an event to the EventLog. Workers process events asynchronously for automation, analytics, and side effects.

### Surfaces Are Plugins
Live streams, replays, clips, and bio links all use the same primitives and checkout flow. Add new surfaces without changing core commerce logic.

## Repository Structure

```
├── apps/
│   ├── api/           # Fastify API
│   ├── worker/        # BullMQ processors
│   ├── web/           # Next.js frontend
│   └── docs/          # Architecture docs
├── packages/
│   ├── db/            # Drizzle schemas
│   ├── types/         # Zod schemas
│   ├── events/        # Event types
│   ├── integrations/  # Platform adapters
│   └── utils/         # Shared utilities
```

## Commands

```bash
# Development
pnpm dev              # Start all services
pnpm build            # Build all packages
pnpm typecheck        # Type check all packages
pnpm lint             # Lint all packages
pnpm test             # Run tests

# Database
pnpm db:generate      # Generate migrations
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema (dev only)
pnpm db:studio        # Open Drizzle Studio
```

## API Endpoints

### Auth
- `POST /auth/signup` - Create account
- `POST /auth/login` - Login
- `GET /auth/me` - Get current user

### Connections
- `GET /connections` - List platform connections
- `GET /connections/:platform/auth-url` - Get OAuth URL
- `DELETE /connections/:id` - Disconnect platform

### Catalog
- `GET /catalog/products` - List products
- `GET /catalog/products/:id` - Get product
- `POST /catalog/sync` - Trigger sync

### Offers
- `GET /offers` - List offers
- `POST /offers` - Create offer
- `POST /offers/:id/activate` - Activate offer
- `POST /offers/:id/deactivate` - Deactivate offer

### Streams
- `GET /streams` - List streams
- `POST /streams` - Create stream
- `POST /streams/:id/start` - Start stream
- `POST /streams/:id/end` - End stream

### Links
- `GET /links` - List short links
- `POST /links` - Create short link
- `GET /go/:code` - Resolve link (public)

### Orders
- `GET /orders` - List orders
- `GET /orders/:id` - Get order

## License

Private - All rights reserved
