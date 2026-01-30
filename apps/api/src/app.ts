import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { env } from './config/env.js';
import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { eventsPlugin } from './plugins/events.js';
import { errorHandler } from './plugins/error-handler.js';

// Routes
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { connectionsRoutes } from './routes/connections.js';
import { catalogRoutes } from './routes/catalog.js';
import { offersRoutes } from './routes/offers.js';
import { streamsRoutes } from './routes/streams.js';
import { replaysRoutes } from './routes/replays.js';
import { linksRoutes } from './routes/links.js';
import { checkoutRoutes } from './routes/checkout.js';
import { ordersRoutes } from './routes/orders.js';
import { webhooksRoutes } from './routes/webhooks.js';
import { publicRoutes } from './routes/public.js';
import { metricsRoutes } from './routes/metrics.js';
import { paymentsRoutes } from './routes/payments.js';
import { liveSessionsRoutes } from './routes/live-sessions.js';
import { analyticsRoutes } from './routes/analytics.js';
import { chatRoutes, chatWebSocketRoutes } from './routes/chat.js';
import { chatCommerceRoutes } from './routes/chat-commerce.js';
import { chatAIRoutes } from './routes/chat-ai.js';
import { sessionTemplatesRoutes } from './routes/session-templates.js';

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'development'
      ? {
          level: 'debug',
          transport: { target: 'pino-pretty' },
        }
      : {
          level: 'info',
        },
  });

  // Security
  await app.register(helmet);
  
  // CORS - allow multiple frontend origins in production
  const allowedOrigins = new Set([
    env.APP_URL,
    'https://unifyed-app-web.vercel.app',
    'https://app.unifyed.io',
  ].filter(Boolean));
  
  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin || env.NODE_ENV !== 'production') {
        callback(null, true);
        return;
      }
      // Check if origin is in allowed list
      if (allowedOrigins.has(origin)) {
        callback(null, origin);
        return;
      }
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Cookies and JWT
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // WebSocket support
  await app.register(websocket);

  // Custom plugins
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(eventsPlugin);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(connectionsRoutes, { prefix: '/connections' });
  await app.register(catalogRoutes, { prefix: '/catalog' });
  await app.register(offersRoutes, { prefix: '/offers' });
  await app.register(streamsRoutes, { prefix: '/streams' });
  await app.register(replaysRoutes, { prefix: '/replays' });
  await app.register(linksRoutes, { prefix: '/links' });
  await app.register(checkoutRoutes, { prefix: '/go' });
  await app.register(ordersRoutes, { prefix: '/orders' });
  await app.register(webhooksRoutes, { prefix: '/webhooks' });
  await app.register(publicRoutes, { prefix: '/public' });
  await app.register(metricsRoutes, { prefix: '/metrics' });
  await app.register(paymentsRoutes, { prefix: '/payments' });
  await app.register(liveSessionsRoutes, { prefix: '/live-sessions' });
  await app.register(analyticsRoutes, { prefix: '/analytics' });
  await app.register(chatRoutes, { prefix: '/chat' });
  await app.register(chatWebSocketRoutes, { prefix: '/chat' });
  await app.register(chatCommerceRoutes, { prefix: '/chat-commerce' });
  await app.register(chatAIRoutes, { prefix: '/chat-ai' });
  await app.register(sessionTemplatesRoutes, { prefix: '/session-templates' });

  return app;
}
